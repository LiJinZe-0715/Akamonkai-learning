import type { Catalog, View, Book, Unit } from "../domain/catalog";
import type { Word } from "../../vocabulary/public";
import type { Article } from "../../grammar/public";
import type { Question } from "../../assessment/public";
import type { TranslationCatalog } from "../../../shared/kernel/types";
import type { CatalogLesson, StudyDestination } from "../domain/catalog-queries";
export interface LessonBundle {
  id: string;
  bookId: string;
  titleJa: string;
  groupJa: string;
  words: Word[];
  articles: Article[];
  questions: Question[];
  texts: TranslationCatalog;
}
export interface CurriculumRepository {
  catalog(): Promise<Catalog>;
  lesson(id: string): Promise<LessonBundle>;
}
export interface LessonSelection { book: Book; unit: Unit; view: View; }
export interface CurriculumQueries {
  catalog(): Promise<Catalog>;
  lesson(id: string, view: View): Promise<LessonBundle>;
  resolve(catalog: Catalog, unitId: string | null, view: string | null): LessonSelection | null;
}
export interface CurriculumDiscovery {
  lessons(catalog: Catalog): CatalogLesson[];
  destination(catalog: Catalog, unitId: string, view: string): StudyDestination | undefined;
  search(catalog: Catalog, bookId: string, query: string): Book[];
  adjacent(book: Book, unitId: string, view: View): { unit: Unit; view: View; direction: "previous" | "next" }[];
}
