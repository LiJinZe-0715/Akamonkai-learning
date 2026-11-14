import type {Segment, TextId} from "./text-types";

/**
 * 题目：选择题或填空题。教材与真题共用这一套，判分也只用 isCorrect 一份。
 *
 * 类型放在内核而不是 assessment：`Dialogue`、`LessonModules`、`Exam` 都要引用它，
 * 留在 assessment 会让内核和课程模块反向依赖判分模块。判分逻辑仍在 assessment。
 */
export type Question = ChoiceQuestion | FillInQuestion;

/** 两种题目共有的部分。 */
interface QuestionBase {
    /** id，作答记录按它保存，比如 "minna-no-nihongo-shokyu.1.grammar.0.question.1"。 */
    readonly id: string;
    /** 答题要求，比如「选出正确的一项」。卷面照抄的指示是 instruction，不是这个字段。 */
    readonly instructionId?: TextId;
    /** 题干，可以是日语原文、译文和图片混排。 */
    readonly prompt: readonly Segment[];
    /** 答题解析：答完后才显示，讲为什么选这个。与内容拆解 analysisId 是两回事。 */
    readonly explanationId?: TextId;
    /** 卷面题号。只有真题写，教材题按页面顺序编号。 */
    readonly number?: number;
}

/** 选择题。 */
export interface ChoiceQuestion extends QuestionBase {
    /** 类型标记，固定为 "choice"。 */
    readonly kind: "choice";
    /** 选项，至少两个，按卷面／教材顺序排列，出题时不打乱；每个选项是一串内容片段。 */
    readonly options: readonly (readonly Segment[])[];
    /** 正确选项的下标，从 0 开始，至少一个，可以有多个。 */
    readonly answer: readonly number[];
}

/** 填空题。 */
export interface FillInQuestion extends QuestionBase {
    /** 类型标记，固定为 "fill-in"。 */
    readonly kind: "fill-in";
    /** 可以接受的答案，至少一个，满足任意一个就算对。 */
    readonly answer: readonly string[];
    /** 对答案用字的要求。按 docs/content-model.md 第 8.2 节的规则写好，判分时只看这个字段。 */
    readonly requiredScript: RequiredScript;
}

/**
 * 判分时对答案用字的要求：
 * - "any-kana"：只看读音，平假名、片假名都算对。
 * - "katakana"：必须写成片假名，比如外来语「ラーメン」。
 */
export type RequiredScript = "any-kana" | "katakana";

/** 学生的作答，按题目 id 索引：选择题存选项下标，填空题存输入的文字。 */
export type Answers = Readonly<Record<string, number | string>>;
