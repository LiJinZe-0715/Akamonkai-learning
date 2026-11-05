import type {Segment, TextId} from "../../../shared/kernel/text-types";

/** 题目：选择题或填空题。 */
export type Question = ChoiceQuestion | FillInQuestion;

/** 两种题目共有的部分。 */
interface QuestionBase {
    /** id，作答记录按它保存，比如 "minna-no-nihongo-shokyu.1.grammar.0.question.1"。 */
    readonly id: string;
    /** 答题要求，比如「选出正确的一项」。 */
    readonly instructionId?: TextId;
    /** 题干，可以是日语原文和译文混排。 */
    readonly prompt: readonly Segment[];
    /** 答完后显示的解析。 */
    readonly explanationId?: TextId;
}

/** 选择题。 */
export interface ChoiceQuestion extends QuestionBase {
    /** 类型标记，固定为 "choice"。 */
    readonly kind: "choice";
    /** 选项，至少两个，按教材顺序排列，出题时不打乱；每个选项是一串文字片段。 */
    readonly options: readonly (readonly Segment[])[];
    /** 正确选项的下标，从 0 开始，至少一个，可以有多个。 */
    readonly correctOptionIndexes: readonly number[];
}

/** 填空题。 */
export interface FillInQuestion extends QuestionBase {
    /** 类型标记，固定为 "fill-in"。 */
    readonly kind: "fill-in";
    /** 对答案用字的要求。按 docs/content-model.md 第 8.2 节的规则写好，判分时只看这个字段。 */
    readonly requiredScript: RequiredScript;
    /** 可以接受的答案，至少一个，满足任意一个就算对。 */
    readonly acceptedAnswers: readonly string[];
}

/**
 * 判分时对答案用字的要求：
 * - "any-kana"：只看读音，平假名、片假名都算对。
 * - "katakana"：必须写成片假名，比如外来语「ラーメン」。
 */
export type RequiredScript = "any-kana" | "katakana";

/** 学生的作答，按题目 id 索引：选择题存选项下标，填空题存输入的文字。 */
export type Answers = Readonly<Record<string, number | string>>;

/** 没有预组合平假名形式的片假名；NFKC 会保持其合成形式，所以要手工映射。 */
const katakanaExtras: Readonly<Record<string, string>> = {
    "ヷ": "わ\u3099", "ヸ": "ゐ\u3099", "ヹ": "ゑ\u3099", "ヺ": "を\u3099",
};

export function normalizeAnswer(value: string) {
    return value
        .normalize("NFKC")
        .trim()
        .replace(/\s/g, "")
        // ァ..ヶ 的码位正好比对应平假名低一个平假名区块。
        .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 96))
        .replace(/[ヷ-ヺ]/g, (char) => katakanaExtras[char] ?? char);
    // ー 为两种假名共用，故意保留不转换。
}

/** 只统一宽度与空格，不改假名种类，片假名与平假名仍然区分。 */
function normalizeLayout(value: string) {
    return value.normalize("NFKC").trim().replace(/\s/g, "");
}

/** 判分只看 requiredScript / correctOptionIndexes，不再从答案本身猜测用字要求。 */
export function isCorrect(question: Question, answer: number | string | undefined) {
    if (question.kind === "choice")
        return typeof answer === "number" && question.correctOptionIndexes.includes(answer);
    if (typeof answer !== "string" || !normalizeAnswer(answer)) return false;
    const matches = (accepted: string) => question.requiredScript === "katakana"
        ? normalizeLayout(accepted) === normalizeLayout(answer)
        : normalizeAnswer(accepted) === normalizeAnswer(answer);
    return question.acceptedAnswers.some(matches);
}

export function grade(questions: readonly Question[], answers: Answers) {
    const answered = questions.filter(
        (question) => answers[question.id] !== undefined && String(answers[question.id]).trim() !== "",
    ).length;
    const wrongIds = questions
        .filter((question) => !isCorrect(question, answers[question.id]))
        .map((question) => question.id);
    return {
        total: questions.length,
        answered,
        correct: questions.length - wrongIds.length,
        wrongIds,
        complete: answered === questions.length,
    };
}

/** 题目和选项都按教材原顺序出，不打乱。保留入口是为了不改动调用点。 */
export function prepareQuestions(questions: readonly Question[]): Question[] {
    return [...questions];
}
