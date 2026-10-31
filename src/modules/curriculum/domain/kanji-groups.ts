import type {Book, Catalog, Unit} from "./catalog";

export const kanjiCharactersPerLesson = 20;

export function groupKanjiBook(book: Book): Book {
    if (!book.units.some(unit => unit.views.includes("kanji")) || book.units.some(unit => unit.characters)) return book;
    const units: Unit[] = [];
    for (let offset = 0; offset < book.units.length; offset += kanjiCharactersPerLesson) {
        const characters = book.units.slice(offset, offset + kanjiCharactersPerLesson);
        const number = offset / kanjiCharactersPerLesson + 1;
        const first = characters[0].titleJa.split(" ")[1];
        const last = characters[characters.length - 1].titleJa.split(" ")[1];
        units.push({
            id: book.id + "-group-" + number,
            titleJa: "第" + number + "課（" + first + "–" + last + "）",
            groupJa: "漢字・語彙",
            wordCount: characters.reduce((total, unit) => total + unit.wordCount, 0),
            questionCount: characters.reduce((total, unit) => total + unit.questionCount, 0),
            views: ["kanji", "reading-test"],
            characters,
        });
    }
    return {...book, units};
}

export function groupKanjiCatalog(catalog: Catalog): Catalog {
    return {...catalog, books: catalog.books.map(groupKanjiBook)};
}
