import type {TextId} from "../../../shared/kernel/text-types";
import type {Question} from "../../assessment/public";

/** 单词。可以在单词模块里，也可以是汉字的例词。 */
export interface Word {
    /** 类型标记，固定为 "word"。 */
    readonly kind: "word";
    /** id，比如 "minna-no-nihongo-shokyu.1.word.0"。 */
    readonly id: string;
    /** 写法，比如「音楽」。 */
    readonly word: string;
    /** 读音，用假名写，比如「おんがく」。 */
    readonly reading: string;
    /** 词义。 */
    readonly meaningId: TextId;
    /** 用法说明。 */
    readonly noteId?: TextId;
    /** 练这个词的题目，比如读音题、拼写题、片假名填空题，按教材顺序排列。没有时是空数组。 */
    readonly questions: readonly Question[];
}
