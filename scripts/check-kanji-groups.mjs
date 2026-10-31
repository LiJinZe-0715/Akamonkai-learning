import assert from "node:assert/strict";

export async function checkKanjiGroups({load, catalog, units, ui, render}) {
    const {groupKanjiCatalog} = load("src/modules/curriculum/domain/kanji-groups.ts");
    const {CurriculumService} = load("src/modules/curriculum/application/curriculum-service.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const {KanjiScreen} = load("src/modules/curriculum/presentation/pages/KanjiScreen.tsx");
    const {createStudyServices} = load("src/bootstrap/create-study-services.ts");
    const {DashboardService} = load("src/application/dashboard-service.ts");
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {CatalogScreen} = load("src/modules/curriculum/presentation/pages/CatalogScreen.tsx");
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
    for (const [bookId, sizes] of [["kanji-daily", Array(27).fill(20)], ["kanji-700", Array(10).fill(20)]]) {
        const book = grouped.books.find(book => book.id === bookId);
        const original = catalog.books.find(book => book.id === bookId);
        assert.deepEqual(book.units.map(unit => unit.characters.length), sizes);
        assert.deepEqual(book.units.flatMap(unit => unit.characters), original.units, "Preserve every source character exactly once and in order");
        const legacyCharacters = original.units.slice(0, 2);
        const legacyProgress = {
            ...emptyProgress(),
            lastVisited: {unitId: legacyCharacters[0].id, view: "words", at: "2026-10-26T00:00:00Z"},
            results: Object.fromEntries(legacyCharacters.map((character, index) => [character.id + ":reading-test",
                {correct: index, total: index + 1, at: "2026-10-26T00:00:00Z"}]))
        };
        const overview = new DashboardService(service).overview(grouped, legacyProgress, "all", "", 10);
        assert(overview.resuming, "Legacy character visits must remain resumable");
        assert.equal(overview.active.unit.id, legacyCharacters[0].id);
        assert.equal(service.resolve(grouped, overview.active.unit.id, overview.active.view).view, "kanji");
        assert.deepEqual(overview.recent.map(item => item.unit.id), legacyCharacters.map(character => character.id),
            "Keep each historical character score separate from its new group");
        for (const [index, item] of overview.recent.entries()) {
            assert.equal(item.unit.titleJa, legacyCharacters[index].titleJa);
            assert.deepEqual(item.result, legacyProgress.results[item.unit.id + ":reading-test"]);
        }
        const legacyHtml = render(CatalogScreen, {catalog: grouped}, "zh", legacyProgress);
        for (const character of legacyCharacters) assert(legacyHtml.includes(character.titleJa), "Show the original character title in recent practice");
        for (const [index, unit] of book.units.entries()) {
            assert.deepEqual(unit.views, ["kanji", "reading-test"]);
            for (const character of unit.characters) {
                for (const view of character.views) {
                    assert.equal(service.destination(grouped, character.id, view).unit.id, character.id);
                    assert.equal(service.destination(catalog, character.id, view).view, view);
                }
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
    await assert.rejects(service.lesson("kanji-daily-group-28", "kanji"), /Unavailable/);
    assert.throws(() => service.resolve(grouped, "kanji-new-501", "kanji"), /Unavailable/);
    assert.equal(service.destination(grouped, "kanji-new-501", "kanji"), undefined);
    assert.equal(service.destination(grouped, "kanji-intermediate-1", "grammar-test"), undefined);
    assert.equal(catalog.books.find(book => book.id === "kanji-daily").units.length, 540, "Grouping must not mutate source metadata");
    console.log(JSON.stringify({kanjiGroups: 37, charactersPerGroup: "20", groupedStudyAndTests: "passed", legacyRoutesAndTextbookIsolation: "passed"}));
}
