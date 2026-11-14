import type {TextId} from "../../../shared/kernel/text-types";
import type {Example} from "../../../shared/kernel/sentence";
import type {Question} from "../../assessment/public";

/**
 * 文法条目。讲解字段在所有教材之间统一；
 * 教材原有讲解怎么归到这些字段，见 docs/content-model.md 第 5.5 节。
 */
export interface Grammar {
    /** 类型标记，固定为 "grammar"。 */
    readonly kind: "grammar";
    /** id，比如 "minna-no-nihongo-shokyu.1.grammar.0"。 */
    readonly id: string;
    /** 日语标题，比如「～ものだ」。 */
    readonly title: string;
    /** 接续：前面接什么词、什么形式。 */
    readonly formationId?: TextId;
    /** 意思：这个句型表达什么。 */
    readonly meaningId?: TextId;
    /** 用法：什么场合用、语气如何。 */
    readonly usageId?: TextId;
    /** 易错点，以及和相似句型的区别。 */
    readonly pitfallId?: TextId;
    /** 例句，单句或对话，按原文顺序排列。没有时是空数组。 */
    readonly examples: readonly Example[];
    /** 补充说明，按原文顺序排列。没有时是空数组。 */
    readonly noteIds: readonly TextId[];
    /** 下级条目，比如 中級を学ぼう「数字の読み方」下面的 0、1、2……。没有时是空数组。 */
    readonly children: readonly Grammar[];
    /** 练这个文法的题目，按教材顺序排列。没有时是空数组。 */
    readonly questions: readonly Question[];
}
