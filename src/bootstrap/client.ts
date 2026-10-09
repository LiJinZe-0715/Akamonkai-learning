import { CurriculumService } from "../modules/curriculum/application/curriculum-service";
import { HttpCurriculumRepository } from "../modules/curriculum/infrastructure/http-curriculum-repository";
import { VocabularyService } from "../modules/vocabulary/application/vocabulary-service";
import { GrammarService } from "../modules/grammar/application/grammar-service";
import { AssessmentService } from "../modules/assessment/application/assessment-service";
import { DraftService } from "../modules/assessment/application/draft-service";
import { BrowserDraftRepository } from "../modules/assessment/infrastructure/browser-draft-repository";
import { ProgressService } from "../modules/learning-progress/application/progress-service";
import { BrowserProgressRepository } from "../modules/learning-progress/infrastructure/browser-progress-repository";
import { LocalizationService } from "../modules/localization/application/localization-service";
import { BrowserLanguagePreference } from "../modules/localization/infrastructure/browser-language-preference";
import type { TranslationCatalog } from "../shared/kernel/types";
import { SpeechService } from "../modules/speech/application/speech-service";
import { BrowserSpeech } from "../modules/speech/infrastructure/browser-speech";
import type { StudyServices } from "../application/study-services";
import { SystemClock } from "../shared/infrastructure/system-clock";
import { BrowserThemePreference } from "../shared/infrastructure/browser-theme-preference";
import { DashboardService } from "../application/dashboard";
import { StudySessionService } from "../application/study-session";
import { VocabularyStudyService } from "../application/vocabulary-study";
import { ProgressTransferService } from "../modules/learning-progress/application/progress-transfer";
import { BrowserProgressFiles } from "../modules/learning-progress/infrastructure/browser-progress-files";
import { ProgressCommandService } from "../modules/learning-progress/application/progress-commands";
export function createServices(ui: TranslationCatalog, aliases: Readonly<Record<string, string>> = {}): StudyServices {
  const curriculum = new CurriculumService(new HttpCurriculumRepository());
  const vocabulary = new VocabularyService();
  const assessment = new AssessmentService(Math.random);
  const progress = new ProgressService(new BrowserProgressRepository(), new SystemClock(), aliases);
  const localization = new LocalizationService(new BrowserLanguagePreference(), ui);
  return {
    appearance: new BrowserThemePreference(),
    curriculum,
    vocabulary,
    grammar: new GrammarService(),
    assessment,
    drafts: new DraftService(new BrowserDraftRepository()),
    progress,
    localization,
    speech: new SpeechService(new BrowserSpeech()),
    dashboard: new DashboardService(curriculum),
    session: new StudySessionService(assessment, progress),
    wordStudy: new VocabularyStudyService(vocabulary, localization),
    progressTransfer: new ProgressTransferService(progress, new BrowserProgressFiles()),
    progressCommands: new ProgressCommandService(progress),
  };
}
