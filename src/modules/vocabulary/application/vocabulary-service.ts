import type { VocabularyUseCases } from "./contracts";
import { filterWords, type Word } from "../domain/word";
export class VocabularyService implements VocabularyUseCases {
  search(
    words: readonly Word[],
    query: string,
    meaning: (id: string) => string,
  ) {
    return filterWords(words, query, meaning);
  }
}
