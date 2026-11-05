# 赤门会日语学习 · 设计文档

> **状态**：现行。数据模型已于 2026-11 按本文实施。
> **用途**：给人和 AI 看的设计依据。本文和代码不一致的地方，就是要改的地方。
> **读法**：第 1–3 节是目标与架构；第 4 节是本项目的数据模型取值，通用的数据模型见 `docs/content-model.md`；第 5–10 节是各子系统；第 11 节是内容维护。操作步骤看 `README.md`。

## 1. 背景与目标

给孩子做课堂复习和预习用的随身教辅。内容全部来自学校教材，在手机和电脑上都能用，可以朗读、收藏、记录进度。

**目标**

- 把多本教材的汉字、单词、文章、对话、文法、练习题，按统一的数据模型组织，可浏览、可测验、可检索。
- 朗读：只用设备自带语音，在手机上做到句间无多余停顿。
- 零运维：没有后端，静态托管即可；App 是网页的 WebView 壳，跟网页同源发布。
- 内容可信：教材原文不改；任何内容变更都能被自动校验兜住。

**非目标**

- 账号、云同步、多人共享：学习记录只在本地，靠导出 / 导入迁移。
- 自研语音合成或在线 TTS 服务。
- 自适应出题、错题本算法：测验题按教材原样出题（单词测验除外，见 6.3）。

## 2. 总体架构

```text
data/content/*.json ──(构建期编译 + 校验)──▶ public/content/*.json（静态 JSON）
                                                    │
                     ┌──────────────────────────────┤
                     ▼                              ▼
          GitHub Pages 上的网站               Android WebView 壳
       React 19 + TypeScript + Vite        （内置同一份网页产物，
       学习记录存 localStorage               系统 TTS、检查更新）
```

| 方面 | 选择 | 理由 |
| --- | --- | --- |
| 运行时 | 纯前端，React 19 + TS + Vite；除 React 外无运行时依赖 | 静态托管、离线友好、依赖面小 |
| 内容 | 构建时编译成静态 JSON，每课一个文件 | 按需加载；编译期即可做完整性校验和派生 |
| 存储 | localStorage，按时间戳合并，可导出 / 导入 | 没有后端；多标签页、导入走同一套合并逻辑 |
| 发布 | push `main` → GitHub Actions → Pages | 无服务器，CI 即发布流水线 |
| App | Android WebView 壳 + 原生 TTS + 应用内更新 | 弥补浏览器 TTS 在手机上的缺陷，免应用商店 |

## 3. 代码结构与分层

```text
src/
  modules/<模块>/      assessment curriculum grammar learning-progress localization
                       reading search speech vocabulary
    domain/            纯逻辑，无副作用
    application/       用例、contracts、ports
    infrastructure/    浏览器 / HTTP 适配器（实现 ports）
    presentation/      页面，对外只经 public.ts 暴露
  application/         跨模块编排
  bootstrap/           依赖装配（唯一的组装点）
  presentation/        外壳、上下文、通用组件、样式
  shared/kernel/       跨模块共享的基础类型（Segment、Sentence、Dialogue 等）
```

**业务模块职责**

| 模块 | 职责 |
| --- | --- |
| curriculum | 教材、课、模块、汉字；目录索引；页签推导 |
| vocabulary | 单词 |
| reading | 文章、段落；整篇正文拼接 `articleText` |
| grammar | 文法条目 |
| assessment | 题目、判分、单词测验现场生成（`AssessmentService`） |
| learning-progress | 成绩、答题草稿、收藏的存储与合并 |
| localization | 界面文案（`UiTextId`）与学习内容译文 |
| search | 全文检索（索引在构建期生成） |
| speech | 朗读：分句、排队、角色音色 |

**分层规则**（`scripts/suites/architecture.mjs` 用 AST 扫 import 强制执行）

- presentation 不直连本模块的 domain。
- `src/application` 与 `src/shared` 只能经 `<模块>/public` 访问模块。
- 依赖只在 `bootstrap/` 装配。
- 禁止动态 `import()`：它不在扫描范围内，会绕过边界检查。

## 4. 内容数据模型

本项目的数据模型完全按 `docs/content-model.md`（通用数据模型）实现：术语、约定、编号规则、类定义、派生与判分规则都以它为准，这里不重复。下面只记本项目特有的部分。

### 4.1 本项目的取值

| 事项 | 取值 |
| --- | --- |
| 目标语言 | 日语；启用日语扩展（汉字模块、`any-kana` / `katakana` 判分、振假名标记） |
| 界面语言 | `zh`、`en` |
| 模块 | 汉字、单词、文章、对话、文法，5 种全用 |
| 书架分级 `LibraryLevel` | `beginner`、`mid-intermediate`、`intermediate`、`jlpt-grammar` |
| 页面地址 | `?unit=<课 id>&view=<页签>`（参数名沿用旧名，以后可改成 `lesson`） |
| 课内分组 | `catalog.json` 的 `lessonGroups`，比如 カタカナ練習帳 的「発音の基礎」；页面在书名、课名旁显示，课选择器按它分 `<optgroup>` |

### 4.2 教材与分课

| 教材 | 教材 id | 一课是什么 | 课号 | 课的标题 | 模块 |
| --- | --- | --- | --- | --- | --- |
| 1日15分の漢字練習 | `ichinichi-jugofun-no-kanji-renshu` | 30 个字一课（教材本身没有课），共 18 课 | `1`–`18` | 汉字区间，如「1~30」 | 汉字 |
| 留学生のための漢字の教科書 中級700 | `kanji-no-kyokasho-chukyu-700` | 20 个字一课（不按教材自己的课），共 10 课 | `1`–`10` | 汉字区间，如「301~320」 | 汉字 |
| カタカナ練習帳 | `katakana-renshucho` | 教材的一课，共 35 课 | `1`–`35` | 教材标题 | 单词（拼写题挂在单词下） |
| 総合日本語 N2 語彙 | `sogo-nihongo-n2-goi` | 教材的一天，共 12 课 | `1-1`–`2-6`（周-天） | 「第1週 1日目 アパートを探しています」 | 单词，无题目 |
| みんなの日本語 初級Ⅰ・Ⅱ | `minna-no-nihongo-shokyu` | 教材的一课，共 50 课，另有「カタカナ」课收两册全部片假名词 | `1`–`50`、`katakana` | 教材标题 | 普通课按实际；カタカナ课只有单词 |
| 中級を学ぼう 中級前期 | `chukyu-o-manabo-chukyu-zenki` | 教材的一课，共 8 课；漢字練習并入本课汉字模块 | `1`–`8` | 教材标题 | 按实际 |
| TRY! 日本語能力試験 N2 | `try-nihongo-noryoku-shiken-n2` | 5-1、5-2 这样各算一课，共 6 课 | `5-1`、`5-2`、`6-1`、`6-2`、`9-1`、`9-2` | 教材标题 | 按实际 |
| Topic1-6（没有正式书名） | `topic-1-6` | 每个小节一课；第 3–6 课的読解各单独一课，排在本课各小节后；共 14 课 | `1-1`、`2-1`…`3-reading`…`6-reading` | 读解课如「Topic 3 読解：地震」 | 按实际 |
| 新完全マスター文法 N2 | `shin-kanzen-master-bunpo-n2` | 41 课 | `1-01`–`1-26`、`2-01`–`2-03`、`3-01`–`3-12`（部-课） | 教材标题 | 文法 |
| 日本語能力試験 N2 文法・類似表現 | `nihongo-noryoku-shiken-n2-bunpo` | 15 课 | `1-mono` … `15-scope`（Day 序号-话题名） | 教材标题 | 文法 |
| JLPT N5 動詞の活用 | `jlpt-n5-doshi-no-katsuyo` | 一页参考资料，1 课 | `verbs` | 教材标题 | 文法 |

- 中級700 的教材 id 去掉了「留学生のための」。
- 汉字 id 的最后一段用教材原编号：1日15分 是 1–540，中級700 是 301–500。
- 共用答题要求的例子：整本カタカナ練習帳共用 `katakana-renshucho.instruction`。

### 4.3 类型定义所在文件

| 类型 | 文件 |
| --- | --- |
| `Segment`、`Translation`、`TranslationCatalog`、`TextId`、`Locale` | `src/shared/kernel/text-types.ts` |
| `Sentence`、`Dialogue`、`DialogueLine`、`Example` | `src/shared/kernel/sentence.ts` |
| `Kanji`、`SpecialReading` | `src/modules/curriculum/domain/kanji.ts` |
| `Word` | `src/modules/vocabulary/domain/word.ts` |
| `Article`、`Paragraph`、`articleText` | `src/modules/reading/domain/article.ts` |
| `Grammar` | `src/modules/grammar/domain/grammar.ts` |
| `Question`、`ChoiceQuestion`、`FillInQuestion`、`RequiredScript`、`Answers`、判分 | `src/modules/assessment/domain/question.ts` |
| `LessonModules` 及 5 种模块、页签与出题收集 | `src/modules/curriculum/domain/lesson-modules.ts` |
| `Lesson` | `src/modules/curriculum/application/contracts.ts` |
| `Book`、`LessonSummary`、`LibraryLevel`、`View`、`Catalog` | `src/modules/curriculum/domain/catalog.ts` |

## 5. 内容构建流水线

```text
data/content/
  catalog.json            {schemaVersion, siteTitle, books, lessonGroups}
  units/<教材 id>/<课号>.json
  localization/learning.json、ui.json
        │
        ▼  scripts/content-compiler.mjs · build-content.mjs
  · 校验结构与 id（目录名 = 教材 id，文件名 = 课号）
  · 把每课引用到的译文收进 Lesson.texts
  · 派生目录索引 LessonSummary：页签、词数、固定题数、分组
        │
        ▼  scripts/search-index.mjs
  · 生成 search.json（文法、例句、本文、台词、单词、汉字）
        │
        ▼
public/content/   （生成目录，不进仓库）
```

**设计要点**

- **派生优先于手写**：页签、词数、题数、检索入口都从模块推导。新增一类内容只需给课加模块，不改目录。
- **前后端契约**：运行时由 `content-decoder.ts`（白名单解码）和 `search-index.ts` 解码器读取产物；字段对不上时整份拒收，而不是半信半疑地渲染。
- **缓存**：内容 JSON 请求带内容指纹 `?v=…`（`vite.config.ts` 计算），内容一变就绕开 Pages 的 10 分钟缓存。
- **开发体验**：页面读的是编译产物，改 `data/content/` 后需重跑 `pnpm dev`。

## 6. 运行时行为

### 6.1 页签推导

规则见 `content-model.md` 6.1。实现：`lesson-modules.ts` 的 `lessonViews`、`catalog.ts` 的 `defaultView`；编译期由 `content-compiler.mjs` 写进 `LessonSummary.views`。

### 6.2 测验

出题与判分规则见 `content-model.md` 6.2、7.1、8.2。本项目的固定题在迁移时已按固定种子打乱一次并固化，共 3,575 道。

### 6.3 单词测验（wordQuiz）

规则见 `content-model.md` 6.4。本项目有 141 课开启，由 `AssessmentService.vocabulary()` 生成。

### 6.4 全文检索

- 入口 `?page=search`，跨教材检索文法条目、例句、本文、台词、单词、汉字。
- 索引在构建期生成，运行时只加载和匹配，不做分词服务。

### 6.5 学习记录

- 存 localStorage，内容包括成绩、答题草稿、收藏。
- **合并**：按时间戳合并；多标签页同步与导入走同一套逻辑。
- **清空**：把代数 `generation` 加一，代数高的一方整体胜出，旧记录不会从内存或其他标签页合并回来。
- **恢复**：导入清空前的备份时先移植到当前代数，因此仍可恢复。

### 6.6 界面多语言

- 界面语言 `Locale = "zh" | "en"`，学习内容译文也只有中英。
- 界面文案 key 是联合类型 `UiTextId`，新增 key 必须同时改 `localization/ui.json` 和 `ui-text-ids.ts`，由类型检查保证不漏。

## 7. 朗读

**原则**：只用设备自带语音——浏览器走 Web Speech API，App 走系统 TTS（`android/native-bridge.js` 把 `speechSynthesis` 替换为原生实现）。停顿完全交给引擎，标点原样送入，不自行切段补静音。

**分句与排队**

1. 振假名换成假名；按角色和教材把行拼起来（原文折行不是句子边界）。
2. 在 `。！？` 处切成单句，引号括号内的句号不切，过长句按 100 字切。
3. 第 N 句开口时把后两句排进引擎，边读边合成，句间只剩引擎自身的停顿。
4. 对话按 `DialogueLine.role` 分配音色；「我／私／わたし／僕／me」共用一个声音。

**App 侧**：不用 `tts.speak` 直接读（框架只让合成领先约半秒），改为 `synthesizeToFile` 合成成文件，再由 `MediaPlayer` 顺序播放（`NativeSpeech.java`），日志记录合成耗时与句间停顿。

**句间停顿设置**：0–5000 ms，步长 50，默认 0。App 中由原生播放器在上一句播完后等待，提前合成照旧；浏览器中设了停顿就不提前排队。

**已知坑与对策**

| 现象 | 原因 | 对策 |
| --- | --- | --- |
| 点了不读 | Chrome for Android 与原生 TTS 会吞掉紧跟在 `cancel()` 之后的 speak | 空闲时调用 `play()` 不先 `cancel()` |
| 队列永久卡住 | VOICEVOX 收到纯空白文本既不开始也不结束 | `native-bridge.js` 把纯空白当作已读完，有测试守着 |
| 手机上句号不停顿 | 自行按标点切段补静音 | 停顿交给引擎 |

排查：`adb logcat -s AkamonkaiSpeech`（记录引擎、声音、每次 speak 的结果，不记课文内容）。

## 8. Android 壳

- WebView 加载随包的网页产物；原生桥接提供 TTS 和检查更新。
- 发 release 包：不可调试，R8 压缩；JS 桥接方法靠 `proguard-rules.pro` 保留。
- 壳内文案在 `values/strings.xml`（英文默认）和 `values-zh/`，跟系统语言；Java 不写字面量，两边键一致由 `pnpm check` 校验。
- **版本识别**：版本号固定 `1` / `1.0`，不靠版本号判断新旧；App 比较已安装包与 `version.json` 中的 sha256。
- **分发**：APK 随源码提交到 `public/downloads/`，从 Pages 下载。

**签名钥匙**：`android/.signing/debug.keystore` 不进仓库、仅一份、须另行备份，证书指纹登记于 `android/release-signing.json`。换钥匙会导致无法覆盖安装、卸载即丢学习记录，因此：

- 已发版却找不到钥匙时直接报错，不自动生成；
- 产物证书与登记值不符时删包并报错；
- 只有显式 `--new-signing-key` 才换钥匙。

## 9. 构建、发布与 CI

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 编译内容并启动开发服务器（127.0.0.1:4173） |
| `pnpm lint` | oxlint，0 warning |
| `pnpm check` | 全量校验（约 15 秒），支持 `--only=`、`--shuffle` |
| `pnpm build` | 校验 → 编译内容 → 类型检查 → 打包 `dist/` |
| `pnpm android:ship` | 打 APK → 写入 `public/downloads/` → 暂存 APK 与 `version.json` |
| `pnpm android:ship --verify` | 核对仓库中 APK 的 sha256、签名证书、是否由当前源码打出 |

**网站发布**：push `main` → lint → build（含全量校验）→ Android 脚本测试 → APK 核对 → 部署 Pages（base `/Akamonkai-learning/`）。

**App 发布**：改源码 → `pnpm android:ship` → commit → push。APK 的 sha256 或证书不符时 CI 失败；APK 比网页旧只告警，网站照常发布，但 App 用户看不到改动。

**构建日志**：各构建脚本按步骤写入 `logs/`（不进仓库，保留最近 20 份）；一次 ship 共用一份日志。失败时终端打印「哪一步、原因、日志位置」。

**生成目录**：`public/content/`、`dist/`、`android/app/src/main/assets/public/`、`android/app/build/` 不进仓库，可随时删除重建。

## 10. 质量保障

`pnpm check` 是自研校验套件（`scripts/harness.mjs`），不依赖测试框架：

- 用 TypeScript 6 的 `transpileModule` 把源码直接载入 Node 执行；类型检查用 TypeScript 7。
- 用例间不共享状态，夹具冻结。
- 场景清单从源码枚举推导，**覆盖率必须 100%**；删 suite 必须同时删 `scripts/scenarios.mjs` 中的场景。
- 覆盖范围：内容结构与译文完整性、题目可作答与评分、模块边界、页面渲染（中英各一遍）、语音流程、进度存储、全文检索、Android 产物（应用名、版本信息、APK 哈希与证书）。
- 不许为变绿删测试，需要放宽就改成下限断言（`>=`）。

## 11. 内容维护规范

通用的改内容规矩和结构性迁移方法见 `content-model.md` 第 9、10 节。本项目另外的约定：

1. 全角半角数字混用（`２杯` / `10本`）是教材原文，不统一。
2. 改完跑 `pnpm build`，到 `public/content/` grep 确认生效，`git diff` 只应有目标行。
3. 换行：仓库 LF、工作区 CRLF，由 `.gitattributes` 统一；迁移脚本的正则写成 `\r?\n`。
4. 迁移脚本的新旧 id 对照表和复核清单写到 `logs/`（不进仓库）。

**2026-11 数据模型重构**是唯一一次结构性迁移：一次性脚本 `scripts/migrate-classes.mjs` 按 `content-model.md` 第 10 节的方法整体改写结构，跑完即删。

## 12. 关键设计取舍

| 决策 | 选择 | 放弃的方案 / 原因 |
| --- | --- | --- |
| 题目归属 | 挂在它练的条目下 | 独立的「题目模块」——无法回答「这道题练的是什么」 |
| 页签 | 由模块推导 | 在 `catalog.json` 手写 `views`——容易与内容不一致 |
| 汉字分组 | 编译期分成课 | 运行时按 `kanjiGroupSize` 分组——链接、进度、检索都要额外转换 |
| id | 路径式、序号永不重编 | 按位置编号——调整顺序会让进度和译文失联 |
| 题目顺序 | 固化，不打乱 | 每次打乱——与教材对照困难；单词测验例外，因其本身就是练习生成 |
| 朗读停顿 | 交给引擎 | 自行切段补静音——手机上句号不停顿 |
| App 朗读 | 合成成文件后顺序播放 | `tts.speak` 直读——下一句合成太晚，句间空白长 |
| 学习记录 | 本地 + 时间戳合并 + 代数 | 云同步——需要后端与账号 |

## 13. 待定事项

| 事项 | 现状 | 方向 |
| --- | --- | --- |
| 新完全マスター、N2 文法、JLPT N5 的结构 | 暂时只有文法模块 | 以后再设计 |
| 生中継 | 未录入 | 对话模块，加单词和场景例文 |
| 单词顺序 | 保持现状 | 教材原顺序上传后逐课校正（只调排列，不改 id） |
| 页面地址参数 | `?unit=` | 可改名为 `lesson` |
| 文章分段 | 每篇整篇一段 | 按教材分段时新增段落，已有 id 不变 |
