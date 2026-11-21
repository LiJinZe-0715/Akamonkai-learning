import type {ExamAnswers, ExamQuestion} from "./exam";

/** 一场真题的作答进度：答案与已单题核对过的题 id。 */
export interface ExamDraftState {
    readonly answers: ExamAnswers;
    readonly revealed: readonly string[];
}

interface ExamDraft {
    readonly version: 1;
    readonly signature: string;
    readonly answers: ExamAnswers;
    readonly revealed: readonly string[];
}

/** 题目顺序变了就不能复用旧答案：只记 id 列表，不序列化题目内容。 */
const signatureOf = (questions: readonly ExamQuestion[]) => questions.map(question => question.id).join("|");

export function captureExamDraft(questions: readonly ExamQuestion[], state: ExamDraftState): ExamDraft {
    return {
        version: 1,
        signature: signatureOf(questions),
        answers: {...state.answers},
        revealed: [...state.revealed],
    };
}

/** 结构坏了、版本不对、题目变了、答案或核对记录越界，整份丢弃而不是猜。 */
export function restoreExamDraft(questions: readonly ExamQuestion[], value: unknown): ExamDraftState | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const draft = value as Partial<ExamDraft>;
    if (draft.version !== 1 || draft.signature !== signatureOf(questions) ||
        !draft.answers || typeof draft.answers !== "object" || Array.isArray(draft.answers) ||
        !Array.isArray(draft.revealed)) return undefined;
    const byId = new Map(questions.map(question => [question.id, question]));
    for (const [id, answer] of Object.entries(draft.answers)) {
        const question = byId.get(id);
        if (!question || !Number.isInteger(answer) || answer < 0 || answer >= question.options.length) return undefined;
    }
    for (const id of draft.revealed) {
        if (typeof id !== "string" || !byId.has(id)) return undefined;
    }
    return {answers: {...draft.answers}, revealed: [...draft.revealed]};
}
