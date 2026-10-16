import type {CurriculumDiscovery, CurriculumQueries} from "../modules/curriculum/public";
import type {VocabularyUseCases} from "../modules/vocabulary/public";
import type {GrammarUseCases} from "../modules/grammar/public";
import type {AssessmentUseCases, DraftUseCases} from "../modules/assessment/public";
import type {ProgressCommands, ProgressTransferUseCases, ProgressUseCases} from "../modules/learning-progress/public";
import type {LocalizationUseCases} from "../modules/localization/public";
import type {SpeechUseCases} from "../modules/speech/public";
import type {DashboardUseCases} from "./dashboard-service";
import type {StudySessionUseCases} from "./study-session-service";
import type {VocabularyStudyUseCases} from "./vocabulary-study-service";

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
