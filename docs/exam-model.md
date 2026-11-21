# JLPT 真题数据模型

**顶层容器两套，下层构件一套**。教材那套（`Lesson` / `LessonModules` / `Word` / `Grammar`）为「一课一节」的课本设计；真题需要的是一张完整卷子：三块固定、题号按卷面、読解的题挂在文章下、聴解的题共用一条音轨。两者的卷面结构不同，因此顶层单独建模。

但**题目本身与教材共用一套 `Question`**（见 [content-model.md](./content-model.md) §5.6）：题干 / 选项都是 `Segment`，正确答案一律 `answer`，答题解析一律 `explanationId`，判分只用 `isCorrect` 一份。真题的卷面源数据按转录形态保存，编译期归一成统一 `Question`，运行时只用一套题目、判分和草稿逻辑。

层次是三层：**模块（三块）→ 小节（一页）→ 题目**。小节见第 4 节。

教材模型见 [content-model.md](./content-model.md)。

## 1. 文件在哪

| 用途 | 路径 |
| --- | --- |
| 源数据（卷面形态） | `data/exams/<bookId>/<yyyy-mm>.json` |
| 编译产物（统一 Question） | `public/content/exams/<id>.json` |
| 目录索引 | `public/content/catalog.json` 的 `exams[]` 与 `books[].examIds` |
| 领域类型 | `src/modules/exam/domain/exam.ts` |
| 编译归一 | `scripts/exam-compiler.mjs` |
| 严格解码 | `src/modules/exam/infrastructure/exam-decoder.ts` |
| 页面 | `src/modules/exam/presentation/pages/ExamPaperScreen.tsx` |
| 路由 | `?exam=<id>` |

编译由 `scripts/exam-compiler.mjs` 完成，`scripts/build-content.mjs` 在写完课后依次写真题并登记进目录。

## 2. 一场考试的形状

三块是**字段**，不是数组——顺序写死在类型里，页面照字段顺序渲染，没有第二处可以改顺序。

```jsonc
{
  "schemaVersion": 1,
  "kind": "exam",
  "id": "jlpt-n2-shiken.2021-12",
  "bookId": "jlpt-n2-shiken",     // 书架上属于哪本教材
  "title": "2021年12月",
  "examLevel": "N2",              // 考试等级；教材书架上的是 shelfLevel，两者不是一个概念

  "knowledge": { "kind": "knowledge", "groups": [ ... ] },   // 言語知識
  "reading":   { "kind": "reading",   "groups": [ ... ] },   // 読解
  "listening": { "kind": "listening", "audio": "media/...", "groups": [ ... ] } // 聴解
}
```

三块都必须有，至少一个大题。`ExamSummary` 是编译期派生的目录索引，字段为
`id` / `bookId` / `title` / `examLevel` / `questionCount`。

## 3. 三种大题（源数据形态）

下面三种大题里的题目都按**卷面原样**抄写：题干是字符串数组、选项是 `{text}` 或 `{image}`、
答案是选项下标的标量。这是转录格式，不是运行时结构。

### 3.1 言語知識：`groups[].questions[]`

```jsonc
{
  "id": "jlpt-n2-shiken.2021-12.knowledge.1",
  "label": "問題1",              // 卷面大题号
  "title": "漢字の読み方",        // 编辑加的大题名（官方题型名）
  "instruction": "＿＿の言葉の読み方として最もよいものを、1、2、3、4 から一つ選びなさい。",
  "questions": [
    {
      "id": "jlpt-n2-shiken.2021-12.knowledge.1.1",
      "number": 1,                            // 卷面题号
      "prompt": ["美しい＿情景＿が目に浮かんだ。"],
      "options": [{ "text": "じょうけい" }, { "text": "じょけい" },
                  { "text": "じょうえい" }, { "text": "じょえい" }],
      "answer": 0                              // 选项下标，从 0 起
    }
  ]
}
```

### 3.2 読解：`groups[].passages[].questions[]`

文章挂在自己的题上面，题号接着言語知識往下排。

```jsonc
{
  "id": "...reading.1",
  "label": "問題10",
  "title": "短文",
  "instruction": "次の 1 から 5 の文章を読んで、後の問いに対する答えとして最もよいものを、1、2、3、4 から一つ選びなさい。",
  "passages": [
    {
      "id": "...reading.1.1",
      "title": "(1) 森の香り",
      "body": ["森はいつも独特な香りに包まれ……", "……"],
      "questions": [{ "id": "...reading.1.1.52", "number": 52, "prompt": ["……"], "options": [...], "answer": 1 }]
    }
  ]
}
```

`body` 一段一个元素，渲染成正文块；整页材料的图放 `image`（情報検索那类）。

`passages[].title` 是**卷面上文章自己的标题**，没有就写空串 `""`：問題12/13/14 卷面只印大题指示，
指示完整存在 `groups[].instruction` 里，`title` 不重复存指示内容。
小节头在 `title` 为空时只显示「問題12」，指示照常印在下面。

### 3.3 聴解：一条音轨 + `groups[].questions[]`

```jsonc
{
  "kind": "listening",
  "audio": "media/jlpt/n2-2021-12-listening.mp3",
  "groups": [
    { "id": "...listening.1", "label": "問題1", "title": "課題理解",
      "questions": [{ "number": 1, "prompt": ["1番"], "options": [...], "answer": 2, ... }] }
  ]
}
```

- 音频挂在**整块**上，不挂在每道题上：N2 的聴解是一整条音轨，从头放到尾。
- 不含听力册、也没有音源的卷（2024-12）`audio` 用空串 `""`：页面不渲染播放器，
  改显示「この回の聴解音声は収録されていません」。其它卷必须指向 `public/media/` 下真实文件。
- `instruction` 可空：N2 聴解的答题指示是读出来的，卷面不一定印。
- 题号在另一张答题卡上，**重新从 1 起**。

## 4. 小节：模块与题目之间的一层

模块（三块）与题目之间还有一层 —— **小节**。一节就是翻页时的一页，读者左右滑一次翻一节。

小节**不另存一份数据**，它总是卷面上已经有的一个对象：

| 模块 | 一节是 | 2021-12 的节数 |
| --- | --- | --- |
| 言語知識 | 一个大题（問題1–9） | 9 |
| 読解 | **一篇文章**（問題10 有 5 篇就是 5 节） | 11 |
| 聴解 | 一个大题型（問題1–5） | 5 |
| | 合计 | **25**（101 题） |

`examSections(exam)` 把三种落点摊平成同一种形状（`ExamSection`），顺序就是数据里的数组顺序：知識大题 → 読解的每篇 → 聴解大题。页面不自己拼顺序，只有这一套。

两条由摊平规则决定的细节：

- 読解的大题指示在卷面上只印一次，所以只挂在**同组第一篇**上（`instruction` 有值），后面各篇为 `undefined`；小节头始终显示「問題10　(4) 事務商品の注文について」，读者不会不知道自己在哪个大题里；文章没有独立标题时只显示大题号。
- 小节 id 直接复用数据对象的 id（大题 id 或文章 id），所以页面锚点、翻页条下拉、`#` 深链都是同一个键。

## 5. 题目字段与编译期归一

### 5.1 源数据（卷面形态）

| 字段 | 说明 |
| --- | --- |
| `id` | 全卷唯一，必须以 `<examId>.` 开头；作答按它索引 |
| `number` | 卷面题号，正整数。同卷内可能重复（読解接着数、聴解重编），定位键是「大题 + 题号」 |
| `prompt` | 题干，一行一个元素。没有题干时写 `[]` |
| `image` | 题干配图（図の1〜4 那种），相对站点根 |
| `options` | **2–4 个**（四选一为主，聴解 問題4 是三选一），每个是 `{text}` 或 `{image}`，二者选一 |
| `answer` | 正确选项下标，整数，范围跟 `options` 长度走 |

源数据里不写 `kind`、不写 `explanationId`：按卷面抄写，归一是编译期的事。

### 5.2 产物（统一 `Question`）

编译器把每题转成与教材相同的 `ChoiceQuestion`，题目类型记作
`ExamQuestion = ChoiceQuestion & { number: number }`：

```jsonc
{
  "kind": "choice",
  "id": "jlpt-n2-shiken.2021-12.knowledge.1.1",
  "number": 1,
  "prompt": [{ "japanese": "美しい＿情景＿が目に浮かんだ。" }],
  "options": [[{ "japanese": "じょうけい" }], [{ "japanese": "じょけい" }],
              [{ "japanese": "じょうえい" }], [{ "japanese": "じょえい" }]],
  "answer": [0]
}
```

| 源字段 | 产物字段 | 转换 |
| --- | --- | --- |
| `prompt: string[]` | `prompt: Segment[]` | 每行包成 `{japanese}`；题干图追加一个 `{image}` 片段 |
| `image` | `prompt` 末尾的 `{image}` | 图仍单独渲染在题号下方，位置与卷面一致 |
| `options: {text \| image}[]` | `options: Segment[][]` | 每项包成单元素片段数组 |
| `answer: number` | `answer: number[]` | 包成单元素数组，与教材多选题同形 |
| — | `kind: "choice"` | 编译时补上 |

转换只换承载结构，文字与图片路径一字不动；编译器对每题做逐字段可逆断言，
`scripts/suites/exam.mjs` 的 `exam:compile` 用例再从源数据与产物两侧对照一遍。

**边界**：真题不做多语言，产物片段只取 `{japanese}` / `{image}`，解码器拒绝 `textId`。
答题解析全站统一是 `explanationId`（译文 id）；真题暂无解析内容，源数据不写裸字符串
`explanation`。补解析需先给真题产物配译文目录。

## 6. 解码器的硬约束

`decodeExam` 只认**编译产物**（统一 `Question`），不做「缺字段就凑合显示」，整份拒收。它保证：

1. 三个块齐全、`kind` 对得上，顶层有 `examLevel`；
2. 每个大题有 `label`（必须是「問題N」）与 `instruction`（非空、不带换行；聴解可空）；
3. 每题 `kind: "choice"`、选项 2–4 个（四択为主，聴解 問題4 即時応答是 3 択）、
   `answer` 是单个合法下标、题干是 `Segment[]`；题干允许空数组（音声题卷面不印题干），
   片段必须恰好是 `japanese` / `image` 之一，不许引用译文 id；
4. 题号连续：言語知識从 1、読解接在言語知識之后、聴解从 1 重排；
5. 题目 id 全卷唯一、属于本场考试；
6. 多余字段直接拒收（防止「写了个字段其实没人读」）。

源数据侧另有一道结构校验（`scripts/exam-compiler.mjs`），`scripts/suites/exam.mjs` 再验源数据、编译产物、解码器与目录索引四者一致。

## 7. 页面

`ExamPaperScreen`（路由 `?exam=<id>`）**一节一页**：

- 顶部：所属教材 · 考试等级、考试月份、题数、答题进度；
- 翻页条（复用站点既有的 `Paged`）最上面一行是**三大块切换**：言語知識 / 読解 / 聴解，
  各带题数；点一块直接跳到该块第一节，当前所在的块高亮（`aria-current`）。
  这一行跟着翻页条常驻，翻到第 20 页也点得到——模块比「节」粗一层，不能只靠翻页找；
- 翻页条下一行：上一节 / 页码 `10 / 22` / 小节下拉 / 索引 / 下一节；
  左右滑动手势、键盘 ←→、`#<小节 id>` 深链都能翻节；
- 每一页的页首是小节头：模块名（言語知識 / 読解 / 聴解）+「問題N」（有独立标题时追加「　小节名」）+ 题号区间；
  其下依次是该小节的答题指示、文章正文／配图、题目；
- 聴解只有一条音轨，全卷一个播放器常驻翻页条：翻到聴解时显示，离开聴解时暂停，翻页不卸载；
- 索引 = 全卷每一节的目录（各场 25–26 节），按三块分组，每行右侧是题号区间，点一行跳一节；
- 作答：每题选择题，可「提交本题」单独核对；全部作答后「提交全部」，
  成绩写进学习记录（键为 `<examId>:exam`）；判分调用教材同一份 `isCorrect` / `grade`；
- 作答草稿：键同为 `<examId>:exam`（与成绩记录是两套存储），沿用教材草稿的本地存储，
  所以「清空学习记录」会一并清除；改动后 200 ms 防抖保存，离开页面或切后台立即保存；
  提交成功或点「重做」清除；题目 id 顺序变了或草稿损坏，整份丢弃。

## 8. 加一场新考试

1. 把真题 PDF 渲染成图（`pypdfium2`），逐页转录，答案取卷末答案表；
2. 按第 2–5 节写 `data/exams/<bookId>/<yyyy-mm>.json`（卷面形态，不要在源文件里写 `kind` 或 `explanationId`）；
3. 在 `data/content/catalog.json` 对应教材的 `examIds` 里登记；
4. 跑 `node scripts/build-content.mjs && node scripts/check.mjs`；
5. 打开 `?exam=<id>` 与卷面逐页对照。

音频放 `public/media/jlpt/`，命名 `n2-<年>-<月>-listening.mp3`。

## 9. 收录范围与限制

- 聴解 問題3（概要理解）、問題4（即時応答）、問題5 的 1番，选项只在音声里读、卷面不印：
  按答案表逐题收录，题干为空数组、选项为占位符「（音声）」，**不是真题选项**。
  补到听力原文时可原地替换为真实选项，结构不用改。問題5 的 2番（質問1／質問2）卷面印有选项，逐字照抄；
- 真题暂无答题解析（答案解析册未转录）。补解析需先定真题产物的译文目录，解析一律走 `explanationId`；
- 全文检索不含真题（搜索索引只从教材课生成）。
