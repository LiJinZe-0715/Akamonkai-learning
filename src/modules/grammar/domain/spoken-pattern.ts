import type {TextId} from "../../../shared/kernel/text-types";
import type {Sentence} from "../../../shared/kernel/sentence";
import type {Question} from "../../assessment/public";

/**
 * 口语模板：教材「重要表現」的一节 = 一个场景 + 两栏固定句型。
 *
 * 和 Grammar 分开建模，因为它是按「语体对比」组织的：同一句意思，朋友之间怎么说、
 * 对客户怎么说。Grammar 讲的是单个句型的接续和用法，塞不进这层对比。
 */
export interface SpokenPattern {
    /** 类型标记，固定为 "spoken-pattern"。 */
    readonly kind: "spoken-pattern";
    /** id，比如 "nihongo-namachukei.1.pattern.0"。 */
    readonly id: string;
    /** 日文原题，照抄教材小节标题，比如「貸してくれるように頼む」。 */
    readonly title: string;
    /** 场景：这一节在什么场面用。译文按语言存，对应教材右栏的「拜托对方把东西借给你」。 */
    readonly sceneId: TextId;
    /** 生活表达：白衬衫栏，朋友、家人之间的说法。 */
    readonly casual: readonly Sentence[];
    /** 商务表达：领带栏，同事、客户、店员之间的说法。 */
    readonly business: readonly Sentence[];
    /** 这一节下的固定题，按教材顺序排列。没有时是空数组。 */
    readonly questions: readonly Question[];
}

/** 口语模板模块：一课里的「重要表現」。 */
export interface PatternModule {
    /** 类型标记，固定为 "pattern-module"。 */
    readonly kind: "pattern-module";
    /** 这个模块的说明，比如教材里的练习要求。 */
    readonly instructionId?: TextId;
    /** 模块里的口语模板，按教材顺序排列，至少一条。 */
    readonly items: readonly SpokenPattern[];
}
