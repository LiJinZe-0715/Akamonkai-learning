import assert from "node:assert/strict";
import fs from "node:fs";
import {kanjiBookIds} from "./compile-content.mjs";

export async function checkKanji({load, catalog, units}) {
    const {decodeKanji} = load("src/modules/curriculum/infrastructure/curriculum-content-decoder.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const {filterCatalog, adjacentLessons} = load("src/modules/curriculum/domain/catalog-queries.ts");
    const {buildVocabularyQuestions} = load("src/modules/assessment/domain/vocabulary-questions.ts");
    const {normalizeAnswer} = load("src/modules/assessment/domain/assessment.ts");
    const sources = kanjiBookIds.map(bookId => JSON.parse(fs.readFileSync("data/content/" + bookId + ".json", "utf8")));
    const kanji = units.filter(unit => ["kanji-daily", "kanji-700"].includes(unit.bookId));
    assert(!fs.existsSync("data/content/kanji.json"), "Textbooks must not share a merged source file");
    for (const [index, source] of sources.entries()) {
        assert.equal(source.schemaVersion, 1);
        assert.equal(source.bookId, kanjiBookIds[index]);
        assert(source.units.every(unit => unit.bookId === source.bookId), "Mixed textbook content");
    }
    assert.deepEqual(sources.map(source => source.units.length), [540, 200]);
    const numbered = bookId => kanji.filter(unit => unit.bookId === bookId).map(unit => Number(unit.id.split("-").at(-1)));
    assert.deepEqual(numbered("kanji-daily"), Array.from({length: 540}, (_, i) => i + 1));
    assert.deepEqual(numbered("kanji-700"), Array.from({length: 200}, (_, i) => i + 301));
    const photos = sources.flatMap(source => source.units).filter(unit => unit.source);
    assert(photos.every(unit => unit.bookId === "kanji-daily"), "Daily kanji photos must stay in their textbook");
    assert.equal(photos.length, 210);
    assert.equal(new Set(photos.map(unit => unit.source.image)).size, 68);
    assert.equal(photos.flatMap(unit => unit.words).length, 474);
    assert.equal(photos.flatMap(unit => unit.questions).length, 474);
    assert.equal(kanji.filter(unit => unit.bookId === "kanji-daily" && Number(unit.id.split("-").at(-1)) >= 211).flatMap(unit => unit.words).length, 863);
    assert.equal(kanji.filter(unit => unit.bookId === "kanji-700").flatMap(unit => unit.words).length, 555);
    assert.equal(kanji.flatMap(unit => unit.questions).filter(question => question.id.startsWith("kanji.new.practice.")).length, 0);
    for (const unit of photos) {
        assert(/^kanji\/\d+\.jpg$/u.test(unit.source.image), "Invalid source photo: " + unit.id);
        assert(unit.source.strokes > 0);
        assert.equal(unit.source.number, Number(unit.id.split("-").at(-1)));
    }
    for (const unit of kanji) {
        assert.equal(unit.articles.length, 1);
        const article = unit.articles[0];
        assert(/^\p{Script=Han}$/u.test(article.titleJa));
        assert(unit.titleJa.endsWith(" " + article.titleJa));
        assert(unit.words.length > 0 && unit.words.every(word => word.id.startsWith(article.id + ".word.")), "Mixed character vocabulary: " + unit.id);
        for (const word of unit.words) {
            // Existing lessons also teach 気分 alongside 気持ち and わかります alongside 知ります.
            const related = {"kanji.intermediate.220.word.2": "気分", "kanji.intermediate.223.word.1": "わかります"};
            assert(word.wordJa.includes(article.titleJa) || related[word.id] === word.wordJa, "Unrelated word: " + word.id);
            const question = unit.questions.find(question => question.id === word.id + ".reading");
            assert(question?.prompt[0].ja.includes(word.wordJa));
            assert(question.acceptedText.some(answer => normalizeAnswer(answer) === normalizeAnswer(word.readingJa)), "Reading answer differs from vocabulary: " + word.id);
        }
        const descriptor = catalog.books.flatMap(book => book.units).find(item => item.id === unit.id);
        assert.equal(descriptor.views.includes("word-test"), buildVocabularyQuestions(unit.words, id => unit.texts[id].zh, id => unit.texts[id].en).length > 0);
    }
    const daily = catalog.books.find(book => book.id === "kanji-daily");
    for (const id of ["kanji-intermediate-19", "kanji-intermediate-184"]) {
        const unit = kanji.find(unit => unit.id === id);
        for (const word of unit.words.filter(word => unit.words.some(other => other.wordJa === word.wordJa && other.readingJa !== word.readingJa))) {
            const question = unit.questions.find(question => question.id === word.id + ".reading");
            assert(question.prompt[0].ja.includes("「" + word.wordJa + "」"), "Ambiguous readings need sentence context");
            assert(!question.prompt[0].ja.includes("["), "Reading questions must not reveal furigana");
        }
    }
    assert.deepEqual(adjacentLessons(daily, "kanji-intermediate-210", "words").map(item => item.unit.id), ["kanji-intermediate-209", "kanji-intermediate-211"]);
    assert.deepEqual(filterCatalog(catalog, "kanji-daily", "漢字 016 中")[0].units.map(unit => unit.id), ["kanji-intermediate-16"]);
    const bundles = Object.fromEntries(kanjiBookIds.map(bookId => [bookId, {schemaVersion: 1, bookId, units: kanji.filter(unit => unit.bookId === bookId)}]));
    for (const bookId of kanjiBookIds) assert.equal(decodeKanji(bundles[bookId], bookId).size, bundles[bookId].units.length);
    const bundle = bundles["kanji-daily"], firstUnit = bundle.units[0];
    assert.throws(() => decodeKanji({...bundle, schemaVersion: 2}, bundle.bookId), /schema/);
    assert.throws(() => decodeKanji(bundle, "kanji-700"), /identity mismatch/);
    assert.throws(() => decodeKanji({...bundle, units: [firstUnit, firstUnit]}, bundle.bookId), /duplicate/);
    assert.throws(() => decodeKanji({...bundle, units: [bundles["kanji-700"].units[0]]}, bundle.bookId), /invalid kanji textbook/);
    assert.throws(() => decodeKanji({...bundle, units: [{...firstUnit, articles: [firstUnit.articles[0], {...firstUnit.articles[0], id: "extra"}]}]}, bundle.bookId), /one kanji/);
    const reads = {"kanji-daily": 0, "kanji-700": 0};
    const repository = new HttpCurriculumRepository(async resource => {
        const bookId = kanjiBookIds.find(bookId => resource === "/content/" + bookId + ".json");
        assert(bookId, "Kanji must load from its textbook's own JSON: " + resource);
        reads[bookId]++;
        if (bookId === "kanji-daily" && reads[bookId] === 1) throw Error("Temporary outage");
        if (bookId === "kanji-daily" && reads[bookId] === 2) return {schemaVersion: 99};
        return structuredClone(bundles[bookId]);
    });
    await assert.rejects(repository.lesson("kanji-intermediate-1"), /outage/);
    const intermediate = await repository.lesson("kanji-new-460");
    await assert.rejects(repository.lesson("kanji-intermediate-1"), /schema/);
    const [first, second, repeated] = await Promise.all([
        repository.lesson("kanji-intermediate-1"), repository.lesson("kanji-intermediate-2"), repository.lesson("kanji-intermediate-1"),
    ]);
    assert.equal(first, repeated);
    assert.equal(second.id, "kanji-intermediate-2");
    assert.equal((await repository.lesson("kanji-new-460")), intermediate, "One textbook's failure must not clear the other's cache");
    assert.equal((await repository.lesson("kanji-new-301")).id, "kanji-new-301");
    await assert.rejects(repository.lesson("kanji-intermediate-999"), /Unavailable/);
    assert.deepEqual(reads, {"kanji-daily": 3, "kanji-700": 1}, "Requests and retry caches must remain separate for each textbook");
    console.log(JSON.stringify({kanji: "passed", separateTextbooks: 2, singleCharacterUnits: 700, sourcePhotos: 68, newVocabulary: 474, textbookIsolationAndRetry: "passed"}));
}
