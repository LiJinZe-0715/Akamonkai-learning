import type {Answers, ChoiceQuestion, Question} from "./question";

export interface DraftState {
    questions: Question[];
    answers: Answers;
    wrongOnly: boolean;
}

interface Draft {
    version: 1;
    signature: string;
    order: { id: string; options?: number[] }[];
    answers: Answers;
    wrongOnly: boolean;
}

const draftSignature = (source: readonly Question[]) => JSON.stringify(source);

/** 题目不再打乱，草稿只记录顺序与选项排列，不序列化题目内容。 */
export function prepareDraft(source: readonly Question[], questions: readonly Question[]): Pick<Draft, "signature" | "order"> {
    const originals = new Map(source.map(question => [question.id, question]));
    return {
        signature: draftSignature(source),
        order: questions.map(question => {
            const original = originals.get(question.id);
            if (!original) throw new Error("Unknown draft question");
            if (question.kind !== "choice") return {id: question.id};
            if (original.kind !== "choice") throw new Error("Invalid draft options");
            const positions = new Map(original.options.map((option, index) => [option, index]));
            const used = new Set<number>();
            return {id: question.id, options: question.options.map(option => {
                let index = positions.get(option);
                if (index === undefined || used.has(index)) {
                    const serialized = JSON.stringify(option);
                    index = original.options.findIndex((item, i) => !used.has(i) && JSON.stringify(item) === serialized);
                }
                if (index < 0) throw new Error("Unknown draft option");
                used.add(index);
                return index;
            })};
        }),
    };
}

export function captureDraft(source: readonly Question[], state: DraftState, prepared = prepareDraft(source, state.questions)): Draft {
    return {version: 1, ...prepared, wrongOnly: state.wrongOnly, answers: {...state.answers}};
}

/** 只恢复当前源题目的排列顺序，绝不恢复序列化的题目内容或答案。 */
export function restoreDraft(source: readonly Question[], value: unknown): DraftState | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const draft = value as Draft;
    if (draft.version !== 1 || draft.signature !== draftSignature(source) || typeof draft.wrongOnly !== "boolean" ||
        !Array.isArray(draft.order) || !draft.order.length || (!draft.wrongOnly && draft.order.length !== source.length) ||
        !draft.answers || typeof draft.answers !== "object" || Array.isArray(draft.answers)) return undefined;
    const originals = new Map(source.map(question => [question.id, question]));
    const questions: Question[] = [], seen = new Set<string>();
    for (const entry of draft.order) {
        if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) return undefined;
        seen.add(entry.id);
        const original = originals.get(entry.id);
        if (!original) return undefined;
        if (original.kind === "choice") {
            const order = entry.options;
            if (!Array.isArray(order) || order.length !== original.options.length || new Set(order).size !== order.length ||
                order.some(index => !Number.isInteger(index) || index < 0 || index >= original.options.length)) return undefined;
            const choice: ChoiceQuestion = {
                ...original,
                options: order.map(index => original.options[index]),
                correctOptionIndexes: order.flatMap((index, display) =>
                    original.correctOptionIndexes.includes(index) ? [display] : []),
            };
            questions.push(choice);
        } else {
            if (entry.options !== undefined) return undefined;
            questions.push({...original});
        }
    }
    const restored = new Map(questions.map(question => [question.id, question]));
    for (const [id, answer] of Object.entries(draft.answers)) {
        const question = restored.get(id);
        if (!question || (question.kind === "choice"
            ? typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= question.options.length
            : typeof answer !== "string")) return undefined;
    }
    return {questions, answers: {...draft.answers}, wrongOnly: draft.wrongOnly};
}
