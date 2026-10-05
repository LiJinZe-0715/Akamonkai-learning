export type { LessonBundle, CurriculumQueries, CurriculumDiscovery, LessonSelection } from "./application/contracts";
// Legacy display-only export; new UI callers use presentation/index or its own data module.
export { viewTitles } from "./presentation/data/views";
export type { Catalog, Book, Unit, View } from "./domain/catalog";
export type { CatalogLesson, StudyDestination } from "./domain/catalog-queries";
