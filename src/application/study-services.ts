import type { CurriculumQueries, CurriculumDiscovery } from "../modules/curriculum/public";
import type { VocabularyUseCases } from "../modules/vocabulary/public";
import type { GrammarUseCases } from "../modules/grammar/public";
import type { AssessmentUseCases, DraftUseCases } from "../modules/assessment/public";
import type { ProgressUseCases } from "../modules/learning-progress/public";
import type { LocalizationUseCases } from "../modules/localization/public";
import type { SpeechUseCases } from "../modules/speech/public";
import type { ProgressTransferUseCases, ProgressCommands } from "../modules/learning-progress/public";
import type { DashboardUseCases } from "./dashboard";
import type { StudySessionUseCases } from "./study-session";
import type { VocabularyStudyUseCases } from "./vocabulary-study";
/** Stable application boundary. Presentation depends on interfaces, not concrete services. */
export type Theme = "light" | "dark";
export interface StudyServices {
  appearance: { current(): Theme; select(theme: Theme): void };
  curriculum: CurriculumQueries & CurriculumDiscovery;
  vocabulary: VocabularyUseCases;
  grammar: GrammarUseCases;
  assessment: AssessmentUseCases;
  drafts: DraftUseCases;
  progress: ProgressUseCases;
  localization: LocalizationUseCases;
  speech: SpeechUseCases;
  dashboard: DashboardUseCases;
  session: StudySessionUseCases;
  wordStudy: VocabularyStudyUseCases;
  progressTransfer: ProgressTransferUseCases;
  progressCommands: ProgressCommands;
}
