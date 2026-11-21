import type {TextId} from "../../../shared/kernel/text-types";
import type {Sentence} from "../../../shared/kernel/sentence";
import type {Word} from "../../vocabulary/public";

/** 汉字。 */
export interface Kanji {
    /** 类型标记，固定为 "kanji"。 */
    readonly kind: "kanji";
    /** id，最后一段是教材里的原编号，比如「漢字 001 一」是 "ichinichi-jugofun-no-kanji-renshu.1.kanji.1"。 */
    readonly id: string;
    /** 汉字本身，正好一个字符，比如「一」。 */
    readonly character: string;
    /** 笔画数（画数）。页面显示成「画数：N」。 */
    readonly strokeCount?: number;
    /** 字义。 */
    readonly meaningId?: TextId;
    /** 音读（音読み），用片假名写，按教材顺序排列，比如 ["イチ", "イツ"]。没有时是空数组。 */
    readonly onReadings: readonly string[];
    /**
     * 训读（訓読み），用平假名写，按教材顺序排列。没有时是空数组。
     * 「.」后面是送假名（送り仮名），比如 ["ひと", "ひと.つ"]、["し.ぬ"]。
     * 教材写成敬体的保留原样，比如「い.きます」。
     */
    readonly kunReadings: readonly string[];
    /** 特别读音，比如 一人＝ひとり。没有时是空数组。 */
    readonly specialReadings: readonly SpecialReading[];
    /** 例词：用到这个字的单词，按教材顺序排列；读音题挂在各个例词下面。没有时是空数组。 */
    readonly words: readonly Word[];
    /** 例句：用到这个字的句子，按教材顺序排列。没有时是空数组。 */
    readonly examples: readonly Sentence[];
}

/** 特别读音（特別な読み）：整个词才有的读法，不能拆到单个汉字上。 */
export interface SpecialReading {
    /** 词的写法，比如「一人」。 */
    readonly word: string;
    /** 整个词的读音，用平假名写，比如「ひとり」。 */
    readonly reading: string;
}
