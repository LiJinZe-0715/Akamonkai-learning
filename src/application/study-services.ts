import type {Theme} from "../shared/kernel/theme";
import type {CurriculumDiscovery, CurriculumQueries} from "../modules/curriculum/public";
import type {ReadingUseCases} from "../modules/reading/public";
import type {AssessmentUseCases, DraftUseCases} from "../modules/assessment/public";
import type {ProgressCommands, ProgressTransferUseCases, ProgressUseCases} from "../modules/learning-progress/public";
import type {LocalizationUseCases} from "../modules/localization/public";
import type {SpeechUseCases} from "../modules/speech/public";
import type {SearchUseCases} from "../modules/search/public";
import type {DashboardUseCases} from "./dashboard-service";
import type {StudySessionUseCases} from "./study-session-service";
import type {VocabularyStudyUseCases} from "./vocabulary-study-service";

export interface AppearanceUseCases {
    current(): Theme;

    /** 用户是否手动选过；没选过时跟随系统变化。 */
    hasPreference(): boolean;

    select(theme: Theme): void;
}

/** 文字倍率：`null` 表示没调过，交回 CSS 的默认倍率。 */
export interface TextScaleUseCases {
    current(): number | null;

    select(scale: number | null): void;
}

/** 稳定的应用层边界：展示层只依赖接口，不依赖具体服务。 */
export interface StudyServices {
    appearance: AppearanceUseCases;
    textScale: TextScaleUseCases;
    curriculum: CurriculumQueries & CurriculumDiscovery;
    reading: ReadingUseCases;
    assessment: AssessmentUseCases;
    drafts: DraftUseCases;
    progress: ProgressUseCases;
    localization: LocalizationUseCases;
    speech: SpeechUseCases;
    dashboard: DashboardUseCases;
    studySession: StudySessionUseCases;
    vocabularyStudy: VocabularyStudyUseCases;
    progressTransfer: ProgressTransferUseCases;
    progressCommands: ProgressCommands;
    search: SearchUseCases;
}
