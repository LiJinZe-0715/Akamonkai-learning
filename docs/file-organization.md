# 文件命名与课程目录整理

检查范围为项目维护的 121 个代码、样式、入口和配置文件，包含 src/、scripts/、Vite 配置、HTML 入口、TypeScript 配置、包管理配置与部署工作流。生成目录、依赖和本地 IDE 文件不参与命名调整。

重命名 22 个代码文件。表中“保留”表示名称已能表达职责，或属于约定入口（index.ts、public.ts、contracts.ts、ports.ts 等）。服务文件使用 kebab-case 并以 -service.ts 结尾，React 组件与 Context 文件使用 PascalCase，hooks 使用 use- 开头，检查脚本按检查对象命名。

## 逐文件检查结果

| 原路径 | 整理结果 / 新路径 |
|---|---|
| `.github/workflows/deploy-pages.yml` | 保留 |
| `index.html` | 保留 |
| `package.json` | 保留 |
| `pnpm-workspace.yaml` | 保留 |
| `scripts/build-content.mjs` | 保留 |
| `scripts/check-audit-fixes.mjs` | `scripts/check-persistence-and-validation.mjs` |
| `scripts/check-content-review.mjs` | 保留 |
| `scripts/check-ddd.mjs` | `scripts/check-module-contracts.mjs` |
| `scripts/check-speech.mjs` | 保留 |
| `scripts/check-study-workflows.mjs` | 保留 |
| `scripts/check-theme.mjs` | 保留 |
| `scripts/check.mjs` | 保留 |
| `scripts/content-library.mjs` | `scripts/compile-content.mjs` |
| `src/application/dashboard.ts` | `src/application/dashboard-service.ts` |
| `src/application/study-services.ts` | 保留 |
| `src/application/study-session.ts` | `src/application/study-session-service.ts` |
| `src/application/vocabulary-study.ts` | `src/application/vocabulary-study-service.ts` |
| `src/bootstrap/client.ts` | `src/bootstrap/create-study-services.ts` |
| `src/bootstrap/initialize.ts` | `src/bootstrap/initialize-study-services.ts` |
| `src/main.tsx` | 保留 |
| `src/modules/assessment/application/assessment-service.ts` | 保留 |
| `src/modules/assessment/application/contracts.ts` | 保留 |
| `src/modules/assessment/application/draft-service.ts` | 保留 |
| `src/modules/assessment/domain/assessment.ts` | 保留 |
| `src/modules/assessment/domain/draft.ts` | 保留 |
| `src/modules/assessment/domain/vocabulary-questions.ts` | 保留 |
| `src/modules/assessment/infrastructure/browser-draft-repository.ts` | 保留 |
| `src/modules/assessment/presentation/data/pagination.ts` | `src/modules/assessment/presentation/data/assessment-pagination.ts` |
| `src/modules/assessment/presentation/hooks/use-assessment.ts` | 保留 |
| `src/modules/assessment/presentation/index.ts` | 保留 |
| `src/modules/assessment/presentation/pages/AssessmentScreen.tsx` | 保留 |
| `src/modules/assessment/public.ts` | 保留 |
| `src/modules/curriculum/application/contracts.ts` | 保留 |
| `src/modules/curriculum/application/curriculum-service.ts` | 保留 |
| `src/modules/curriculum/domain/catalog-queries.ts` | 保留 |
| `src/modules/curriculum/domain/catalog.ts` | 保留 |
| `src/modules/curriculum/domain/curriculum.ts` | 保留 |
| `src/modules/curriculum/infrastructure/content-mapper.ts` | `src/modules/curriculum/infrastructure/curriculum-content-decoder.ts` |
| `src/modules/curriculum/infrastructure/http-curriculum-repository.ts` | 保留 |
| `src/modules/curriculum/presentation/data/library.ts` | `src/modules/curriculum/presentation/data/catalog-display.ts` |
| `src/modules/curriculum/presentation/data/views.ts` | `src/modules/curriculum/presentation/data/study-view-labels.ts` |
| `src/modules/curriculum/presentation/hooks/use-catalog.ts` | 保留 |
| `src/modules/curriculum/presentation/hooks/use-dashboard.ts` | 保留 |
| `src/modules/curriculum/presentation/hooks/use-lesson.ts` | 保留 |
| `src/modules/curriculum/presentation/index.ts` | 保留 |
| `src/modules/curriculum/presentation/pages/IndexScreen.tsx` | `src/modules/curriculum/presentation/pages/CatalogScreen.tsx` |
| `src/modules/curriculum/presentation/pages/LessonScreen.tsx` | 保留 |
| `src/modules/curriculum/presentation/routes.ts` | `src/modules/curriculum/presentation/curriculum-routes.ts` |
| `src/modules/curriculum/public.ts` | 保留 |
| `src/modules/grammar/application/contracts.ts` | 保留 |
| `src/modules/grammar/application/grammar-service.ts` | 保留 |
| `src/modules/grammar/domain/article.ts` | 保留 |
| `src/modules/grammar/presentation/grammar-view-model.ts` | 保留 |
| `src/modules/grammar/presentation/index.ts` | 保留 |
| `src/modules/grammar/presentation/pages/GrammarScreen.tsx` | 保留 |
| `src/modules/grammar/public.ts` | 保留 |
| `src/modules/learning-progress/application/contracts.ts` | 保留 |
| `src/modules/learning-progress/application/ports.ts` | 保留 |
| `src/modules/learning-progress/application/progress-commands.ts` | `src/modules/learning-progress/application/progress-command-service.ts` |
| `src/modules/learning-progress/application/progress-service.ts` | 保留 |
| `src/modules/learning-progress/application/progress-transfer.ts` | `src/modules/learning-progress/application/progress-transfer-service.ts` |
| `src/modules/learning-progress/domain/learning-progress.ts` | 保留 |
| `src/modules/learning-progress/domain/progress-queries.ts` | 保留 |
| `src/modules/learning-progress/domain/progress.ts` | 保留 |
| `src/modules/learning-progress/infrastructure/browser-progress-files.ts` | 保留 |
| `src/modules/learning-progress/infrastructure/browser-progress-repository.ts` | 保留 |
| `src/modules/learning-progress/infrastructure/http-word-aliases.ts` | 保留 |
| `src/modules/learning-progress/public.ts` | 保留 |
| `src/modules/localization/application/contracts.ts` | 保留 |
| `src/modules/localization/application/localization-service.ts` | 保留 |
| `src/modules/localization/application/ports.ts` | 保留 |
| `src/modules/localization/domain/localization.ts` | 保留 |
| `src/modules/localization/domain/ui-text-ids.ts` | 保留 |
| `src/modules/localization/infrastructure/browser-language-preference.ts` | 保留 |
| `src/modules/localization/infrastructure/http-ui-catalog.ts` | 保留 |
| `src/modules/localization/public.ts` | 保留 |
| `src/modules/speech/application/contracts.ts` | 保留 |
| `src/modules/speech/application/ports.ts` | 保留 |
| `src/modules/speech/application/speech-service.ts` | 保留 |
| `src/modules/speech/domain/dialogue.ts` | 保留 |
| `src/modules/speech/domain/roles.ts` | 保留 |
| `src/modules/speech/infrastructure/browser-speech.ts` | 保留 |
| `src/modules/speech/infrastructure/config.ts` | `src/modules/speech/infrastructure/speech-config.ts` |
| `src/modules/speech/public.ts` | 保留 |
| `src/modules/vocabulary/application/contracts.ts` | 保留 |
| `src/modules/vocabulary/application/vocabulary-service.ts` | 保留 |
| `src/modules/vocabulary/domain/word.ts` | 保留 |
| `src/modules/vocabulary/presentation/data/filters.ts` | `src/modules/vocabulary/presentation/data/word-filters.ts` |
| `src/modules/vocabulary/presentation/hooks/use-vocabulary.ts` | 保留 |
| `src/modules/vocabulary/presentation/index.ts` | 保留 |
| `src/modules/vocabulary/presentation/pages/VocabularyScreen.tsx` | 保留 |
| `src/modules/vocabulary/public.ts` | 保留 |
| `src/presentation/App.tsx` | 保留 |
| `src/presentation/components/Icon.tsx` | 保留 |
| `src/presentation/components/Japanese.tsx` | `src/presentation/components/JapaneseText.tsx` |
| `src/presentation/components/ListenButton.tsx` | 保留 |
| `src/presentation/components/SpeechControls.tsx` | 保留 |
| `src/presentation/context.tsx` | `src/presentation/StudyContext.tsx` |
| `src/presentation/screens/AssessmentScreen.tsx` | 保留 |
| `src/presentation/screens/GrammarScreen.tsx` | 保留 |
| `src/presentation/screens/IndexScreen.tsx` | `src/presentation/screens/CatalogScreen.tsx` |
| `src/presentation/screens/LessonScreen.tsx` | 保留 |
| `src/presentation/screens/VocabularyScreen.tsx` | 保留 |
| `src/presentation/shell/Shell.tsx` | 保留 |
| `src/presentation/shell/data/navigation.ts` | 保留 |
| `src/presentation/shell/use-progress-tools.ts` | 保留 |
| `src/presentation/shell/use-theme.ts` | 保留 |
| `src/presentation/styles/base.css` | 保留 |
| `src/presentation/styles/components.css` | 保留 |
| `src/presentation/styles/index.css` | 保留 |
| `src/presentation/styles/layout.css` | 保留 |
| `src/presentation/styles/study.css` | 保留 |
| `src/presentation/styles/tokens.css` | 保留 |
| `src/presentation/styles/workspace.css` | 保留 |
| `src/shared/infrastructure/browser-theme-preference.ts` | 保留 |
| `src/shared/infrastructure/http-json.ts` | 保留 |
| `src/shared/infrastructure/system-clock.ts` | 保留 |
| `src/shared/kernel/clock.ts` | 保留 |
| `src/shared/kernel/types.ts` | `src/shared/kernel/text-types.ts` |
| `tsconfig.json` | 保留 |
| `vite.config.ts` | 保留 |

## 课程源文件

普通课程现在共有 123 个源文件，按 catalog.json 的 bookId 归入教材目录。课次与学习日使用两位数字，Topic 按主题分目录。两本汉字教材原来的 20 个范围文件已按教材迁移到 `data/content/kanji-daily.json` 与 `data/content/kanji-700.json`，每本书各自一个 JSON，目录按单字列出 540 与 160 个入口；发布资源也按教材分别生成。上表记录此前目录迁移的历史路径，汉字范围文件已被本次合并取代。具体维护规则见 [数据目录说明](../data/README.md)。

## Git 提交范围

提交课程源文件的全部迁移（旧路径删除和新路径新增）、src/ 与 scripts/ 中的重命名和引用更新，以及 README.md、data/README.md、docs/architecture.md 和本文件。使用 git add -A 可同时记录移动两端；Git 会按内容识别重命名。public/content/、dist/、work/ 和 node_modules/ 属于忽略目录，无需推送。

## 需要提交并推送的具体文件

以下列出本次变更的当前路径。重命名和课程迁移还需要一同提交对应旧路径的删除记录。

### 代码、脚本和文档（64 个当前文件）

- `README.md`
- `data/README.md`
- `docs/architecture.md`
- `docs/file-organization.md`
- `scripts/build-content.mjs`
- `scripts/check-content-review.mjs`
- `scripts/check-module-contracts.mjs`
- `scripts/check-persistence-and-validation.mjs`
- `scripts/check-study-workflows.mjs`
- `scripts/check.mjs`
- `scripts/compile-content.mjs`
- `src/application/dashboard-service.ts`
- `src/application/study-services.ts`
- `src/application/study-session-service.ts`
- `src/application/vocabulary-study-service.ts`
- `src/bootstrap/create-study-services.ts`
- `src/bootstrap/initialize-study-services.ts`
- `src/main.tsx`
- `src/modules/assessment/domain/assessment.ts`
- `src/modules/assessment/domain/vocabulary-questions.ts`
- `src/modules/assessment/presentation/data/assessment-pagination.ts`
- `src/modules/assessment/presentation/hooks/use-assessment.ts`
- `src/modules/assessment/presentation/pages/AssessmentScreen.tsx`
- `src/modules/curriculum/application/contracts.ts`
- `src/modules/curriculum/infrastructure/curriculum-content-decoder.ts`
- `src/modules/curriculum/infrastructure/http-curriculum-repository.ts`
- `src/modules/curriculum/presentation/curriculum-routes.ts`
- `src/modules/curriculum/presentation/data/catalog-display.ts`
- `src/modules/curriculum/presentation/data/study-view-labels.ts`
- `src/modules/curriculum/presentation/hooks/use-catalog.ts`
- `src/modules/curriculum/presentation/hooks/use-dashboard.ts`
- `src/modules/curriculum/presentation/hooks/use-lesson.ts`
- `src/modules/curriculum/presentation/index.ts`
- `src/modules/curriculum/presentation/pages/CatalogScreen.tsx`
- `src/modules/curriculum/presentation/pages/LessonScreen.tsx`
- `src/modules/curriculum/public.ts`
- `src/modules/grammar/domain/article.ts`
- `src/modules/grammar/presentation/pages/GrammarScreen.tsx`
- `src/modules/learning-progress/application/progress-command-service.ts`
- `src/modules/learning-progress/application/progress-transfer-service.ts`
- `src/modules/learning-progress/infrastructure/browser-progress-files.ts`
- `src/modules/learning-progress/public.ts`
- `src/modules/localization/application/contracts.ts`
- `src/modules/localization/application/localization-service.ts`
- `src/modules/localization/application/ports.ts`
- `src/modules/localization/domain/localization.ts`
- `src/modules/localization/infrastructure/browser-language-preference.ts`
- `src/modules/localization/infrastructure/http-ui-catalog.ts`
- `src/modules/speech/infrastructure/browser-speech.ts`
- `src/modules/speech/infrastructure/speech-config.ts`
- `src/modules/vocabulary/domain/word.ts`
- `src/modules/vocabulary/presentation/data/word-filters.ts`
- `src/modules/vocabulary/presentation/hooks/use-vocabulary.ts`
- `src/modules/vocabulary/presentation/pages/VocabularyScreen.tsx`
- `src/presentation/App.tsx`
- `src/presentation/StudyContext.tsx`
- `src/presentation/components/JapaneseText.tsx`
- `src/presentation/components/ListenButton.tsx`
- `src/presentation/components/SpeechControls.tsx`
- `src/presentation/screens/CatalogScreen.tsx`
- `src/presentation/shell/Shell.tsx`
- `src/presentation/shell/use-progress-tools.ts`
- `src/presentation/shell/use-theme.ts`
- `src/shared/kernel/text-types.ts`

### 课程源文件迁移（105 个文件）

| 原路径 | 新路径 |
|---|---|
| `data/content/units/chukyu-1.json` | `data/content/units/chukyu/lesson-01.json` |
| `data/content/units/chukyu-2.json` | `data/content/units/chukyu/lesson-02.json` |
| `data/content/units/chukyu-3.json` | `data/content/units/chukyu/lesson-03.json` |
| `data/content/units/chukyu-4.json` | `data/content/units/chukyu/lesson-04.json` |
| `data/content/units/chukyu-5.json` | `data/content/units/chukyu/lesson-05.json` |
| `data/content/units/chukyu-6.json` | `data/content/units/chukyu/lesson-06.json` |
| `data/content/units/chukyu-7.json` | `data/content/units/chukyu/lesson-07.json` |
| `data/content/units/chukyu-8.json` | `data/content/units/chukyu/lesson-08.json` |
| `data/content/units/kanji-new-301.json` | `data/content/units/kanji-700/characters-301-320.json` |
| `data/content/units/kanji-new-321.json` | `data/content/units/kanji-700/characters-321-340.json` |
| `data/content/units/kanji-new-341.json` | `data/content/units/kanji-700/characters-341-360.json` |
| `data/content/units/kanji-new-361.json` | `data/content/units/kanji-700/characters-361-380.json` |
| `data/content/units/kanji-new-381.json` | `data/content/units/kanji-700/characters-381-400.json` |
| `data/content/units/kanji-new-401.json` | `data/content/units/kanji-700/characters-401-420.json` |
| `data/content/units/kanji-new-421.json` | `data/content/units/kanji-700/characters-421-440.json` |
| `data/content/units/kanji-new-441.json` | `data/content/units/kanji-700/characters-441-460.json` |
| `data/content/units/kanji-intermediate-277.json` | `data/content/units/kanji-daily/characters-277-300.json` |
| `data/content/units/kanji-intermediate-301.json` | `data/content/units/kanji-daily/characters-301-330.json` |
| `data/content/units/kanji-intermediate-331.json` | `data/content/units/kanji-daily/characters-331-360.json` |
| `data/content/units/kanji-intermediate-361.json` | `data/content/units/kanji-daily/characters-361-390.json` |
| `data/content/units/kanji-intermediate-391.json` | `data/content/units/kanji-daily/characters-391-420.json` |
| `data/content/units/kanji-intermediate-421.json` | `data/content/units/kanji-daily/characters-421-450.json` |
| `data/content/units/kanji-intermediate-451.json` | `data/content/units/kanji-daily/characters-451-480.json` |
| `data/content/units/kanji-intermediate-481.json` | `data/content/units/kanji-daily/characters-481-510.json` |
| `data/content/units/kanji-intermediate-511.json` | `data/content/units/kanji-daily/characters-511-540.json` |
| `data/content/units/minna-1.json` | `data/content/units/minna/elementary-1/lesson-01.json` |
| `data/content/units/minna-2.json` | `data/content/units/minna/elementary-1/lesson-02.json` |
| `data/content/units/minna-3.json` | `data/content/units/minna/elementary-1/lesson-03.json` |
| `data/content/units/minna-4.json` | `data/content/units/minna/elementary-1/lesson-04.json` |
| `data/content/units/minna-5.json` | `data/content/units/minna/elementary-1/lesson-05.json` |
| `data/content/units/minna-6.json` | `data/content/units/minna/elementary-1/lesson-06.json` |
| `data/content/units/minna-7.json` | `data/content/units/minna/elementary-1/lesson-07.json` |
| `data/content/units/minna-8.json` | `data/content/units/minna/elementary-1/lesson-08.json` |
| `data/content/units/minna-9.json` | `data/content/units/minna/elementary-1/lesson-09.json` |
| `data/content/units/minna-10.json` | `data/content/units/minna/elementary-1/lesson-10.json` |
| `data/content/units/minna-11.json` | `data/content/units/minna/elementary-1/lesson-11.json` |
| `data/content/units/minna-12.json` | `data/content/units/minna/elementary-1/lesson-12.json` |
| `data/content/units/minna-13.json` | `data/content/units/minna/elementary-1/lesson-13.json` |
| `data/content/units/minna-14.json` | `data/content/units/minna/elementary-1/lesson-14.json` |
| `data/content/units/minna-15.json` | `data/content/units/minna/elementary-1/lesson-15.json` |
| `data/content/units/minna-16.json` | `data/content/units/minna/elementary-1/lesson-16.json` |
| `data/content/units/minna-17.json` | `data/content/units/minna/elementary-1/lesson-17.json` |
| `data/content/units/minna-18.json` | `data/content/units/minna/elementary-1/lesson-18.json` |
| `data/content/units/minna-19.json` | `data/content/units/minna/elementary-1/lesson-19.json` |
| `data/content/units/minna-20.json` | `data/content/units/minna/elementary-1/lesson-20.json` |
| `data/content/units/minna-21.json` | `data/content/units/minna/elementary-1/lesson-21.json` |
| `data/content/units/minna-22.json` | `data/content/units/minna/elementary-1/lesson-22.json` |
| `data/content/units/minna-23.json` | `data/content/units/minna/elementary-1/lesson-23.json` |
| `data/content/units/minna-24.json` | `data/content/units/minna/elementary-1/lesson-24.json` |
| `data/content/units/minna-25.json` | `data/content/units/minna/elementary-1/lesson-25.json` |
| `data/content/units/minna-26.json` | `data/content/units/minna/elementary-2/lesson-26.json` |
| `data/content/units/minna-27.json` | `data/content/units/minna/elementary-2/lesson-27.json` |
| `data/content/units/minna-28.json` | `data/content/units/minna/elementary-2/lesson-28.json` |
| `data/content/units/minna-29.json` | `data/content/units/minna/elementary-2/lesson-29.json` |
| `data/content/units/minna-30.json` | `data/content/units/minna/elementary-2/lesson-30.json` |
| `data/content/units/minna-31.json` | `data/content/units/minna/elementary-2/lesson-31.json` |
| `data/content/units/minna-32.json` | `data/content/units/minna/elementary-2/lesson-32.json` |
| `data/content/units/minna-33.json` | `data/content/units/minna/elementary-2/lesson-33.json` |
| `data/content/units/minna-34.json` | `data/content/units/minna/elementary-2/lesson-34.json` |
| `data/content/units/minna-35.json` | `data/content/units/minna/elementary-2/lesson-35.json` |
| `data/content/units/minna-36.json` | `data/content/units/minna/elementary-2/lesson-36.json` |
| `data/content/units/minna-37.json` | `data/content/units/minna/elementary-2/lesson-37.json` |
| `data/content/units/minna-38.json` | `data/content/units/minna/elementary-2/lesson-38.json` |
| `data/content/units/minna-39.json` | `data/content/units/minna/elementary-2/lesson-39.json` |
| `data/content/units/minna-40.json` | `data/content/units/minna/elementary-2/lesson-40.json` |
| `data/content/units/minna-41.json` | `data/content/units/minna/elementary-2/lesson-41.json` |
| `data/content/units/minna-42.json` | `data/content/units/minna/elementary-2/lesson-42.json` |
| `data/content/units/minna-43.json` | `data/content/units/minna/elementary-2/lesson-43.json` |
| `data/content/units/minna-44.json` | `data/content/units/minna/elementary-2/lesson-44.json` |
| `data/content/units/minna-45.json` | `data/content/units/minna/elementary-2/lesson-45.json` |
| `data/content/units/minna-46.json` | `data/content/units/minna/elementary-2/lesson-46.json` |
| `data/content/units/minna-47.json` | `data/content/units/minna/elementary-2/lesson-47.json` |
| `data/content/units/minna-48.json` | `data/content/units/minna/elementary-2/lesson-48.json` |
| `data/content/units/minna-49.json` | `data/content/units/minna/elementary-2/lesson-49.json` |
| `data/content/units/minna-50.json` | `data/content/units/minna/elementary-2/lesson-50.json` |
| `data/content/units/katakana.json` | `data/content/units/minna/katakana.json` |
| `data/content/units/day1-mono.json` | `data/content/units/n2/day-01-mono.json` |
| `data/content/units/day2-wake.json` | `data/content/units/n2/day-02-wake.json` |
| `data/content/units/day3-kagiru.json` | `data/content/units/n2/day-03-kagiru.json` |
| `data/content/units/day4-dake.json` | `data/content/units/n2/day-04-dake.json` |
| `data/content/units/day5-koto.json` | `data/content/units/n2/day-05-koto.json` |
| `data/content/units/day6-tokoro.json` | `data/content/units/n2/day-06-tokoro.json` |
| `data/content/units/day7-uchi.json` | `data/content/units/n2/day-07-uchi.json` |
| `data/content/units/day8-gyakusetsu.json` | `data/content/units/n2/day-08-gyakusetsu.json` |
| `data/content/units/day9-cause.json` | `data/content/units/n2/day-09-cause.json` |
| `data/content/units/day10-change.json` | `data/content/units/n2/day-10-change.json` |
| `data/content/units/day11-condition.json` | `data/content/units/n2/day-11-condition.json` |
| `data/content/units/day12-degree.json` | `data/content/units/n2/day-12-degree.json` |
| `data/content/units/day13-tendency.json` | `data/content/units/n2/day-13-tendency.json` |
| `data/content/units/day14-judgment.json` | `data/content/units/n2/day-14-judgment.json` |
| `data/content/units/day15-scope.json` | `data/content/units/n2/day-15-scope.json` |
| `data/content/units/topic-1-part.json` | `data/content/units/topic/topic-01/lesson.json` |
| `data/content/units/topic-2-2-1.json` | `data/content/units/topic/topic-02/section-01.json` |
| `data/content/units/topic-2-2-2.json` | `data/content/units/topic/topic-02/section-02.json` |
| `data/content/units/topic-3-reading.json` | `data/content/units/topic/topic-03/reading.json` |
| `data/content/units/topic-3-3-1.json` | `data/content/units/topic/topic-03/section-01.json` |
| `data/content/units/topic-3-3-2.json` | `data/content/units/topic/topic-03/section-02.json` |
| `data/content/units/topic-4-reading.json` | `data/content/units/topic/topic-04/reading.json` |
| `data/content/units/topic-4-4-1.json` | `data/content/units/topic/topic-04/section-01.json` |
| `data/content/units/topic-4-4-2.json` | `data/content/units/topic/topic-04/section-02.json` |
| `data/content/units/topic-5-reading.json` | `data/content/units/topic/topic-05/reading.json` |
| `data/content/units/topic-5-5-1.json` | `data/content/units/topic/topic-05/section-01.json` |
| `data/content/units/topic-6-reading.json` | `data/content/units/topic/topic-06/reading.json` |
| `data/content/units/topic-6-6-1.json` | `data/content/units/topic/topic-06/section-01.json` |
| `data/content/units/topic-6-6-2.json` | `data/content/units/topic/topic-06/section-02.json` |

## 验证结果

- 迁移前后 106 个编译单元逐项相同，105 个课程 JSON 的文件字节保持一致。
- 生成的 public/content/ 和 dist/content/ 中全部 106 个单元与迁移前结果一致。
- 内容、模块边界、SSR 双语页面、模块契约、主题、语音、学习流程、进度持久化与输入校验检查全部通过。
- TypeScript 类型检查、Vite 生产构建通过。按 package.json 的 build 脚本逐项执行了对应命令。
