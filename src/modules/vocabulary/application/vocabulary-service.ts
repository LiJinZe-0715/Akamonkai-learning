import type {VocabularyUseCases} from "./contracts";
import type {Word} from "../domain/word";

export class VocabularyService implements VocabularyUseCases {
    search(
        words: readonly Word[],
        query: string,
        meaning: (id: string) => string,
    ): Word[] {
        const needle = query.trim().normalize("NFKC").toLowerCase();
        if (!needle) return [...words];
        return words.filter(word => [word.word, word.reading, meaning(word.meaningId)]
            .some(text => text.normalize("NFKC").toLowerCase().includes(needle)));
    }
}
