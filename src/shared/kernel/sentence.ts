import type {TextId} from "./text-types";
import type {Question} from "./question";

/** 句子：最小的可读单位。没有 id，它的译文 id 按位置编，见 docs/content-model.md 第 4.3 节。 */
export interface Sentence {
    /** 类型标记，固定为 "sentence"。 */
    readonly kind: "sentence";
    /**
     * 日语原文，照抄教材。
     * 可以写振假名标记，比如 `[音楽:おんがく]`。
     */
    readonly text: string;
    /** 整句的译文。对话台词里的句子不带，译文在台词上。 */
    readonly translationId?: TextId;
    /** 语法拆解。只有值得讲解的句子才有。 */
    readonly analysisId?: TextId;
}

/** 例句：一个单句，或者一段对话。只用在文法条目里。 */
export type Example = Sentence | Dialogue;

/**
 * 对话：几个人轮流说的一段话。
 * 可以是对话模块里的一篇会话，也可以是文法下面的一条例句。
 */
export interface Dialogue {
    /** 类型标记，固定为 "dialogue"。 */
    readonly kind: "dialogue";
    /**
     * id，用来溯源到教材里的哪一段对话。
     * 在对话模块里：`课.dialogue.序号`；作为文法例句：`文法.example.序号`。
     */
    readonly id: string;
    /** 日语标题，比如「会話：就職活動（1）」。作为例句的对话没有标题。 */
    readonly title?: string;
    /** 对话前的场景说明。 */
    readonly introductionId?: TextId;
    /** 整段对话的语法拆解。讲的是整段来回，拆不到单句上，所以挂在整段上。 */
    readonly analysisId?: TextId;
    /** 台词，按原文顺序排列，至少两段。 */
    readonly lines: readonly DialogueLine[];
    /** 练这段对话的题目，按教材顺序排列。没有时是空数组。 */
    readonly questions: readonly Question[];
}

/** 一段台词：一个人连续说的话，可能有好几句。 */
export interface DialogueLine {
    /**
     * 板块小标题。教材一条录音轨对应一篇对话时写在该篇第一条台词上，
     * 值是书页上的 ■ 小标题原文（不带 ■），比如「貸すのを断る」。
     * 每篇只写一个，普通对话不写。
     */
    readonly section?: string;
    /**
     * 该篇内的小组编号，照抄教材的「①」「②」…… 只写在该组第一条台词上。
     * 同组的后续台词不写；渲染时据此在组与组之间加分隔。
     */
    readonly group?: string;
    /**
     * 说话的人，照抄原文的标签，比如「A」「渡辺」「私」，不含后面的冒号。
     * 朗读时按它分配音色。
     */
    readonly role: string;
    /**
     * 这段台词的译文。
     * 现有译文只能按角色和原文对齐，没法按句对齐，所以挂在整段台词上。
     */
    readonly translationId?: TextId;
    /**
     * 这段台词里的句子，按原文顺序排列，至少一句，不含角色标签。
     * 按句末的 。！？ 切开，引号、括号里的句号不切。
     * 这些句子不带 translationId。
     */
    readonly sentences: readonly Sentence[];
}
