import type { Book, Catalog, View } from "../domain/catalog";
import { Curriculum } from "../domain/curriculum";
import type { CurriculumRepository, CurriculumQueries, CurriculumDiscovery } from "./contracts";
import { catalogLessons, findDestination, filterCatalog, adjacentLessons } from "../domain/catalog-queries";
export class CurriculumService implements CurriculumQueries, CurriculumDiscovery {
  constructor(private readonly repository: CurriculumRepository) {}
  catalog() { return this.repository.catalog(); }
  lessons(catalog: Catalog) { return catalogLessons(catalog); }
  destination(catalog: Catalog, unitId: string, view: string) { return findDestination(catalog, unitId, view); }
  search(catalog: Catalog, bookId: string, query: string) { return filterCatalog(catalog, bookId, query); }
  adjacent(book: Book, unitId: string, view: View) { return adjacentLessons(book, unitId, view); }
  async lesson(id: string, view: View) {
    const curriculum = new Curriculum(await this.catalog());
    curriculum.select(id, view);
    return this.repository.lesson(id);
  }
  resolve(catalog: Catalog, unitId: string | null, view: string | null) {
    return unitId ? new Curriculum(catalog).select(unitId, view) : null;
  }
}
