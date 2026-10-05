import type { TextId } from "../../../shared/kernel/types";
export interface Word {
  id: string;
  progressId?: string;
  wordJa: string;
  readingJa: string;
  meaningId: TextId;
  noteId?: TextId;
}
export function filterWords(
  words: readonly Word[],
  query: string,
  meaning: (id: TextId) => string,
): Word[] {
  const needle = query.trim().toLocaleLowerCase();
  return words.filter(
    (w) =>
      !needle ||
      [w.wordJa, w.readingJa, meaning(w.meaningId)].some((s) =>
        s.toLocaleLowerCase().includes(needle),
      ),
  );
}
