import type {TextId} from "../../../shared/kernel/text-types";
import type {Sentence} from "../../../shared/kernel/sentence";
import type {Question} from "../../assessment/public";

/** 段落：按原文顺序排列的若干句子。 */
export interface Paragraph {
    /** 类型标记，固定为 "paragraph"。 */
    readonly kind: "paragraph";
    /**
     * id，用来溯源到教材里的哪一段，比如
     * "chukyu-o-manabo-chukyu-zenki.1.article.0.paragraph.0"。
     * 目前每篇整篇算一段；以后按教材分段时新增段落，已有 id 不变。
     */
    readonly id: string;
    /**
     * 板块小标题。由带分组的对话转成的跟读文章才写，只写在该篇第一段上，
     * 值照抄书页的 ■ 小标题原文（不带 ■）。普通叙述文不写。
     */
    readonly section?: string;
    /** 该篇内的小组编号（「①」「②」……），只写在该组第一段上。 */
    readonly group?: string;
    /**
     * 说话的人。只有由会话转成的跟读文章才有：一段 = 这个角色连续说的话，
     * 角色名在段落头显示一次，段内后续句子不再重复。普通叙述文不写。
     */
    readonly role?: string;
    /** 段落里的句子，按原文顺序排列，至少一句。 */
    readonly sentences: readonly Sentence[];
}

/**
 * 文章：教材的本文，只放叙述文。
 * 会话放在对话模块，文法讲解放在文法模块。
 */
export interface Article {
    /** 类型标记，固定为 "article"。 */
    readonly kind: "article";
    /** id，比如 "chukyu-o-manabo-chukyu-zenki.1.article.0"。 */
    readonly id: string;
    /** 日语标题，比如「音楽と音の効果」。 */
    readonly title: string;
    /** 整篇课文的录音，相对站点根（media/…mp3）。没有录音的文章不写，朗读仍由 TTS 兜底。 */
    readonly audio?: string;
    /** 正文前的导语。 */
    readonly introductionId?: TextId;
    /** 正文的段落，按原文顺序排列，至少一段。目前每篇整篇算一段。 */
    readonly paragraphs: readonly Paragraph[];
    /** 练这篇文章的题目，比如阅读理解题，按教材顺序排列。没有时是空数组。 */
    readonly questions: readonly Question[];
}

/** 整篇正文：各段各句按顺序直接拼起来，中间不加任何字符。 */
export function articleText(article: Article): string {
    return article.paragraphs.flatMap((paragraph) => paragraph.sentences)
        .map((sentence) => sentence.text)
        .join("");
}
