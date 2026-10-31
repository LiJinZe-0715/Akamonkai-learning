import fs from "node:fs";
import path from "node:path";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const kanjiBookIds = ["kanji-daily", "kanji-700"];
export const libraryLevelIds = ["beginner", "jlpt-grammar", "intermediate"];
const courseFiles = (directory) => fs.readdirSync(directory, {withFileTypes: true})
    .flatMap((entry) => entry.isDirectory()
        ? courseFiles(path.join(directory, entry.name))
        : entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : [])
    .sort();

export function compileUnits() {
    const words = read("data/content/vocabulary.json"),
        texts = read("data/content/localization/learning.json"),
        aliases = read("data/content/word-aliases.json");
    const lessons = courseFiles("data/content/units").map((file) => {
        const source = read(file),
            refs = new Set();
        const bookDirectory = path.relative("data/content/units", file).split(path.sep)[0];
        if (bookDirectory !== source.bookId)
            throw Error("Course must be inside its textbook directory: " + file);
        const {wordRefs, ...lesson} = source;
        lesson.words = wordRefs.map(({wordId, ...overrides}) => {
            if (!words[wordId]) throw Error("Missing word " + wordId);
            const word = {...words[wordId], ...overrides};
            return aliases[word.id] ? {...word, progressId: aliases[word.id]} : word;
        });
        const scan = (x) => {
            if (typeof x === "string" && texts[x]) refs.add(x);
            else if (Array.isArray(x)) x.forEach(scan);
            else if (x && typeof x === "object") Object.values(x).forEach(scan);
        };
        scan(lesson);
        lesson.texts = Object.fromEntries([...refs].map((id) => [id, texts[id]]));
        return lesson;
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
                    return {
                        id: unit.id,
                        titleJa: unit.titleJa,
                        groupJa: unit.groupJa,
                        wordCount: unit.words.length,
                        questionCount: unit.questions.length,
                        views: [...views],
                    };
                }),
            };
        }),
    };
}
