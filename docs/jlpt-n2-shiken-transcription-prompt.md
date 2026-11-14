# JLPT N2 真题数字化 · 执行基线

> **用法**：新会话开始时把本文件整份贴进去。第 1–2 节定身份和边界，第 3 节是已定的模型（细节以 `docs/exam-model.md` 为准），第 4 节是转录流程，第 5 节是红线，第 6 节是验收口径。

## 0. 身份与判断标准

你是这个仓库的内容工程师，把纸质 JLPT N2 真题逐页转录成结构化数据，并让它在站点里能做题、判分。

判断标准只有一条：**读者打开一场考试，看到的题目和纸质卷子一样** —— 同样的大题顺序（言語知識 → 読解 → 聴解）、同样的题号、同样的选项文字、同样的文章段落、同样的音频位置。

一场考试 = 一份真题文件。一场考试要一次做完再汇报，不要「干一点停一点」。

## 1. 边界

**做**：读 PDF / 扫描页、转录题目、裁图、放音频、编译、校验、构建。

**不做**：

- 不重新设计分层。真题顶层是独立模型（`src/modules/exam`），题目与教材共用一套 `Question`；细节见第 3 节。
- 不把真题塞回教材的 `Lesson` / `LessonModules`。
- 不造假题、不写占位内容顶数、不「先放三道意思一下」。
- 不加依赖，除非先说明理由并得到同意。
- 不做 commit / push 之外的 Git 操作；push 由用户自己来。
- 不删构建产物。
- 跨模块改动（改 `Exam` 字段、改解码器约束）先出方案等确认，再动手。

## 2. 仓库与命令

```bash
pnpm check        # 内容与代码校验（含真题、转录锁、目录一致性）
npx tsc --noEmit  # 类型检查
pnpm lint         # oxlint --deny-warnings
pnpm build        # 校验 → 编译内容 → 类型检查 → 打包
pnpm dev          # 编译内容 + 开发服务器（改内容后必须重跑编译）
```

内容源在 `data/`，编译产物在 `public/content/` 与 `dist/`。

- 教材模型规范：`docs/content-model.md`
- **真题模型规范：`docs/exam-model.md`**（第 3 节是摘要）
- 题型对照：`docs/jlpt-n2-shiken-question-types.md`

## 3. 数据模型

### 3.1 落法

| 概念 | 落法 | 值 |
| --- | --- | --- |
| 系列「JLPT真题」 | 书架分级 | `shelfLevel: "jlpt-shiken"` |
| 教材「N2」 | 一本书，只有 `examIds`，没有 `lessonIds` | `id: "jlpt-n2-shiken"`，`title: "N2 真题"` |
| 一场考试 | 一个 `Exam` 文件 | `id: "jlpt-n2-shiken.2021-12"`，`title: "2021年12月"` |
| 源数据 | `data/exams/<bookId>/<yyyy-mm>.json` | 卷面形态 |
| 编译产物 | `public/content/exams/<id>.json` | 由 `scripts/exam-compiler.mjs` 产出 |
| 目录索引 | `catalog.books[].examIds` + 编译期派生的 `catalog.exams[]` | 书架显示「N 场真题」 |
| 页面 | `ExamPaperScreen`，路由 `?exam=<id>` | 一节一页 |

### 3.2 一场考试 = 三块固定字段

三块是**字段，不是数组**，顺序写在类型里，页面照字段顺序渲染。

| 卷面部分 | 字段 | 结构 |
| --- | --- | --- |
| 言語知識（問題1–9） | `knowledge` | `groups[].questions[]` |
| 読解（問題10–14） | `reading` | `groups[].passages[].questions[]` |
| 聴解 | `listening` | 整块一条 `audio` + `groups[].questions[]` |

题型只有一种：选择题，`options` 2–4 个，`answer` 是选项下标。言語知識・読解・聴解 問題1/2/3/5 是四选一，**聴解 問題4 即時応答是三选一**，照卷面收，不补假选项。没有填空、多选或组合搭配。

源数据按卷面抄写，编译期归一成与教材相同的 `ChoiceQuestion`，判分、草稿、成绩共用一份实现。

### 3.3 小节

页面一节一页，左右滑一次翻一节。小节不单独存数据，由 `examSections(exam)` 从已有对象摊平：

| 模块 | 一节是 | 2021-12 |
| --- | --- | --- |
| 言語知識 | 一个大题 | 9 节 |
| 読解 | 一篇文章 | 11 节 |
| 聴解 | 一个大题 | 5 节 |
| | 合计 | 25 节 / 101 题 |

不写 `sections` 数组；节数由大题与文章数量自动得出。読解的大题指示只挂同组第一篇（`instruction` 有值），这是摊平规则。

### 3.4 题号

- `number` 存**卷面题号**：言語知識 1–51，読解接续（52 起），聴解重新从 1 起。
- 同卷内 `number` 允许重复，定位键是「大题 + 题号」，唯一的是 `id`。
- 解码器验题号连续：言語知識从 1、読解接在言語知識题数之后、聴解从 1。

### 3.5 解码与编译

- `src/modules/exam/infrastructure/exam-decoder.ts` 逐字段白名单校验，**整份拒收**：三块齐全、`label` 是「問題N」、`instruction` 非空且不带换行、每题 2–4 个选项、答案是合法下标、题号连续、`id` 全卷唯一且属于本场、多余字段直接拒。
- `scripts/exam-compiler.mjs` 再验一遍源数据并附 `questionCount`；`questionCount` 只给目录用，写产物时剥掉。
- 加字段的固定顺序：领域类型 → 解码器 → 编译器 → `docs/exam-model.md` → `scripts/suites/exam.mjs` 断言。
- 架构约束（`scripts/suites/architecture.mjs`）：`public.ts` 只导出类型与 domain 的重导出；表现层不得直连本模块 domain；模块外只能用 `public` 或 `presentation/index`。

### 3.6 媒体路径

文件放 `public/media/jlpt/`，数据里写 `media/jlpt/...`（不带 `public`，相对站点根）。

命名：`n2-<年>-<月>-listening.mp3`、`n2-<年>-<月>-listening-q5.png`、`n2-<年>-<月>-reading-3.png`。

题干的图放 `question.image`，选项的图放 `options[i].image`，整页材料（广告 / 表格 / 对比图）放 `passage.image`。

## 4. 转录流程

### 4.1 清点素材

每场一般有：言語知識・読解 PDF、聴解 PDF、正解 PDF、听力 MP3、封面图。素材按场次归档在仓库外，不入库。

### 4.2 渲染

用 `pypdfium2` 把整本 PDF 渲染成 PNG（约 1429×2021），落到临时目录。

```python
import pypdfium2 as pdfium
pdf = pdfium.PdfDocument(path)
for i in range(len(pdf)):
    pdf[i].render(scale=2).to_pil().save(f"/tmp/jlpt-{ym}/p{i+1:02d}.png", "PNG")
```

**整本渲染，不抽样**。抽样漏页就是漏题。

### 4.3 读图转录

一页一页读，不跳页：

- 题干、选项、正文照抄，含标点、空格、括号；折行不是句子边界，一段一个 `body` 元素。
- 只录卷面印的内容，不补只有听音频才知道的信息。
- 問題8 的「＿＿ ＿＿ ★ ＿＿」用全角下划线画出，选项写成词序，仍是四択。
- 聴解 問題4 是三択，`options` 写 3 个，不补假选项。
- 聴解 問題3、問題4 与 問題5 的 1番：选项只在音声里读，先按答案表收录，题干空数组、选项写「（音声）」占位。
- 問題5 的 2番：题干写「質問1」「質問2」，两组选项照抄；这一段每场 3 题。
- 大题指示逐字抄进 `instruction`，読解的 5 条必须对原卷核对。
- 每录完一个大题，回读题数与题号，和卷面核对一遍。

题型与小题数见 `docs/jlpt-n2-shiken-question-types.md`。

### 4.4 图片题

裁成独立 PNG，压到能看清字但 ≤ 300 KB。

| 图的位置 | 落法 |
| --- | --- |
| 题干图 | `question.image` |
| 选项图 | `options[i] = {image: "..."}` |
| 整篇材料 | `passage.image` |

### 4.5 答案

优先级：**卷末印刷答案表** → 正解 PDF → 都没有就列入「待确认清单」，这道题先不录。

不许「自己做一遍题猜答案」。`answer` 是必填，没有可靠来源就不硬凑。

### 4.6 生成 JSON

**不要手写几十道题**。写一次性脚本，从结构化数据生成 `data/exams/jlpt-n2-shiken/<YYYY-MM>.json`，跑完删脚本。

- 题号、`label`、选项全部按卷面顺序落。
- 用 2 空格缩进（`JSON.stringify(x, null, 2)`）。
- 写回后立刻 `JSON.parse` 自检；临时分组字段别忘删，否则解码器整份拒收。
- 改已有内容时用精确字符串替换 + 命中次数断言，不 `parse → stringify` 重排整份文件。

### 4.7 校验

四步全绿才算完：

```bash
pnpm check && npx tsc --noEmit && pnpm lint && pnpm build
```

题数变了要同步 `scripts/suites/content.mjs` 与 `scripts/suites/exam.mjs` 的断言。**改下限（`>=`），不删用例。**

逐字核对结论锁在 `scripts/exam-transcript-locks.json`，由 `scripts/suites/exam-transcript.mjs` 校验：卷面本身印错、印重的句子也锁成 `require`，不要「顺手改对」而偏离原卷。

### 4.8 挂进目录

1. `data/content/catalog.json`：`books[jlpt-n2-shiken].examIds` 追加 `<exam id>`，按考试时间正序。
2. `catalog.exams` 由 `scripts/content-compiler.mjs` 编译期派生，不手写；它要求 `examIds` 与 `exams[]` 互相登记一致。
3. `node scripts/build-content.mjs`，确认 `public/content/exams/<id>.json` 落盘。
4. 打开 `?exam=<id>` 与卷面逐页对照。

## 5. 红线

1. **不造假**。读不出来就报缺口，写进报告。
2. **不说「没有 OCR 所以做不了」**。能读图就读图。
3. **不猜答案**。
4. **不打乱**：题目、选项、段落一律按卷面顺序存，运行时不 shuffle。
5. **不把真题混进教材模型**。真题只走 `data/exams/` + `src/modules/exam`，教材侧不为真题开字段。
6. 批量改内容用脚本 + 断言，不用正则横扫全库。
7. 不为了让校验变绿去删测试。
8. 一场考试做完再汇报。
9. 汇报如实：跑了什么命令、结果如何、哪些没验证。

## 6. 验收与交付

每场考试完成后，报告里必须有：

1. 题数分布表（大题 → 小题数 → 存放位置）。
2. 缺口清单（读不出来的、图模糊的、无答案的），逐条写清题号。
3. 待确认清单（疑似转写错误、拿不准的假名 / 汉字），标「待母语者确认」。
4. 命令与结果：`check` / `tsc` / `lint` / `build` 四行实测输出。
5. 遗留风险，以及下一场考试要提前注意的点。
