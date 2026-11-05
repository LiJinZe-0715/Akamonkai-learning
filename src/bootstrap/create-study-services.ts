import {CurriculumService} from "../modules/curriculum/application/curriculum-service";
import {HttpCurriculumRepository} from "../modules/curriculum/infrastructure/http-curriculum-repository";
import {VocabularyService} from "../modules/vocabulary/application/vocabulary-service";
import {ReadingService} from "../modules/reading/application/reading-service";
import {AssessmentService} from "../modules/assessment/application/assessment-service";
import {DraftService} from "../modules/assessment/application/draft-service";
import {BrowserDraftRepository} from "../modules/assessment/infrastructure/browser-draft-repository";
import {ProgressService} from "../modules/learning-progress/application/progress-service";
import {BrowserProgressRepository} from "../modules/learning-progress/infrastructure/browser-progress-repository";
import {LocalizationService} from "../modules/localization/application/localization-service";
import {BrowserLanguagePreference} from "../modules/localization/infrastructure/browser-language-preference";
import type {TranslationCatalog} from "../shared/kernel/text-types";
import {BrowserSpeech} from "../modules/speech/infrastructure/browser-speech";
import type {StudyServices} from "../application/study-services";
import {SystemClock} from "../shared/infrastructure/system-clock";
import {BrowserThemePreference} from "../shared/infrastructure/browser-theme-preference";
import {BrowserTextScale} from "../shared/infrastructure/browser-text-scale";
import {DashboardService} from "../application/dashboard-service";
import {StudySessionService} from "../application/study-session-service";
import {VocabularyStudyService} from "../application/vocabulary-study-service";
import {ProgressTransferService} from "../modules/learning-progress/application/progress-transfer-service";
import {BrowserProgressFileStore} from "../modules/learning-progress/infrastructure/browser-progress-file-store";
import {ProgressCommandService} from "../modules/learning-progress/application/progress-command-service";
import {SearchService} from "../modules/search/application/search-service";
import {HttpSearchRepository} from "../modules/search/infrastructure/http-search-repository";

export function createStudyServices(ui: TranslationCatalog): StudyServices {
    const curriculum = new CurriculumService(new HttpCurriculumRepository());
    const vocabulary = new VocabularyService();
    const assessment = new AssessmentService();
    const progress = new ProgressService(new BrowserProgressRepository(), new SystemClock());
    const localization = new LocalizationService(new BrowserLanguagePreference(), ui);
    return {
        appearance: new BrowserThemePreference(),
        textScale: new BrowserTextScale(),
        curriculum,
        reading: new ReadingService(),
        assessment,
        drafts: new DraftService(new BrowserDraftRepository()),
        progress,
        localization,
        speech: new BrowserSpeech(),
        dashboard: new DashboardService(curriculum),
        studySession: new StudySessionService(assessment, progress),
        vocabularyStudy: new VocabularyStudyService(vocabulary, localization),
        progressTransfer: new ProgressTransferService(progress, new BrowserProgressFileStore()),
        progressCommands: new ProgressCommandService(progress),
        search: new SearchService(new HttpSearchRepository()),
    };
}
