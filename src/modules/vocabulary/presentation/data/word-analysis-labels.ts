import type {PartOfSpeech, Transitivity} from "../../public";
import type {UiTextId} from "../../../localization/public";

/**
 * 词性、自他到界面文案的映射。
 * 用 Record 约束而不是拼接 key：枚举新增一个值，这里不补就会被类型检查挡住。
 */
export const partOfSpeechLabels: Record<PartOfSpeech, UiTextId> = {
    noun: "ui.partOfSpeech.noun",
    "verbal-noun": "ui.partOfSpeech.verbalNoun",
    verb: "ui.partOfSpeech.verb",
    "i-adjective": "ui.partOfSpeech.iAdjective",
    "na-adjective": "ui.partOfSpeech.naAdjective",
    adverb: "ui.partOfSpeech.adverb",
    conjunction: "ui.partOfSpeech.conjunction",
    adnominal: "ui.partOfSpeech.adnominal",
    interjection: "ui.partOfSpeech.interjection",
    prefix: "ui.partOfSpeech.prefix",
    suffix: "ui.partOfSpeech.suffix",
    counter: "ui.partOfSpeech.counter",
    expression: "ui.partOfSpeech.expression",
    other: "ui.partOfSpeech.other",
};

export const transitivityLabels: Record<Transitivity, UiTextId> = {
    intransitive: "ui.transitivity.intransitive",
    transitive: "ui.transitivity.transitive",
    both: "ui.transitivity.both",
};

/** 骨架里的占位符：`N` 表名词，`<w>` 表本词。说明只存一份，不按词条存。 */
export const patternLegend: UiTextId = "ui.wordPatternLegend";
