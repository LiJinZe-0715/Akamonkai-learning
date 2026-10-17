import assert from "node:assert/strict";

export async function checkKanjiGroups({load, catalog, units, ui, render}) {
    const {groupKanjiCatalog} = load("src/modules/curriculum/domain/kanji-groups.ts");
    const {CurriculumService} = load("src/modules/curriculum/application/curriculum-service.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const {KanjiScreen} = load("src/modules/curriculum/presentation/pages/KanjiScreen.tsx");
    const {createStudyServices} = load("src/bootstrap/create-study-services.ts");
    const grouped = groupKanjiCatalog(catalog);
    assert.deepEqual(groupKanjiCatalog(grouped), grouped, "Grouping must be idempotent");
    const reads = {};
    const service = new CurriculumService(new HttpCurriculumRepository(async resource => {
        reads[resource] = (reads[resource] ?? 0) + 1;
        if (resource === "/content/catalog.json") return structuredClone(catalog);
        const bookId = resource.slice("/content/".length, -".json".length);
        return {schemaVersion: 1, bookId, units: units.filter(unit => unit.bookId === bookId)};
    }));
    assert.deepEqual(await service.catalog(), grouped);
    const sessions = createStudyServices(ui).session;
    const assessment = createStudyServices(ui).assessment;
    for (const [bookId, sizes] of [["kanji-daily", Array(9).fill(60)], ["kanji-700", [60, 60, 40]]]) {
        const book = grouped.books.find(book => book.id === bookId);
        const original = catalog.books.find(book => book.id === bookId);
        assert.deepEqual(book.units.map(unit => unit.characters.length), sizes);
        assert.deepEqual(book.units.flatMap(unit => unit.characters), original.units, "Preserve every source character exactly once and in order");
        for (const [index, unit] of book.units.entries()) {
            assert.deepEqual(unit.views, ["kanji", "reading-test"]);
            for (const character of unit.characters) {
                for (const [legacy, mode] of [[null, "kanji"], ["words", "kanji"], ["kanji", "kanji"], ["word-test", "reading-test"], ["reading-test", "reading-test"]]) {
                    const destination = service.resolve(grouped, character.id, legacy);
                    assert.equal(destination.unit.id, unit.id);
                    assert.equal(destination.view, mode);
                }
                assert(service.search(grouped, bookId, character.titleJa)[0].units.some(match => match.id === unit.id), "Searching a character must find its containing group");
            }
            const group = await service.lesson(unit.id, "kanji");
            assert.deepEqual(group.characters.map(character => character.id), unit.characters.map(character => character.id));
            assert.equal(group.words.length, unit.wordCount);
            assert.equal(group.questions.length, unit.questionCount);
            assert.deepEqual(service.adjacent(book, unit.id, "kanji").map(item => item.unit.id),
                book.units.filter((_, position) => Math.abs(position - index) === 1).map(item => item.id));
            for (const locale of ["zh", "en"]) {
                const html = render(KanjiScreen, {lesson: group}, locale);
                assert.equal((html.match(/class="kanji-character"/g) || []).length, sizes[index]);
                assert.equal((html.match(/class="kanji-cell"/g) || []).length, sizes[index]);
                assert.equal((html.match(/class="word-headword"/g) || []).length, group.words.length, "Keep vocabulary beside its character");
                const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
                assert.equal(new Set(ids).size, ids.length, "Grouped character content must have unique DOM IDs");
                for (const character of group.characters) {
                    assert(html.includes('href="#character-' + character.id + '"'));
                    assert(html.includes('id="character-' + character.id + '"'));
                    for (const word of character.words) assert(html.includes('data-word-id="' + word.id + '"'));
                }
                assert(!html.includes('class="vocabulary-toolbar"'), "Do not repeat a vocabulary toolbar for every character");
                assert(!html.includes('class="speech-controls"'), "Keep shared voice settings out of each character card");
            }
            const questions = sessions.source(group, "reading-test");
            assert(questions.length > group.questions.length, "The single test must include reading and vocabulary meaning questions");
            assert.equal(new Set(questions.map(question => question.id)).size, questions.length);
            const answers = Object.fromEntries(questions.map(question => [question.id, question.options ? question.accepted[0] : question.acceptedText[0]]));
            const result = assessment.grade(questions, answers);
            assert(result.complete && result.correct === questions.length, "Every grouped test question must be answerable");
            await assert.rejects(service.lesson(unit.id, "words"), /Unavailable/);
        }
    }
    assert.equal(reads["/content/kanji-daily.json"], 1);
    assert.equal(reads["/content/kanji-700.json"], 1);
    await assert.rejects(service.lesson("kanji-daily-group-10", "kanji"), /Unavailable/);
    assert.throws(() => service.resolve(grouped, "kanji-new-461", "kanji"), /Unavailable/);
    assert.equal(catalog.books.find(book => book.id === "kanji-daily").units.length, 540, "Grouping must not mutate source metadata");
    console.log(JSON.stringify({kanjiGroups: 12, charactersPerGroup: "60; final group 40", groupedStudyAndTests: "passed", legacyRoutesAndTextbookIsolation: "passed"}));
}
