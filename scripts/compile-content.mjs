import fs from "node:fs";
import path from "node:path";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const kanjiBookIds = ["kanji-daily", "kanji-700"];
export const libraryLevelIds = ["beginner", "jlpt-grammar", "intermediate"];
// Characters of a group are studied as kanji cards plus a reading test, never as
// a grammar page, so their views are fixed instead of being catalogued.
export const characterViews = ["kanji", "reading-test"];
// Catalogs and the build only need counts, so a group never ships the full
// character content on the index route.
export const characterSummary = (character) => ({
    id: character.id,
    titleJa: character.titleJa,
    groupJa: character.groupJa,
    wordCount: character.words.length,
    questionCount: character.questions.length,
    views: [...characterViews],
});
// A character group is one catalog entry but many routes: anything walking units
// has to see the characters as units too.
export const flattenUnits = (units) => units.flatMap(unit => unit.characters ?? [unit]);
const courseFiles = (directory) => fs.readdirSync(directory, {withFileTypes: true})
    .flatMap((entry) => entry.isDirectory()
        ? courseFiles(path.join(directory, entry.name))
        : entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : [])
    .sort();

export function compileUnits() {
    const words = read("data/content/vocabulary.json"),
        texts = read("data/content/localization/learning.json"),
        aliases = read("data/content/word-aliases.json");
    // A course file holds one lesson, or a character bundle: the characters of one
    // lesson plus the group unit that collects them. Characters keep their own words
    // and texts, so they are normalized without touching the shared vocabulary.
    const normalize = (source) => {
        const refs = new Set();
        const {wordRefs, ...lesson} = source;
        // A course either lists word references into the shared vocabulary or
        // carries its own words (characters do), never both: silently preferring
        // one would hide a stale reference.
        if (wordRefs && lesson.words?.length)
            throw Error("Course has both words and wordRefs: " + source.id);
        lesson.words = wordRefs
            ? wordRefs.map(({wordId, ...overrides}) => {
                if (!words[wordId]) throw Error("Missing word " + wordId);
                const word = {...words[wordId], ...overrides};
                return aliases[word.id] ? {...word, progressId: aliases[word.id]} : word;
            })
            : lesson.words ?? [];
        const scan = (x) => {
            if (typeof x === "string" && texts[x]) refs.add(x);
            else if (Array.isArray(x)) x.forEach(scan);
            else if (x && typeof x === "object") Object.values(x).forEach(scan);
        };
        scan(lesson);
        lesson.texts = {...lesson.texts, ...Object.fromEntries([...refs].map((id) => [id, texts[id]]))};
        return lesson;
    };
    const lessons = courseFiles("data/content/units").flatMap((file) => {
        const source = read(file);
        const bookDirectory = path.relative("data/content/units", file).split(path.sep)[0];
        if (bookDirectory !== source.bookId)
            throw Error("Course must be inside its textbook directory: " + file);
        if (!Array.isArray(source.units)) return [normalize(source)];
        if (!source.group) throw Error("Character bundle needs its group unit: " + file);
        const characters = source.units.map(normalize);
        return [{
            ...source.group,
            bookId: source.bookId,
            articles: [], words: [], questions: [], texts: {},
            characters,
        }];
    });
    // The reference owns all its text and examples. Never resolve it against
    // textbook vocabulary or localization data, or regenerate it from lessons.
    const kanji = kanjiBookIds.flatMap(bookId => {
        const book = read("data/content/" + bookId + ".json");
        if (book.schemaVersion !== 1 || book.bookId !== bookId || !Array.isArray(book.units))
            throw Error("Invalid kanji textbook: " + bookId);
        return book.units.map(({source, ...unit}) => {
            if (unit.bookId !== bookId) throw Error("Kanji unit belongs to another textbook: " + unit.id);
            return unit;
        });
    });
    return [...lessons, ...kanji, read("data/content/reference/verbs.json")];
}

// The source catalog declares book order, library level, unit order and the
// study views each unit exposes. Titles, group names and the word/question
// counts are derived from the compiled unit content, so they are never
// maintained twice.
export function buildCatalog(units = compileUnits()) {
    const source = read("data/content/catalog.json");
    const byId = new Map(units.map(unit => [unit.id, unit]));
    return {
        schemaVersion: source.schemaVersion,
        siteTitleJa: source.siteTitleJa,
        books: source.books.map(book => {
            if (!libraryLevelIds.includes(book.level)) throw Error("Unknown library level: " + book.id);
            return {
                id: book.id,
                titleJa: book.titleJa,
                subtitleJa: book.subtitleJa,
                level: book.level,
                units: book.units.map(entry => {
                    const unit = byId.get(entry.id);
                    if (!unit) throw Error("Catalogued unit is missing: " + entry.id);
                    const views = entry.views;
                    if (!views?.length) throw Error("Study views are required for: " + entry.id);
                    const characters = unit.characters?.map(characterSummary);
                    const wordCount = characters
                        ? characters.reduce((sum, character) => sum + character.wordCount, 0)
                        : unit.words.length;
                    const questionCount = characters
                        ? characters.reduce((sum, character) => sum + character.questionCount, 0)
                        : unit.questions.length;
                    return {
                        id: unit.id,
                        titleJa: unit.titleJa,
                        groupJa: unit.groupJa,
                        wordCount,
                        questionCount,
                        views: [...views],
                        ...(characters ? {characters} : {}),
                    };
                }),
            };
        }),
    };
}
