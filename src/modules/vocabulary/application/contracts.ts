import type { Word } from "../domain/word";
export interface VocabularyUseCases { search(words: readonly Word[], query: string, meaning: (id: string) => string): Word[]; }
