import type {VocabularyUseCases, Word} from "../modules/vocabulary/public";
import {matchesWordFilter, type Progress, type WordFilter} from "../modules/learning-progress/public";
import type {LocalizationUseCases} from "../modules/localization/public";
import type {Locale, TranslationCatalog} from "../shared/kernel/text-types";

export interface VocabularyStudyUseCases {
    search(words: readonly Word[], texts: TranslationCatalog, progress: Progress, locale: Locale, query: string, filter: WordFilter): Word[];
}

export class VocabularyStudyService implements VocabularyStudyUseCases {
    constructor(private readonly vocabulary: VocabularyUseCases, private readonly localization: LocalizationUseCases) {
    }

    search(words: readonly Word[], texts: TranslationCatalog, progress: Progress, locale: Locale, query: string, filter: WordFilter): Word[] {
        return this.vocabulary.search(words, query, id => this.localization.text(texts, id, locale))
            .filter(word => matchesWordFilter(progress, word.progressId ?? word.id, filter));
    }
}
