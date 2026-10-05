import type { Book, Catalog, Unit, View } from "./catalog";

export interface CatalogLesson { book: Book; unit: Unit; }
export interface StudyDestination extends CatalogLesson { view: View; }
export function catalogLessons(catalog: Catalog): CatalogLesson[] {
  return catalog.books.flatMap(book => book.units.map(unit => ({ book, unit })));
}
export function findDestination(catalog: Catalog, unitId: string, view: string): StudyDestination | undefined {
  const lesson = catalogLessons(catalog).find(item => item.unit.id === unitId && item.unit.views.some(mode => mode === view));
  return lesson ? { ...lesson, view: view as View } : undefined;
}
export function filterCatalog(catalog: Catalog, bookId: string, query: string): Book[] {
  const search = query.trim().toLowerCase();
  return catalog.books.filter(book => bookId === "all" || book.id === bookId)
    .map(book => ({ ...book, units: book.units.filter(unit =>
      [unit.titleJa, unit.groupJa, book.titleJa, book.subtitleJa].some(text => text.toLowerCase().includes(search))) }))
    .filter(book => book.units.length > 0);
}
export function adjacentLessons(book: Book, unitId: string, view: View): { unit: Unit; view: View; direction: "previous" | "next" }[] {
  const current = book.units.findIndex(unit => unit.id === unitId);
  // Preserve catalog order and select the first enabled view when the requested one is unavailable.
  return book.units.flatMap((unit, index) => index === current - 1 || index === current + 1
    ? [{ unit, view: unit.views.includes(view) ? view : unit.views[0], direction: index < current ? "previous" as const : "next" as const }]
    : []);
}
