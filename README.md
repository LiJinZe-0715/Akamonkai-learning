# 赤门会日语学习

给孩子做课堂复习和预习用的随身教辅。内容全部来自学校教材，按「教材（Book）→ 课（Lesson）→ 模块 → 条目 → 题目」组织：一课可以有汉字、单词、文章、对话、文法五种模块，页签由模块推导，题目挂在它练的条目下面。可以朗读、收藏、记录进度。

- 纯前端：React 19 + TypeScript + Vite，没有后端，除 React 外没有运行时依赖。
- 内容在构建时编译成静态 JSON；学习记录存在本地（localStorage），可导出、导入。
- 网站发布在 GitHub Pages；另有一个 Android WebView 壳（系统 TTS 朗读、应用内检查更新）。

## 教材

| 分组 | 教材（id） | 课数 |
| --- | --- | ---: |
| 初级（N5～N3） | 1日15分の漢字練習 `ichinichi-jugofun-no-kanji-renshu` | 18 |
| | カタカナ練習帳 `katakana-renshucho` | 35 |
| | みんなの日本語 初級Ⅰ・Ⅱ `minna-no-nihongo-shokyu` | 51 |
| | Topic1-6 `topic-1-6` | 14 |
| 中级（N2） | 新完全マスター文法 日本語能力試験N2 `shin-kanzen-master-bunpo-n2` | 41 |
| 新中级（N2） | 留学生のための漢字の教科書 中級700 `kanji-no-kyokasho-chukyu-700` | 10 |
| | 中級を学ぼう 中級前期 `chukyu-o-manabo-chukyu-zenki` | 8 |
| | TRY! 日本語能力試験 N2 文法から伸ばす日本語 `try-nihongo-noryoku-shiken-n2` | 6 |
| | 総合日本語 N2 語彙 `sogo-nihongo-n2-goi` | 12 |
| JLPT 文法总结 | 日本語能力試験 N2 文法・類似表現 `nihongo-noryoku-shiken-n2-bunpo` | 15 |
| | JLPT N5 動詞の活用 `jlpt-n5-doshi-no-katsuyo` | 1 |

共 11 本教材、211 课、3,575 道固定题、6,678 条词汇。汉字书按固定字数分课（30 字 / 20 字一课），中級を学ぼう 的漢字練習并入各课的汉字模块，不再是单独的课。141 课带「单词测验」：打开测验页时由 `AssessmentService` 现场生成单词选择题并打乱选项（见下「单词测验」），不落盘，所以不计入上面的固定题数。另有跨教材全文检索（`?page=search`）：文法条目、例句、本文、台词、单词、汉字都能搜。

## 上手

需要 Node 26（见 `.nvmrc`，24 也能跑）和 pnpm 12。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:4173 。改了 `data/content/` 之后重跑 `pnpm dev`：页面读的是编译产物，不会热加载源数据。

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 编译内容，启动开发服务器 |
| `pnpm lint` | oxlint，0 warning |
| `pnpm check` | 全量校验，约 15 秒；`--only=关键字` 只跑部分，`--shuffle` 打乱顺序 |
| `pnpm build` | 校验 → 编译内容 → 类型检查 → 打包到 `dist/` |
| `pnpm preview` | 预览 `dist/` |
| `pnpm android:ship` | 打 APK → 写进 `public/downloads/` → 暂存 APK 与 `version.json` |
| `pnpm android:ship --verify` | 核对仓库里的 APK：sha256、签名证书、是不是当前源码打的 |
| `pnpm android:test` | Android 侧脚本的单元测试 |

## 目录

```text
src/
  modules/<模块>/        assessment curriculum grammar learning-progress localization
                         reading search speech vocabulary
    domain/              纯逻辑
    application/         用例、contracts、ports
    infrastructure/      浏览器 / HTTP 适配器
    presentation/        页面（对外只经 public.ts）
  application/           跨模块编排
  bootstrap/             依赖装配（唯一的组装点）
  presentation/          外壳、上下文、通用组件、样式
data/content/            内容源：catalog.json、units/<教材 id>/<课号>.json、localization/
scripts/                 内容编译、校验套件、APK 构建与核对
android/                 WebView 壳、原生 TTS、检查更新
public/downloads/        已发布的 APK 与 version.json（随源码提交）
```

分层由 `scripts/suites/architecture.mjs` 用 AST 扫 import 强制：presentation 不直连本模块的 domain，`src/application` 与 `src/shared` 只能经 `<模块>/public` 访问模块。动态 `import()` 不在扫描范围内，别用。

生成目录 `public/content/`、`dist/`、`android/app/src/main/assets/public/`、`android/app/build/` 都不进仓库，随时可以删，下次构建会重建。

## 内容数据

- 每课一个 `data/content/units/<教材 id>/<课号>.json`，顶层是 `{kind:"lesson", id, bookId, title, modules}`。目录名必须等于教材 id，文件名去掉 `.json` 就是课号。
- `modules` 里五种模块都可选（至少一个）：`kanji` / `words` / `articles` / `dialogues` / `grammar`，每个模块是 `{kind, items}`。条目、段落、台词、句子、题目都是结构化对象，数据模型（约定、编号、类定义）见 `docs/content-model.md`，本项目的教材分课和类型文件位置见 `docs/design.md` 第 4 节。
- 所有 id 是路径：`教材.课号.类型.序号`，只用小写英文、数字、`-`，点号只用来分层；汉字例外，最后一段用教材原编号。译文 id 是「所属对象 id + 字段名」，存 `data/content/localization/learning.json`（id → {zh, en}），只有中英；日语只出现在 `text` / `word` / `title` / `character` / `japanese` 这类字段里。
- 页签由模块推导：有哪个模块就显示哪个，有题目时最后加 `quiz`。`catalog.json` 只写 `{schemaVersion, siteTitle, books, lessonGroups}`，不写 `views`、`units`、`kanjiGroupSize`。
- 本文的正文由 `Article.paragraphs[].sentences[].text` 顺序拼成，不再另存 `bodyJa`；会话用 `Dialogue.lines`，角色标签已从原文里拆出来。
- 题目用 `correctOptionIndexes` / `acceptedAnswers` + `requiredScript` 判分，不打乱题目和选项；编译器把每课引用的译文收进 `texts` 字段，源数据里不写。
- **单词测验（wordQuiz）**：带 `wordQuiz` 标记的课，词表里有词义的词会在打开测验页时由 `AssessmentService.vocabulary()` 现场生成一道词义选择题，选项和干扰项按随机源打乱，可复现；这一块不存进源数据，也不计入上面的固定题数。迁移时固定选择题已经按固定种子打乱一次并固化，所以打开页时不再二次打乱。
- UI 文案的 key 是联合类型 `UiTextId`：新增 key 要同时改 `localization/ui.json` 和 `src/modules/localization/domain/ui-text-ids.ts`。
- 检索索引 `search.json` 在构建期由 `scripts/search-index.mjs` 产出；改字段要同时改 `src/modules/search/domain/search-index.ts` 的解码器，对不上会整份拒收。
- 学习记录按时间戳合并（多标签页、导入都走合并）。「清空学习记录」把代数 `generation` 加一：代数高的一方整体胜出，
  旧记录不会从内存或别的标签页合并回来；导入清空前的备份时，会先移植到当前代数，所以仍能恢复。
- 内容 JSON 的请求带内容指纹（`?v=…`，由 `vite.config.ts` 计算），内容一变就绕开 Pages 的 10 分钟缓存。

## 改内容的规矩

1. **不改教材原文**（例句、正文）。只有能证明是转写错误才改，拿不准就标「待母语者确认」。全角数字混用（`２杯` / `10本`）是原文，不统一。
2. 批量修改用脚本做精确字符串替换，每处断言命中次数，对不上就整体退出；写回后立刻 `JSON.parse` 自检。不要 `JSON.parse → stringify` 重排没改的部分。唯一一次破例是 2026-11 的内容模型重构：一次性脚本 `scripts/migrate-classes.mjs` 整体改写结构，跑完即删，新旧 id 对照和人工复核清单留在 `logs/`（不进仓库）。
3. 新增页签不用改目录：给课加对应模块，页签、词数、题数、检索入口都由 `scripts/content-compiler.mjs` 派生。
4. 字符串里需要引号时用「」，或在 JS 里写 `\\"`——写成 `\"` 会产出裸 `"`，把 JSON 弄坏。
5. 改完跑 `pnpm build`，再到 `public/content/` 里 grep，确认改动进了产物；`git diff` 只应有目标行。
6. 不要为了让校验变绿去删测试；需要放宽就改成下限断言（`>=`）。删一个 suite 要同时删 `scripts/scenarios.mjs` 里对应的场景，否则覆盖率不到 100%，构建会失败。
7. 换行：仓库存 LF，工作区 CRLF，由 `.gitattributes` 统一，不依赖本机配置。

## 朗读

只用设备自带的语音：浏览器走 Web Speech API，App 走系统 TTS（`android/native-bridge.js` 把 `speechSynthesis` 换成原生实现）。

- 停顿完全交给引擎：标点原样送进去，不要自己按标点切段、补静音——那套做法在手机上会让句号不停。
- 一次一句、交替渲染：振假名换成假名，按角色和教材把行拼起来（原文的折行不是句子边界），再在 `。！？` 处切成单句（引号括号里的句号不切，太长的句子按 100 字切）。第 N 句一开口就把后面两句排进引擎，读这一句的同时合成后面的句子，句间只剩引擎自己的停顿。
- App 里不用 `tts.speak` 直接朗读：那样框架只让合成领先播放约半秒，下一句要到上一句快读完才开始合成。改为 `synthesizeToFile` 合成成文件，再由 `MediaPlayer` 按顺序播放（`NativeSpeech.java`），日志里有每句的合成耗时和句间停顿（`gap=`）。
- 句间停顿可在朗读设置里调（0–5000 ms，50 一格，默认 0）：App 里由原生播放器在上一句播完后等够再播，提前合成照旧；浏览器里设了停顿就不提前排队，读完等够再送下一句。
- 空闲时调用 `play()` 不要先 `cancel()`：Chrome for Android 和原生 TTS 都会吞掉紧跟在 cancel 后面的那次 speak。
- 纯空白的文本（网页的静音预热）不能送进原生引擎：VOICEVOX 收到后既不开始也不结束，队列会永远卡在这一条上，
  表现就是「点了不播放」。`native-bridge.js` 直接把它当作读完处理，有测试守着。
- 真机排查朗读：`adb logcat -s AkamonkaiSpeech`，能看到引擎初始化、声音数，以及每次 speak 的声音、结果和开始/结束/错误码（不记课文内容）。

## 发布

**网站**：push 到 `main`，GitHub Actions 依次跑 lint → build（含全量校验）→ Android 脚本测试 → APK 核对，然后部署 Pages。生产环境的 base 是 `/Akamonkai-learning/`。

**App**：APK 随源码提交，从 Pages 的 `downloads/Akamonkai-learning.apk` 分发。

```text
改源码 → pnpm android:ship → git commit → git push
```

- 需要 JDK（`JAVA_HOME`）和 Android SDK（`ANDROID_HOME`，platform 35），打包要 5–10 分钟。
- 打包要在自己的终端（PowerShell）里跑。在 AI 助手的命令沙箱里，Gradle 会报
  `Unable to establish loopback connection`：那是执行环境的限制，不是项目的问题。
- 壳里的提示文字在 `android/app/src/main/res/values/strings.xml`（英文，默认）和 `values-zh/`（中文），
  跟系统语言切换；Java 里不写字面量，两边的键必须一致，`pnpm check` 会查。
- 发的是 release 包：不可调试，Java 层经 R8 压缩。JS 桥接方法靠 `android/app/proguard-rules.pro` 保留，新增 `@JavascriptInterface` 方法时不需要改它。
- 版本号固定为 `versionCode 1` / `1.0`，不靠版本号区分新旧：App 检查更新时，比较的是已安装包的 sha256 和 `version.json` 里的 sha256。
- CI 会核对仓库里的 APK：sha256 对不上 `version.json`、签名证书不对，都直接失败；APK 比网页旧（改了网页没重新打包）只出警告，网站照常发布，但 App 用户看不到这些改动。

### 签名钥匙

`android/.signing/debug.keystore` 不进仓库，**只有一份，务必另行备份**。证书指纹登记在 `android/release-signing.json`。

换了钥匙，已经装了 App 的设备就无法覆盖安装，只能先卸载，而卸载会清掉学习记录。所以：

- 已经发过版、又找不到钥匙时，`android:build` 直接报错，不会自动生成新钥匙；
- 打出来的包证书对不上登记值时，删包并报错；
- 确实要换钥匙，才用 `node scripts/build-android.mjs --new-signing-key`。

### 构建日志

`build-content`、`build-android`、`publish-android`、`android:ship`、`verify-apk` 都按步骤记日志（`scripts/build-log.mjs`），写在 `logs/`（不进仓库，留最近 20 份）。一次 ship 调起的几个脚本写同一份，Gradle、`pnpm build` 的输出也抄在里面。

失败时终端最后会打出「哪一步失败、原因、日志在哪」，日志里有完整的调用栈。内容 JSON 写坏了，报错会带上文件名。

### 真机调试

release 包关掉了 WebView 调试。要用 DevTools 调网页，可以在电脑上跑 `pnpm preview`，再用 `adb reverse tcp:4173 tcp:4173` 让手机 Chrome 打开它；或者临时用 `gradlew assembleDebug` 打一个 debug 包来装。

## 校验

`pnpm check` 是自研的校验套件（`scripts/harness.mjs`），不依赖测试框架：用 TypeScript 6 的 `transpileModule` 把源码直接载入 Node 执行（类型检查用的是 TypeScript 7）。用例之间不共享状态，夹具都是冻结的；场景清单从源码里的枚举推导，覆盖率必须 100%。覆盖范围包括：内容结构与译文完整性、题目可作答与评分、模块边界、页面渲染（中英两遍）、语音流程、进度存储、全文检索、Android 产物（应用名、版本信息、APK 哈希与签名证书）。
