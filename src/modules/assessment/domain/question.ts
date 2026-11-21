import type {Answers, Question} from "../../../shared/kernel/question";

// 题目类型住在内核：句子、课程模块、真题都要引用它。这里只重导出，调用点路径不变。
export type {ChoiceQuestion, FillInQuestion, RequiredScript} from "../../../shared/kernel/question";
export type {Answers, Question};

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

/** 判分只看 answer / requiredScript，不再从答案本身猜测用字要求。 */
export function isCorrect(question: Question, answer: number | string | undefined) {
    if (question.kind === "choice")
        return typeof answer === "number" && question.answer.includes(answer);
    if (typeof answer !== "string" || !normalizeAnswer(answer)) return false;
    const matches = (accepted: string) => question.requiredScript === "katakana"
        ? normalizeLayout(accepted) === normalizeLayout(answer)
        : normalizeAnswer(accepted) === normalizeAnswer(answer);
    return question.answer.some(matches);
}

/** 一份题目的判分结果。接口与实现共用这一个形状，不在 contracts 里另抄一份。 */
export interface AssessmentResult {
    total: number;
    answered: number;
    correct: number;
    wrongIds: string[];
    complete: boolean;
}

export function grade(questions: readonly Question[], answers: Answers): AssessmentResult {
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
