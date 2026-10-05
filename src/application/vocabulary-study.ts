import type { LessonBundle } from "../modules/curriculum/public";
import type { VocabularyUseCases, Word } from "../modules/vocabulary/public";
import { matchesWordFilter, type Progress, type WordFilter } from "../modules/learning-progress/public";
import type { LocalizationUseCases } from "../modules/localization/public";
import type { Locale } from "../shared/kernel/types";

export interface VocabularyStudyUseCases {
  search(lesson: LessonBundle, progress: Progress, locale: Locale, query: string, filter: WordFilter): Word[];
}
export class VocabularyStudyService implements VocabularyStudyUseCases {
  constructor(private readonly vocabulary: VocabularyUseCases, private readonly localization: LocalizationUseCases) {}
  search(lesson: LessonBundle, progress: Progress, locale: Locale, query: string, filter: WordFilter): Word[] {
    return this.vocabulary.search(lesson.words, query, id => this.localization.text(lesson.texts, id, locale))
      .filter(word => matchesWordFilter(progress, word.progressId ?? word.id, filter));
  }
}
