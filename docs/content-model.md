# 学习内容数据模型（通用）

> **用途**：语言学习类 app 共用的内容数据模型，是跨项目的核心资产。给人和 AI 看；某个 app 的实现和本文不一致时，要么改实现，要么先改本文再改实现，不各自分叉。本仓库的实现见 `docs/design.md`。
> **范围**：第 1–7 节是与学科、语言无关的核心；第 8 节是日语扩展；第 9–10 节是内容源和迁移的做法；第 11 节是接入新 app 时要定的事。
> **读法**：先看第 1–4 节弄清概念和编号，第 5 节是类定义，第 6–7 节是派生和判分规则。

## 1. 术语

| 术语 | 含义 | 不要混淆 |
| --- | --- | --- |
| 教材（Book） | 一本书或一套资料 | |
| 课（Lesson） | 教材里的一课，是目录里点进去的一项，也是学习进度的记录单位 | 不叫「单元（unit）」 |
| 模块（Module） | 一课里同一类内容的集合：单词、文章、对话、文法，以及扩展模块（如汉字） | 不是代码目录 |
| 条目 | 模块里的一项内容：一个单词、一篇文章、一段对话、一条文法…… | |
| 题目（Question） | 选择题或填空题，挂在它练的那个条目下面 | 题目不是模块 |
| 原文 | 学习对象语言（目标语言）写的内容，照抄教材 | |
| 译文 | 一条多语言文本 `{界面语言: 写法}`，用译文 id 引用 | |
| 页签（View） | 课页面上的切换按钮，由模块推导 | 不手写 |
| 拆解（Breakdown） | 内容条目自身的构成讲解：`analysisId`，译文 id，与作答无关，随时可看 | 中文不叫「解析」；字段不叫 `explanationId` |
| 解析（Explanation） | 题目答完后才显示的答题解析：`explanationId`，译文 id，讲为什么选这个 | 中文不叫「拆解」；文法讲解面板另叫「讲解」 |
| 卷面指示（instruction） | 卷面印出来的答题要求，照抄原文的字符串，不走译文目录 | 与 `instructionId`（译文 id）是两回事 |

**一个概念 = 一个字段名 = 一个类型**。`…Id` 只表示译文引用，`…Ids` 是译文引用数组，
对象数组用复数；目标语言原文直接存字符串，一切讲解走译文。全站共用这张表：

| 概念 | 唯一字段名 | 类型 | 用在哪 |
| --- | --- | --- | --- |
| 身份 / 类型 | `id` / `kind` | `string` / 全局唯一字面量 | 所有可寻址对象 |
| 译文 / 意思 / 补充说明 | `translationId` / `meaningId` / `noteIds` | `TextId` / `readonly TextId[]` | 句子、词、文法、汉字 |
| 内容拆解 | `analysisId` | `TextId` | 句子、对话、词，中文一律「拆解」 |
| 词性 / 自他 / 基本形 | `pos` / `transitivity` / `lemma` | 封闭枚举 / 封闭枚举 / `string` | 只有词；前三者是机读字段，不进译文 |
| 搭配骨架 / 近义辨析 | `patterns` / `contrasts` | `WordPattern[]` / `WordContrast[]` | 只有词；骨架存日语原形，说明走译文 |
| 题目集合 / 题干 / 选项 | `questions` / `prompt` / `options` | `Question[]` / `Segment[]` / `Segment[][]` | 教材与真题共用 |
| 正确答案 | `answer` | 由 `kind` 决定：下标数组 / 可接受答案数组 | 所有题目，含真题 |
| 答题解析 | `explanationId` | `TextId` | 所有题目，中文一律「解析」 |
| 答题要求（译文）/ 卷面指示（原文） | `instructionId` / `instruction` | `TextId` / `string` | 前者教材题与模块，后者真题大题 |
| 整篇录音 | `audio` | `string` | 文章（本文录音）；真题听力同名，见 `docs/exam-model.md` |
| 板块小标题 / 组内编号 | `section` / `group` | `string` | 带 ■ 小标题与 ①②③④ 分组的对话台词、由它转成的镜像段落 |
| 书架分级 / 考试等级 | `shelfLevel` / `examLevel` | `LibraryLevel` / `string` | 教材 / 真题，不是同一个概念 |

## 2. 总体结构

```text
Book（教材）
└── lessonIds → Lesson（课）              每课一个文件
    └── modules: LessonModules            各模块都可选，没有的不写，至少一种
        ├── kanji?: KanjiModule           扩展：汉字（第 8 节）
        │   └── items: Kanji[]
        │       ├── words: Word[]         例词（读音题挂在这里）
        │       └── examples: Sentence[]
        ├── words?: WordModule
        │   └── items: Word[] ── questions
        ├── articles?: ArticleModule      叙述文
        │   └── items: Article[] ── questions
        │       └── paragraphs: Paragraph[] → sentences: Sentence[]
        ├── dialogues?: DialogueModule    会话
        │   └── items: Dialogue[] ── questions
        │       └── lines: DialogueLine[] → sentences: Sentence[]
        └── grammar?: GrammarModule
            └── items: Grammar[] ── questions
                ├── examples: (Sentence | Dialogue)[]
                └── children: Grammar[]
```

原文写在对象自身的字段里；所有讲解、词义、翻译都是译文，通过 `…Id` 引用，集中存放。

## 3. 通用约定

- **字段命名**
  - 原文字段不加语言后缀，写 `text`、`title`、`word`。学习内容本身就是目标语言，界面语言只通过 `…Id` 引用译文。
  - 不用缩写，只保留 `id` / `…Id` 和语言代码。
  - 同一概念不换名字：正确答案一律 `answer`（选择题是下标数组、填空题是可接受答案数组，由 `kind` 判别），补充说明一律复数 `noteIds`。
- **`kind` 类型标记**：内容类都带 `kind`，放在第一个字段，取值全库不重复。只作为别的类组成部分的辅助结构不带，比如 `DialogueLine`、`Translation`、`Segment`、`LessonModules`、`QuestionBase`、`SpecialReading`。
- **只读**：全部字段 `readonly`。
- **可选与空**：可选字段缺省时不写进 JSON，不写 `null` 或空字符串；数组没有内容时写 `[]`。
- **顺序**：所有数组按教材原顺序存，编译、显示、检索、测验都不重排。
- **原文**：照抄教材，只有能证明是转写错误才改；拿不准就标「待母语者确认」。
- **字符规范**：正文里的阿拉伯数字、拉丁字母一律**半角**（`0-9`、`A-Z` / `a-z`），标点一律**全角**（日语的「、」「。」「？」「！」「・」「ー」「「」」等）。书页上把数字印成全角也要按规范录成半角，不再逐处照抄印刷形态；角色名 `A` / `B` 同样用半角。排版折行位置用全角空格「　」，不用半角空格；日文正文里不出现半角逗号、句点、问号。
- **互斥字段用类型保证**：几选一的字段写成联合类型，其余支用 `?: never` 禁掉（见 `Segment` 的原文 / 译文 / 图片三选一）。
- **类型定义的写法**
  - 注释用团队母语写，目标语言的术语附上原词，比如「训读（訓読み）」。
  - 每个文件从外到里：先写外层类型，再写它包含的内层类型。
  - 每个类先写身份字段（`kind`、`id`、标题），再写内容字段；内容字段从小到大。

## 4. 编号（id）

### 4.1 总规则

1. **id 即路径**：父级 id 后面接 `.类型.序号`，从 id 就能读出它属于哪本书、哪一课、哪一条内容。
2. **字符**：只用小写英文、数字和 `-`。`.` 只用来分层；`-` 只出现在一段名字内部，比如 `5-1`、`3-reading`。
3. **序号**：从 0 开始，一次性按教材顺序分配，**之后不再重编**。调整顺序只改列表里的排列，不改 id；新增内容接已有最大序号往后编。所以序号不一定等于现在的位置。
4. **类型段**：直接用 `kind` 的值。例外：文法里的例句统一用 `example`，因为它可能是单句，也可能是对话。
5. **教材原编号优先**：教材本身给条目编了号（比如「漢字 091」），最后一段用原编号，便于对照纸质教材。
6. **教材 id**：书名全称的罗马字（或英文）转写，全小写、`-` 连接；全称太长可去掉修饰性前缀。

### 4.2 各层的 id

| 对象 | 格式 | 例子 |
| --- | --- | --- |
| 课 | `教材.课号` | `sample-book.5-1` |
| 模块里的条目 | `课.类型.序号` | `sample-book.1.grammar.0` |
| 条目的子条目 | `父条目.类型.序号` | `….grammar.5.grammar.0`、`….kanji.91.word.2` |
| 文章的段落 | `文章.paragraph.序号` | `sample-book.1.article.0.paragraph.0` |
| 文法里的例句 | `文法.example.序号` | `sample-book.1.grammar.1.example.0` |
| 题目 | `所属条目.question.序号` | `sample-book.1.grammar.0.question.1` |

句子（`Sentence`）和台词（`DialogueLine`）没有 id 字段，它们的译文 id 按「所属对象 id + 位置」编。

### 4.3 译文 id

格式：**所属对象 id + `.` + 字段名**，字段名是去掉 `Id` 后缀的部分。

| 字段 | 译文 id 例子 |
| --- | --- |
| `meaningId` | `sample-book.1.word.0.meaning` |
| `formationId` / `usageId` / `pitfallId` | `….grammar.0.formation` / `.usage` / `.pitfall` |
| `introductionId` / `instructionId` / `explanationId` | `….introduction` / `.instruction` / `.explanation` |
| 数组字段 `noteIds` 的第 3 条 | `….grammar.0.note.2`；单词同理 `….word.0.note.0` |
| 单词的搭配说明 `patterns[].usageId` | `….word.0.pattern.0.usage` |
| 单词的辨析词义 / 差别 `contrasts[].glossId` / `.differenceId` | `….word.0.contrast.1.gloss` / `….word.0.contrast.1.difference` |
| 文法例句的 `translationId` | `….grammar.0.example.3.translation` |
| 段落里第 5 句的 `translationId` | `….article.0.paragraph.0.sentence.4.translation` |
| 第 3 段台词的 `translationId` | `….dialogue.0.line.2.translation` |
| `analysisId` | 所属对象 id + `.analysis`，如 `….word.0.analysis`、`….article.0.paragraph.0.sentence.4.analysis`、`….dialogue.0.analysis` |
| 题干、选项里引用的译文 | `….question.1.prompt.0`、`….question.1.option.2` |

多个对象共用的译文，挂在它们最近的共同上级，比如整本书共用的答题要求是 `sample-book.instruction`。界面文案（`ui.*`）不受这套规则约束。

### 4.4 由课 id 派生

| 用途 | 格式 |
| --- | --- |
| 页面地址 | `?lesson=<课 id>&view=<页签>`（参数名由 app 定） |
| 学习成绩、答题草稿的键 | `<课 id>:<页签>` |
| 编译产物 | `content/units/<课 id>.json` |
| 源数据 | `units/<教材 id>/<课号>.json`，目录名必须等于教材 id，文件名去掉扩展名就是课号 |

## 5. 类定义

下面的 `japanese` 字段名和 `zh` / `en` 是日语 app 的取值，接入别的语言时按第 11 节改。

### 5.1 基础类型

```ts
/**
 * 题干、选项里的一小段内容：原文、一条译文、或一张图。
 * 三个字段必须且只能有一个。教材与真题共用这一套片段。
 */
export type Segment =
    | {
        /** 原文，原样显示。字段名取目标语言名。 */
        readonly japanese: string;
        readonly textId?: never;
        readonly image?: never;
    }
    | {
        /** 引用的译文 id，按界面语言显示。 */
        readonly textId: TextId;
        readonly japanese?: never;
        readonly image?: never;
    }
    | {
        /** 图片路径，相对站点根。 */
        readonly image: string;
        readonly japanese?: never;
        readonly textId?: never;
    };

/** 一条译文：同一个意思在各界面语言下的写法，每种界面语言一个字段。 */
export interface Translation {
    readonly zh: string;
    readonly en: string;
}

/** 某一课用到的全部译文，按译文 id 索引。 */
export type TranslationCatalog = Readonly<Record<TextId, Translation>>;

/** 译文 id，写法见 4.3。 */
export type TextId = string;

/** 界面语言，取 ISO 639-1 代码。 */
export type Locale = "zh" | "en";
```

### 5.2 句子与对话

```ts
/** 句子：最小的可读单位。没有 id，译文 id 按位置编。 */
export interface Sentence {
    readonly kind: "sentence";
    /** 原文，照抄教材。可以带注音标记（见第 8 节）。 */
    readonly text: string;
    /** 整句的译文。对话台词里的句子不带，译文在台词上。 */
    readonly translationId?: TextId;
    /** 内容拆解。只有值得讲解的句子才有。 */
    readonly analysisId?: TextId;
}

/** 例句：一个单句，或者一段对话。只用在文法条目里。 */
export type Example = Sentence | Dialogue;

/** 对话：几个人轮流说的一段话。可以是对话模块里的一篇会话，也可以是文法的一条例句。 */
export interface Dialogue {
    readonly kind: "dialogue";
    /** 对话模块里是 `课.dialogue.序号`；作为文法例句是 `文法.example.序号`。 */
    readonly id: string;
    /** 原文标题。作为例句的对话没有标题。 */
    readonly title?: string;
    /** 对话前的场景说明。 */
    readonly introductionId?: TextId;
    /** 整段对话的内容拆解。讲的是整段来回，拆不到单句上，所以挂在整段上。 */
    readonly analysisId?: TextId;
    /** 台词，按原文顺序，至少两段。 */
    readonly lines: readonly DialogueLine[];
    /** 练这段对话的题目。没有时是空数组。 */
    readonly questions: readonly Question[];
}

/** 一段台词：一个人连续说的话，可能有好几句。 */
export interface DialogueLine {
    /** 板块小标题。教材一条录音轨对应一篇对话时才写，只写在该篇第一条台词上。 */
    readonly section?: string;
    /** 该篇内的小组编号（「①」「②」……），只写在该组第一条台词上。 */
    readonly group?: string;
    /** 说话的人，照抄原文标签（如「A」「渡辺」），不含冒号。朗读时按它分配音色。 */
    readonly role: string;
    /** 整段台词的译文。译文通常只能按角色对齐、不能按句对齐，所以挂在台词上。 */
    readonly translationId?: TextId;
    /** 台词里的句子，按原文顺序，至少一句，不含角色标签，不带 translationId。 */
    readonly sentences: readonly Sentence[];
}
```

**一篇对话对应教材一条录音轨、且轨内按 ①②③④ 分组时**（例如 日本語生中継 的每条【重要表現】轨），每条轨各自成一篇 `Dialogue`，**不合并**；篇内用两个**起始标记**隔开：

- `section` 只写在该篇第一条台词上，值是书页 ■ 小标题原文（不带 ■），每篇恰好一个；
- `group` 只写在每个 ①②③④ 组的第一条台词上，值是组号；
- 篇首那条台词同时带 `section` 和 `group`；组内后续台词两个字段都不写；
- 标记只是「从这里开始」的信号，不是每条台词都要重复的分类字段；页面据此渲染小标题和组间分隔；
- 台词顺序仍按教材原顺序，译文 `translationId` 保持原值不变（译文按 id 索引，与所在位置无关），重排不会让译文错位。

其它对话（含文法例句）不写这两个字段，页面按平铺排版。

### 5.3 文章与段落

```ts
/** 文章：教材的本文，只放叙述文。会话放对话模块，文法讲解放文法模块。 */
export interface Article {
    readonly kind: "article";
    readonly id: string;
    /** 原文标题。 */
    readonly title: string;
    /** 整篇课文的录音，相对站点根（`media/…mp3`）。没有录音的文章不写，朗读由 TTS 兜底。 */
    readonly audio?: string;
    /** 正文前的导语。 */
    readonly introductionId?: TextId;
    /** 段落，按原文顺序，至少一段。没有分段信息时整篇算一段，以后分段只新增，已有 id 不变。 */
    readonly paragraphs: readonly Paragraph[];
    /** 练这篇文章的题目，比如阅读理解题。没有时是空数组。 */
    readonly questions: readonly Question[];
}

/** 段落：按原文顺序排列的若干句子。 */
export interface Paragraph {
    readonly kind: "paragraph";
    readonly id: string;
    /** 板块小标题。由带分组的对话转成的镜像文章才写，只写在该篇第一段上。 */
    readonly section?: string;
    /** 该篇内的小组编号，只写在该组第一段上。 */
    readonly group?: string;
    /** 说话的人。只有由会话转成的跟读文章才写，普通叙述文不写。 */
    readonly role?: string;
    /** 至少一句。 */
    readonly sentences: readonly Sentence[];
}

/**
 * 由会话转成的跟读文章按角色分段：一个角色连续说的话合为一段，`role` 写在段落上，
 * 角色名只在段落头显示一次；原文折行不是段落边界，折行后的句子接在同一段里。
 * 这类段落的句子不带 `translationId` / `analysisId`，译文仍由原来的对话模块承载。
 *
 * 若源对话带上面那种 `section` / `group` 起始标记，镜像文章要同步带上：
 * 遇到带标记的台词必须另起一段，不能因为角色相同就并进上一段，否则组与组的边界会丢失。
 * 标记落在该篇／该组的第一个段落上，其余段落不写。
 */

/** 整篇正文：各段各句按顺序直接拼接，中间不加任何字符。不另存整篇文本。 */
export function articleText(article: Article): string {
    return article.paragraphs.flatMap((p) => p.sentences).map((s) => s.text).join("");
}
```

### 5.4 单词

```ts
/** 词性。封闭枚举，显示走界面文案（`ui.partOfSpeech.*`），不按词条存译文。 */
export type PartOfSpeech =
    | "noun" | "verbal-noun" | "verb" | "i-adjective" | "na-adjective"
    | "adverb" | "conjunction" | "adnominal" | "interjection"
    | "prefix" | "suffix" | "counter" | "expression" | "other";

/** 自他。只对动词与サ変名詞写。判不准就不写。 */
export type Transitivity = "intransitive" | "transitive" | "both";

/** 一条搭配骨架：日语原形 + 说明。`<w>` 代表这个词的基本形。 */
export interface WordPattern {
    readonly pattern: string;
    readonly usageId: TextId;
}

/** 一项近义辨析：容易混的词 + 它的词义 + 差别。 */
export interface WordContrast {
    readonly word: string;
    readonly glossId: TextId;
    readonly wordId?: string;
    readonly differenceId: TextId;
}

/** 单词。可以在单词模块里，也可以是别的条目的例词（如汉字的例词）。 */
export interface Word {
    readonly kind: "word";
    readonly id: string;
    /** 写法。 */
    readonly word: string;
    /** 读音（注音写法）。 */
    readonly reading: string;
    /** 基本形。只在写法不是基本形时写（敬体 `生きます` → `生きる`、`効果的（な）` → `効果的`）。 */
    readonly lemma?: string;
    /** 词性。 */
    readonly pos?: PartOfSpeech;
    /** 自他。只对动词与サ変名詞写。 */
    readonly transitivity?: Transitivity;
    /** 词义。 */
    readonly meaningId: TextId;
    /** 用法说明：什么场合用、搭配什么词。按原文顺序，没有时不写。 */
    readonly noteIds?: readonly TextId[];
    /** 搭配骨架：跟哪些助词、固定组合绑在一起。按重要性排。 */
    readonly patterns?: readonly WordPattern[];
    /** 近义辨析：容易被搞混的词和差别。 */
    readonly contrasts?: readonly WordContrast[];
    /** 内容拆解：构词、汉字读音、语体限制等。只有值得讲解的词才有。 */
    readonly analysisId?: TextId;
    /** 练这个词的题目，比如读音题、拼写题。没有时是空数组。 */
    readonly questions: readonly Question[];
}
```

`noteIds` 讲「这个词怎么用」，`patterns` 讲「配哪些助词、哪些固定组合」，`contrasts` 讲「和哪个词容易混、差在哪」，`analysisId` 讲「这个词本身怎么构成」。四块可以同时存在，也都可以没有。

- **词性、自他、基本形是机读字段**，不进译文：`pos` / `transitivity` 是封闭枚举，显示文案走 `ui.partOfSpeech.*` / `ui.transitivity.*`（全库词条共用一句话，不按词条存）；`lemma` 是日语原文，只在写法不是基本形时写，骨架里的 `<w>` 展开的就是它。
- **骨架不翻译**：`pattern` 是日语原形，`N` 表名词、`<w>` 表本词。`<w>` 不用 `～`，因为部分词条写法自带 `～`（`～代`、`～社`）。
- **辨析的对方词要带词义**（`glossId`）：对方词在本课词表里时直接复用它的 `meaningId`，不在本课时新增 `.contrast.<n>.gloss`；跨课引用别人的 `meaningId` 会在运行时取不到译文而被拒收。
- **带 `～` 的构词成分、`prefix` / `suffix` / `counter`、带句号的定型寒暄句不写 `patterns`**：它们没有「搭配助词」可言。
- **词表页排版**：`noteIds` 直接展开（通常只有一行）；`patterns` 的说明、`contrasts`、`analysisId` 收在「拆解」折叠区里，默认收起。词性、自他以小徽章常驻行内。
- 内容生产口径见 `docs/word-analysis-prompt.md`。

### 5.5 文法

```ts
/** 文法条目。讲解字段在所有教材之间统一，教材自己的讲解分块都归到这些字段里。 */
export interface Grammar {
    readonly kind: "grammar";
    readonly id: string;
    /** 原文标题，比如「～ものだ」。 */
    readonly title: string;
    /** 接续：前面接什么词、什么形式。 */
    readonly formationId?: TextId;
    /** 意思：这个句型表达什么。 */
    readonly meaningId?: TextId;
    /** 用法：什么场合用、语气如何。 */
    readonly usageId?: TextId;
    /** 易错点，以及和相似句型的区别。 */
    readonly pitfallId?: TextId;
    /** 例句，单句或对话，按原文顺序。没有时是空数组。 */
    readonly examples: readonly Example[];
    /** 补充说明，按原文顺序；归不进上面四个字段的讲解都放这里。没有时是空数组。 */
    readonly noteIds: readonly TextId[];
    /** 下级条目。没有时是空数组。 */
    readonly children: readonly Grammar[];
    /** 练这个文法的题目。没有时是空数组。 */
    readonly questions: readonly Question[];
}
```

把教材原有讲解归到字段时，按语义归：意思类 → `meaningId`，接续类 → `formationId`，用法 / 语感类 → `usageId`，易错 / 对比类 → `pitfallId`，其余全部按原顺序进 `noteIds`。

### 5.6 题目

题目不是模块，挂在它练的那个条目下面。

```ts
/** 题目：选择题或填空题。教材与真题共用这一套，判分也只用 isCorrect 一份。 */
export type Question = ChoiceQuestion | FillInQuestion;

/** 两种题目共有的部分。 */
interface QuestionBase {
    /** 作答记录按它保存。 */
    readonly id: string;
    /** 答题要求，比如「选出正确的一项」。卷面照抄的指示是 instruction，不是这个字段。 */
    readonly instructionId?: TextId;
    /** 题干，原文、译文、图片可以混排。 */
    readonly prompt: readonly Segment[];
    /** 答题解析：答完后才显示，讲为什么选这个。与内容拆解 analysisId 是两回事。 */
    readonly explanationId?: TextId;
    /** 卷面题号。只有真题写，教材题按页面顺序编号。 */
    readonly number?: number;
}

/** 选择题。 */
export interface ChoiceQuestion extends QuestionBase {
    readonly kind: "choice";
    /** 选项，至少两个，按卷面 / 教材顺序，出题时不打乱；每个选项是一串内容片段。 */
    readonly options: readonly (readonly Segment[])[];
    /** 正确选项的下标，从 0 开始，至少一个，可以有多个。 */
    readonly answer: readonly number[];
}

/** 填空题。 */
export interface FillInQuestion extends QuestionBase {
    readonly kind: "fill-in";
    /** 可以接受的答案，至少一个，满足任意一个就算对。 */
    readonly answer: readonly string[];
    /** 对答案用字的要求，判分只看这个字段，不从答案本身猜。取值由语言扩展定义。 */
    readonly requiredScript: RequiredScript;
}

/** 学生的作答，按题目 id 索引：选择题存选项下标，填空题存输入的文字。 */
export type Answers = Readonly<Record<string, number | string>>;
```

`answer` 由 `kind` 判别：选择题是下标数组，填空题是可接受答案数组。真题的卷面源数据
在编译期归一成同一套 `Question`（题干与选项包成 `Segment`、答案标量包成单元素数组），
所以判分、草稿、成绩共用一份实现；详见 `docs/exam-model.md`。

### 5.7 模块

```ts
/**
 * 一课的模块。每种都可选，没有的不写，至少一种。
 * 显示顺序固定（见 6.1）。JLPT 真题不在这套模型里，见 docs/exam-model.md。
 */
export interface LessonModules {
    readonly kanji?: KanjiModule;       // 日语扩展，见第 8 节
    readonly words?: WordModule;
    readonly articles?: ArticleModule;
    readonly dialogues?: DialogueModule;
    readonly grammar?: GrammarModule;
}

/** 每种模块形状相同：kind、可选的模块说明、至少一个条目。 */
export interface WordModule {
    readonly kind: "word-module";
    /** 模块说明，比如教材里的练习要求。 */
    readonly instructionId?: TextId;
    readonly items: readonly Word[];
}
export interface ArticleModule {
    readonly kind: "article-module";
    readonly instructionId?: TextId;
    readonly items: readonly Article[];
}
export interface DialogueModule {
    readonly kind: "dialogue-module";
    readonly instructionId?: TextId;
    readonly items: readonly Dialogue[];
}
export interface GrammarModule {
    readonly kind: "grammar-module";
    readonly instructionId?: TextId;
    readonly items: readonly Grammar[];
}
```

新增一种模块时：定义条目类型和 `XxxModule`，加进 `LessonModules` 和模块顺序表，题目照样挂在条目下。

### 5.8 课

```ts
/** 课。每课单独编译成一个文件，学习进度按课记。 */
export interface Lesson {
    readonly kind: "lesson";
    /** 也是页面地址和产物文件名。 */
    readonly id: string;
    /** 所属教材 id，必须和课文件所在的目录名一致。 */
    readonly bookId: string;
    /** 原文标题。 */
    readonly title: string;
    readonly modules: LessonModules;
    /** 这一课用到的全部译文，由编译器收集，源数据里不写。 */
    readonly texts: TranslationCatalog;
    /** 测验页要不要现场生成单词题（见 6.4）。不需要时不写。 */
    readonly wordQuiz?: boolean;
}
```

### 5.9 教材与目录

```ts
/** 教材。 */
export interface Book {
    readonly kind: "book";
    /** 也是源数据的目录名。 */
    readonly id: string;
    /** 原文书名，用全称。 */
    readonly title: string;
    /** 书架上的分级，取值由 app 定义。与真题的 examLevel 不是一个概念。 */
    readonly shelfLevel: LibraryLevel;
    /** 这本书的课 id，按教材顺序。 */
    readonly lessonIds: readonly string[];
    /** 真题教材的考试 id，按时间顺序；有它时 lessonIds 为空。 */
    readonly examIds?: readonly string[];
}

/** 页签：模块名加上测验。 */
export type View = "articles" | "dialogues" | "grammar" | "words" | "kanji" | "quiz";

/** 目录索引条目：编译期从课文件派生，源数据里不写。 */
export interface LessonSummary {
    readonly id: string;
    readonly bookId: string;
    readonly title: string;
    /** 课在教材内的分组名；没有分组的课不写。 */
    readonly group?: string;
    readonly wordCount: number;
    /** 教材固定题的数量，不含现场生成的题。 */
    readonly questionCount: number;
    readonly views: readonly View[];
}

/** 运行时目录：源 catalog 加上编译期派生的索引。 */
export interface Catalog {
    readonly schemaVersion: 1;
    readonly siteTitle: string;
    readonly books: readonly Book[];
    readonly lessons: readonly LessonSummary[];
    /** 真题索引，编译期从真题文件派生。 */
    readonly exams: readonly ExamSummary[];
}

/** 书架上的分级，决定教材显示在哪一栏。 */
export type LibraryLevel = "beginner" | "mid-intermediate" | "intermediate" | "jlpt-grammar" | "jlpt-shiken";
```

另有 `isLibraryLevel` / `isView` / `defaultView` / `orderedViews` 等纯函数与
`viewsOf` 供目录和页面共用；`ExamSummary` 定义在真题模型里（见 `docs/exam-model.md`）。

## 6. 派生规则

能派生的都不手写，统一在编译期或领域函数里算出来。

### 6.1 页签

- 模块顺序固定：文章 → 会话 → 文法 → 词汇 → 汉字。一课有哪个模块就显示哪个页签。
- 本课收集到的固定题不为空，或开启了现场生成单词题（6.4）时，最后加「测验」页签。
- 默认页签：有文章先打开文章，否则取第一个。

### 6.2 测验出题

按模块顺序、条目顺序收集题目，原样出题，**题目和选项都不打乱**：

- 一般模块：收集每个条目的 `questions`。
- 文法：先收集本条，再递归收集 `children`。
- 汉字：题目挂在例词上，收集每个汉字的 `words[].questions`。

题目按上面的模块顺序分块：每块带模块标题和题号范围，页首有锚点索引可直接跳转，题号仍是整份测验的连续编号。
现场生成的单词题不单独堆在末尾，按词来自词表模块还是汉字例词，分别并进「词汇」或「汉字」块。

需要打乱的内容在录入时按固定种子打乱一次并固化，运行时不再打乱，这样和纸质教材、作答记录都能对上。

### 6.3 词表

一课能用来出单词题的词 = 单词模块的词 + 汉字的例词，保持教材顺序。`LessonSummary.wordCount` 也按这个口径算。

### 6.4 现场生成的单词题（wordQuiz）

- `wordQuiz: true` 的课，打开测验页时从本课词表现场生成词义选择题，选项和干扰项用可复现的随机源打乱。
- 生成的题不落盘，不计入 `questionCount`；「不打乱」只约束教材固定题。
- 测验页签上显示的题数取实际出题数（固定题 + 生成题）。

### 6.5 编译期派生

- `Lesson.texts`：收集这一课引用到的全部译文。
- `LessonSummary`：页签、词数、固定题数、分组。
- 真题题目归一：卷面源数据保持转录形态，编译期转成统一 `Question`，逐题做可逆断言。
- 检索索引：从原文和译文字段生成；运行时解码器和生成脚本字段对不上时整份拒收。

## 7. 判分与切分规则

### 7.1 判分

- 选择题：作答下标在 `answer` 里就对。教材与真题共用一份 `isCorrect`。
- 填空题：作答为空算错；否则按 `requiredScript` 规范化后，和 `answer` 里任一可接受答案相等就对。规范化至少包括 Unicode NFKC、去首尾空白和内部空白；按用字要求是否折叠不同书写体系由语言扩展定义。
- 成绩：总题数、已答数、答对数、错题 id 列表、是否全部作答。

### 7.2 切句

- 在句末标点处切（日语是 `。！？`），引号、括号里的不切。
- 原文的折行不是句子边界。

### 7.3 台词拆分

- 角色标签从原文里拆出来放进 `role`，不含冒号。
- 角色名按白名单识别，白名单先统计全库再定，不靠正则猜。
- 译文里的角色标签用同样方法拆开，分别挂到各段台词上。
- 原文和译文拆出的段数对不上时，不硬拆：这一条保留成单个 `Sentence`，写进报告。

## 8. 日语扩展

### 8.1 汉字

```ts
/** 汉字。id 最后一段用教材原编号。 */
export interface Kanji {
    readonly kind: "kanji";
    readonly id: string;
    /** 汉字本身，正好一个字符。 */
    readonly character: string;
    /** 笔画数（画数）。 */
    readonly strokeCount?: number;
    /** 字义。 */
    readonly meaningId?: TextId;
    /** 音读（音読み），片假名，按教材顺序，比如 ["イチ", "イツ"]。没有时是空数组。 */
    readonly onReadings: readonly string[];
    /**
     * 训读（訓読み），平假名，按教材顺序。没有时是空数组。
     * 「.」后面是送假名（送り仮名），比如 ["ひと", "ひと.つ"]。教材写成敬体的保留原样。
     */
    readonly kunReadings: readonly string[];
    /** 特别读音，比如 一人＝ひとり。没有时是空数组。 */
    readonly specialReadings: readonly SpecialReading[];
    /** 例词，读音题挂在各个例词下面。没有时是空数组。 */
    readonly words: readonly Word[];
    /** 例句。没有时是空数组。 */
    readonly examples: readonly Sentence[];
}

/** 特别读音（特別な読み）：整个词才有的读法，不能拆到单个汉字上。 */
export interface SpecialReading {
    readonly word: string;
    /** 平假名。 */
    readonly reading: string;
}

/** 汉字模块。 */
export interface KanjiModule {
    readonly kind: "kanji-module";
    readonly instructionId?: TextId;
    readonly items: readonly Kanji[];
}
```

- **送假名**：从本课例词、例句里「汉字＋假名」的写法推断切分点；推断不出的先不加 `.`，列清单标「待母语者确认」。去掉 `.` 必须等于原读音。
- **分课**：教材本身不分课的汉字书，按固定字数在编译期分成课，不在运行时分组。

### 8.2 用字要求与判分

```ts
/**
 * - "any-kana"：只看读音，平假名、片假名都算对。
 * - "katakana"：必须写成片假名，比如外来语「ラーメン」。
 */
export type RequiredScript = "any-kana" | "katakana";
```

- 录入规则：标准答案里有片假名就是 `"katakana"`，否则是 `"any-kana"`。
- `any-kana` 判分：NFKC、去空白后，片假名 `ァ`–`ヶ` 转成对应平假名（码位差 96）；`ヷヸヹヺ` 没有预组合平假名，手工映射成「わ゙ ゐ゙ ゑ゙ を゙」；长音符 `ー` 两种假名共用，不转换。
- `katakana` 判分：只做 NFKC 和去空白，不转换假名种类。

### 8.3 注音标记

原文里用 `[漢字:かな]` 标振假名，比如 `[音楽:おんがく]`。显示时渲染成 ruby；朗读时换成假名再送进引擎。

### 8.4 教材 id

用赫本式罗马字，长音不标（`chukyu`、`noryoku`、`sogo`）。

## 9. 内容源与编译

```text
data/content/
  catalog.json                    {schemaVersion, siteTitle, books, lessonGroups}
  units/<教材 id>/<课号>.json     {kind:"lesson", id, bookId, title, modules, wordQuiz?}
  localization/learning.json      { [译文 id]: Translation }
  localization/ui.json            界面文案
```

- `catalog.json` 只写这 4 个字段；`lessonGroups` 是 `{ [课 id]: 分组名 }`，编译时填进 `LessonSummary.group`。页签、课列表、题数都不手写。
- 课源文件里不写 `texts`，由编译器从 `learning.json` 收集。
- 音频文件放 `public/media/`，内容数据只写相对站点根的路径（`Article.audio`、真题的 `exam.listening.audio`），不写绝对 URL；App 壳内由 `siteMediaUrl()` 拼成站点绝对地址。加字段要同步改运行时解码器的白名单。
- 运行时解码器按白名单读字段，结构对不上整份拒收，不做半信半疑的渲染。
- 产物请求带内容指纹（`?v=…`），内容一变就绕开静态托管的缓存。
- 界面文案的 key 用联合类型约束，新增 key 要同时改文案文件和类型，由类型检查保证不漏。

**改内容的规矩**

1. 批量修改用脚本做精确字符串替换，断言每处命中次数，对不上就整体退出；写回后立刻 `JSON.parse` 自检；不要 `parse → stringify` 重排没改的部分。
2. 字符串里需要引号时用「」，或在 JS 里写 `\\"`。
3. 改完编译，到产物里 grep 确认改动生效；diff 只应有目标行。
4. 不为了让校验变绿删测试，需要放宽就改成下限断言（`>=`）。

## 10. 结构性迁移的方法

只在数据模型本身变化时用，平时改内容按第 9 节。

**做法**

- 写一次性脚本，跑完就删；新旧 id 对照表和复核清单留在日志目录作溯源。
- 先在内存里做完全部转换，再跑断言；任何一条不满足就整体退出，**不写任何文件**。
- 工作区是 CRLF 换行时，正则一律写成 `\r?\n`。
- 译文改名只改键，不改译文内容。
- 机器判断不了的不硬猜：按可验证的线索自动匹配（比如题干里出现了哪个文法的标题），匹配不上的列清单人工指定；拆不齐的保留原结构并写进报告。

**断言（可逆性）**

- 迁移前的每条原文，都能在新结构里一字不差地找到，数量相等。被拆开的内容按原分隔符拼回去必须等于原字符串（台词「角色标签 + 分隔符」拼回原文；训读去掉 `.` 等于原读音）。
- 两处来源的同一数据（比如笔画数）都有时必须相等。
- 新旧 id 一一对应：没有遗漏，也没有两个旧 id 撞成同一个新 id。
- 每条译文都有地方引用，不留孤儿。
- 写回后立刻 `JSON.parse` 自检。

**完成标准**

- lint 0 warning，构建和全量校验通过。
- 在产物里 grep：新字段能搜到，旧字段搜不到。
- 按受影响的页面类型各抽查一页（显示、朗读、判分）。
- 报告列出：各类条目数量、待人工确认的清单、拆不齐的清单、人工指定的清单、重复或冲突项。

## 11. 接入新 app 时要定的事

| 事项 | 本模型里的位置 | 日语 app 的取值 |
| --- | --- | --- |
| 目标语言 | `Segment` 原文字段名、切句标点（7.2）、注音标记（8.3） | `japanese`、`。！？`、`[漢字:かな]` |
| 界面语言 | `Translation` 字段、`Locale` | `zh`、`en` |
| 模块集合 | `LessonModules`、模块顺序、`View` | 本文 / 会話 / 文法 / 単語 / 漢字 |
| 用字要求 | `RequiredScript` 与判分规范化（7.1） | `any-kana` / `katakana`（8.2） |
| 书架分级 | `Book.shelfLevel: LibraryLevel` | `beginner`、`mid-intermediate`、`intermediate`、`jlpt-grammar`、`jlpt-shiken` |
| 教材 id 转写 | 4.1 第 6 条 | 赫本式，长音不标 |
| 页面地址参数名 | 4.4 | `?unit=`（参数名由 app 定） |

不需要的扩展（比如汉字）整块不实现即可，核心类不用改。
