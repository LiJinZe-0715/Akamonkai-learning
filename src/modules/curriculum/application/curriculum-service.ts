import type {Book, Catalog, View} from "../domain/catalog";
import {Curriculum} from "../domain/curriculum";
import type {CurriculumDiscovery, CurriculumQueries, CurriculumRepository} from "./contracts";
import {adjacentLessons, catalogLessons, filterCatalog, findDestination} from "../domain/catalog-queries";
import {groupKanjiBook, groupKanjiCatalog} from "../domain/kanji-groups";

export class CurriculumService implements CurriculumQueries, CurriculumDiscovery {
    constructor(private readonly repository: CurriculumRepository) {
    }

    catalog() {
        return this.repository.catalog().then(groupKanjiCatalog);
    }

    lessons(catalog: Catalog) {
        return catalogLessons(groupKanjiCatalog(catalog));
    }

    destination(catalog: Catalog, unitId: string, view: string) {
        return findDestination(groupKanjiCatalog(catalog), unitId, view);
    }

    search(catalog: Catalog, bookId: string, query: string) {
        return filterCatalog(groupKanjiCatalog(catalog), bookId, query);
    }

    adjacent(book: Book, unitId: string, view: View) {
        return adjacentLessons(groupKanjiBook(book), unitId, view);
    }

    async lesson(id: string, view: View) {
        const curriculum = new Curriculum(await this.catalog());
        const {book, unit} = curriculum.select(id, view);
        if (unit.characters) {
            const characters = await Promise.all(unit.characters.map(character => this.repository.lesson(character.id)));
            return {
                id, bookId: book.id, titleJa: unit.titleJa, groupJa: unit.groupJa,
                words: characters.flatMap(character => character.words),
                articles: characters.flatMap(character => character.articles),
                questions: characters.flatMap(character => character.questions),
                texts: Object.assign({}, ...characters.map(character => character.texts)),
                characters,
            };
        }
        return this.repository.lesson(id);
    }

    resolve(catalog: Catalog, unitId: string | null, view: string | null) {
        if (!unitId) return null;
        const grouped = groupKanjiCatalog(catalog);
        const group = grouped.books.flatMap(book => book.units).find(unit =>
            unit.characters && (unit.id === unitId || unit.characters.some(character => character.id === unitId)));
        // Old character links open the containing group, retaining the selected study/test mode.
        if (group) return new Curriculum(grouped).select(group.id,
            view === null || view === "words" || view === "kanji" ? "kanji" : view === "word-test" ? "reading-test" : view);
        return new Curriculum(grouped).select(unitId, view);
    }
}
