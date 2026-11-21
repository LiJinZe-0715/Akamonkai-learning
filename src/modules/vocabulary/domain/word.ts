import type {TextId} from "../../../shared/kernel/text-types";
import type {Question} from "../../assessment/public";

/**
 * 词性。封闭枚举，显示文案走界面文案（`ui.partOfSpeech.*`），不按词条存译文。
 * 取值见 docs/content-model.md 5.4，新增值要同时补界面文案与解码器校验。
 */
export type PartOfSpeech =
    | "noun"            // 名詞
    | "verbal-noun"     // サ変名詞（能单独接「する」构成动词的名词）
    | "verb"            // 動詞（含非名词来源的 する 动词，如 いらいらする）
    | "i-adjective"     // イ形容詞
    | "na-adjective"    // ナ形容詞
    | "adverb"          // 副詞
    | "conjunction"     // 接続詞
    | "adnominal"       // 連体詞
    | "interjection"    // 感動詞
    | "prefix"          // 接頭辞
    | "suffix"          // 接尾辞
    | "counter"         // 助数詞
    | "expression"      // 連語・慣用句（整体才有意思的固定说法）
    | "other";

/**
 * 自他。只对动词与サ変名詞写：`N が ～` 成立是自动词，`N を ～` 成立是他动词，
 * 两种都成立是自他两用。判不准就不写，不猜。
 */
export type Transitivity = "intransitive" | "transitive" | "both";

/** 一条搭配骨架：日语原形 + 说明。 */
export interface WordPattern {
    /** 日语骨架，`<w>` 代表这个词的基本形，比如 "N が <w>"、"N を <w>する"。不翻译。 */
    readonly pattern: string;
    /** 这条搭配的说明：为什么用这个助词、什么场合说。 */
    readonly usageId: TextId;
}

/** 一项近义辨析：容易混的词 + 它的词义 + 差别。 */
export interface WordContrast {
    /** 对方词的写法，日语原文，不翻译。 */
    readonly word: string;
    /** 对方词的词义，辨析卡片上要显示；对方词在本课时直接复用它的 meaningId。 */
    readonly glossId: TextId;
    /** 库里确实有这个词条时指向它，用于跳转；不确定就不写。 */
    readonly wordId?: string;
    /** 差别在哪：搭配、场景语体、语义侧重，至少给一种。 */
    readonly differenceId: TextId;
}

/** 单词。可以在单词模块里，也可以是别的条目的例词（如汉字的例词）。 */
export interface Word {
    /** 类型标记，固定为 "word"。 */
    readonly kind: "word";
    /** id，比如 "minna-no-nihongo-shokyu.1.word.0"。 */
    readonly id: string;
    /** 写法，比如「音楽」。 */
    readonly word: string;
    /** 读音，用假名写，比如「おんがく」。 */
    readonly reading: string;
    /**
     * 基本形。只在写法不是基本形时写：敬体「生きます」→「生きる」、
     * 带教材注释「効果的（な）」→「効果的」。骨架里的 `<w>` 展开的就是它。
     */
    readonly lemma?: string;
    /** 词性。 */
    readonly pos?: PartOfSpeech;
    /** 自他。只对动词与サ変名詞写。 */
    readonly transitivity?: Transitivity;
    /** 词义。 */
    readonly meaningId: TextId;
    /** 用法说明：什么场合用、搭配什么词。按原文顺序，没有时不写。 */
    readonly noteIds?: readonly TextId[];
    /** 搭配骨架：这个词跟哪些助词、固定组合绑在一起。按重要性排，没有时不写。 */
    readonly patterns?: readonly WordPattern[];
    /** 近义辨析：容易被搞混的词和差别。没有时不写。 */
    readonly contrasts?: readonly WordContrast[];
    /** 内容拆解：构词、汉字读音、语体限制等。只有值得讲解的词才有。 */
    readonly analysisId?: TextId;
    /** 练这个词的题目，比如读音题、拼写题、片假名填空题，按教材顺序排列。没有时是空数组。 */
    readonly questions: readonly Question[];
}
