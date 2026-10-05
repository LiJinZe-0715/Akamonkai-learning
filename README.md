# 赤門会日本語

新規実装の日本語復習サイト。旧サイトはデータの参照元であり、このアプリは旧サイトのページ・実行コードに依存しません。

## Development
Use Node.js 24 or 26 and pnpm 12.9.1. `package.json` declares the supported Node versions and pins pnpm; CI reads the same package-manager declaration.

Type checking uses TypeScript 7. The check scripts use the official `@typescript/typescript6` compatibility package for compiler APIs that TypeScript 7 does not yet provide.

- `pnpm install --frozen-lockfile`
- `pnpm check`
- `pnpm build`
- `pnpm dev`

`pnpm dev` generates the content in `public/content` before starting the development server. These generated files are ignored by Git, so a fresh checkout does not contain them. After editing source content in `data/content`, restart `pnpm dev` to regenerate it.

## Architecture
`presentation → module public/application → domain`
Infrastructure implements application ports. `src/bootstrap` is the composition root; presentation receives explicit interfaces through `StudyServices`. Curriculum selection and learning-progress transitions live in the domain layer. HTTP adapters validate external JSON before exposing it to use cases.

- `src/modules/curriculum`: catalog, lesson lookup and route validation.
- `src/modules/vocabulary`: word records and vocabulary search.
- `src/modules/grammar`: article models and contents.
- `src/modules/assessment`: grading, alternative answers, shuffling and vocabulary questions.
- `src/modules/learning-progress`: marks, results, validation and import/export.
- `src/modules/localization`: explicit text-ID lookup and locale preference.
- `src/modules/speech`: speech port and browser implementation.
- `src/modules/*/presentation`: business-owned pages, UI controllers and display configuration, exposed through each presentation/index.ts.
- `src/presentation`: the app shell, React context, reusable UI components and existing global CSS. The screen files are compatibility re-exports.
- `src/application/study-services.ts`: presentation-facing service contract.
- `src/application/{dashboard,study-session,vocabulary-study}.ts`: explicit cross-context workflows; these contain no React hooks or browser APIs.

Domain code imports no React, browser APIs or content files. Business cross-module access goes through public.ts; UI integration uses presentation/index.ts. Network, storage and file handling are restricted to infrastructure. The check script enforces boundaries and detects cycles including type-only edges. See [docs/architecture.md](docs/architecture.md) for boundaries, data ownership, flow examples and extension rules.

## Content maintenance
- `data/content/catalog.json`: Japanese textbook titles, ordered units, available views.
- `data/content/units/*.json`: textbook grammar, Japanese examples, questions, word references.
- `data/content/vocabulary.json`: canonical vocabulary records keyed by stable word IDs.
- `data/content/word-aliases.json`: explicit mappings from equivalent historical word IDs to a shared progress ID. Placement IDs and text references remain stable; only learning marks share an identity. Do not generate these mappings from edited translations at runtime.
- `data/content/localization/learning.json`: editable Chinese/English textbook text catalog. Teach formation rules in the introducing lesson; later lessons retain their own usage explanations without generic conjugation appendices. Do not reintroduce `curriculum.conjugation.*` or `verb-*` reference sections into textbook units.
- `data/content/reference/verbs.json`: independent, self-contained verb conjugation reference, including all its own articles, examples and Chinese/English texts. It must not be generated from textbook units or resolve translations from the textbook catalog. Edit it separately only when the reference itself needs a change.
- `data/content/localization/ui.json`: the sole editable Chinese/English UI text catalog.

To fix Chinese, edit only the existing ID's zh value. Never regenerate IDs from wording or position. Japanese titles, written forms, readings and original prompt segments are explicit fields; they never pass through translation. Mixed prompts distinguish Japanese source from ID-bound explanatory instructions.

The build compiles each unit and only its referenced translations to public/content. UI translations are also emitted as public/content/ui.json and fetched at startup. Code cannot import source JSON or authored business datasets. Small UI configuration belongs to presentation/data and may be imported by UI code. Generated public/content and dist are ignored by Git. The client fetches one unit at a time, rather than bundling the full textbook collection. Do not edit generated files. Source data and application code remain in one repository and are published together; this is not a standalone database.

## Progress
Progress and language preferences live in browser storage on this origin. Progress remains version 1, with optional per-field timestamps for word marks. Existing version 1 files remain readable. Imported results and visits retain the newer timestamp; timestamped word marks merge per field. When an old file has no mark timestamps, conflicts retain the current local mark and missing IDs are imported. Equivalent historical word IDs are migrated through the explicit alias map; untimestamped duplicates preserve either ID's positive marks during this migration.

Progress commands acquire a same-origin Web Lock, read the latest stored progress, merge current in-memory changes and apply the command before saving. Other pages receive storage events. This requires a secure context with Web Locks support (HTTPS or localhost in supported browsers). Without Web Locks, changes remain in memory and the storage error notice asks users to export a backup; the app avoids an unprotected write that could discard another page's data.

Damaged progress recovers independently valid records and retains the original raw value in a recovery backup before any overwrite. Settings offers an original-recovery export. If storing that backup fails, the original is not replaced. Unfinished tests save the question/option order, answers and page locally and restore them after a reload. A changed question source invalidates its draft; submission clears it. Wrong-only practice shows its own result without replacing the full-test score.

This origin cannot read the old site's browser storage. No user account, cloud progress sync or business database is configured.

## Content scope
102 units, 4,420 vocabulary placements, 1,807 fixed questions. Vocabulary choice questions are generated separately. Kanji reading tests and the 130-question katakana test use the same assessment engine. Missing N2 vocabulary remains explicitly unavailable.

See data/content/provenance.json for the source commit. Automated checks validate references, grading and boundaries; they do not certify the linguistic accuracy of every source passage.

## Deployment
GitHub Pages deployment is defined in `.github/workflows/deploy-pages.yml`. In the repository's Settings → Pages → Build and deployment, select **GitHub Actions** as the source once. Every push to `main` then installs dependencies, runs `pnpm build` (including content and architecture checks), uploads `dist`, and deploys it. The workflow can also be started manually from the Actions tab. A failed build does not proceed to deployment.

Pull requests run the same install/check/build job and skip Pages artifact upload and deployment. To require a passing build before merging, enable the workflow's `build` status check in the repository's branch protection or ruleset settings; the workflow file alone does not enforce merge protection.

Website: https://lijinze0715-hub.github.io/akamonkai-nihongo-benkyou/

Production builds use `/akamonkai-nihongo-benkyou/` as Vite's base path; content requests and navigation links are relative to the current site directory. Development still runs at `/`. To preview the production build locally, run `pnpm build` and `pnpm preview`, then open `/akamonkai-nihongo-benkyou/` on the preview server. If the repository name changes or a custom domain is added, update the production base path in `vite.config.ts`.

Commit source files, the workflow and the lockfile. Generated `dist` and `public/content` stay ignored; GitHub Actions generates and publishes them.
