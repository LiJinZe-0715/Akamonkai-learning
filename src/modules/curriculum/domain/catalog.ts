export type View =
  | "words"
  | "word-test"
  | "grammar"
  | "grammar-test"
  | "kanji"
  | "reading-test"
  | "katakana";
export const studyViews: readonly View[] = ["words", "word-test", "grammar", "grammar-test", "kanji", "reading-test", "katakana"];
export function isStudyView(value: unknown): value is View {
  return typeof value === "string" && studyViews.some(view => view === value);
}
export interface Unit {
  id: string;
  titleJa: string;
  groupJa: string;
  wordCount: number;
  questionCount: number;
  views: View[];
}
export interface Book {
  id: string;
  titleJa: string;
  subtitleJa: string;
  units: Unit[];
}
export interface Catalog {
  schemaVersion: 1;
  siteTitleJa: string;
  books: Book[];
}
