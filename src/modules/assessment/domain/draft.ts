import type {Answers, Question} from "./assessment";

export interface DraftState {
    questions: Question[];
    answers: Answers;
    page: number;
    wrongOnly: boolean;
}

interface Draft {
    version: 1;
    signature: string;
    order: { id: string; options?: number[] }[];
    answers: Answers;
    page: number;
    wrongOnly: boolean;
}

const signature = (source: readonly Question[]) => JSON.stringify(source);

export function prepareDraft(source: readonly Question[], questions: readonly Question[]): Pick<Draft, "signature" | "order"> {
    const originals = new Map(source.map(question => [question.id, question]));
    return {
        signature: signature(source),
        order: questions.map(question => {
            const original = originals.get(question.id);
            if (!original) throw new Error("Unknown draft question");
            if (!question.options) return {id: question.id};
            if (!original.options) throw new Error("Invalid draft options");
            const positions = new Map(original.options.map((option, index) => [option, index]));
            const used = new Set<number>();
            return {id: question.id, options: question.options.map(option => {
                let index = positions.get(option);
                if (index === undefined || used.has(index)) {
                    const serialized = JSON.stringify(option);
                    index = original.options!.findIndex((item, i) => !used.has(i) && JSON.stringify(item) === serialized);
                }
                if (index < 0) throw new Error("Unknown draft option");
                used.add(index);
                return index;
            })};
        }),
    };
}

export function captureDraft(source: readonly Question[], state: DraftState, prepared = prepareDraft(source, state.questions)): Draft {
    return {version: 1, ...prepared, page: state.page, wrongOnly: state.wrongOnly, answers: {...state.answers}};
}

/** Restore permutations of current source questions, never serialized content or answer keys. */
export function restoreDraft(source: readonly Question[], value: unknown, pageSize: number): DraftState | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const draft = value as Draft;
    if (draft.version !== 1 || draft.signature !== signature(source) || typeof draft.wrongOnly !== "boolean" ||
        !Array.isArray(draft.order) || !draft.order.length || (!draft.wrongOnly && draft.order.length !== source.length) ||
        !Number.isInteger(draft.page) || draft.page < 0 || draft.page >= Math.ceil(draft.order.length / pageSize) ||
        !draft.answers || typeof draft.answers !== "object" || Array.isArray(draft.answers)) return undefined;
    const originals = new Map(source.map(question => [question.id, question]));
    const questions: Question[] = [], seen = new Set<string>();
    for (const entry of draft.order) {
        if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) return undefined;
        seen.add(entry.id);
        const original = originals.get(entry.id);
        if (!original) return undefined;
        if (original.options) {
            const order = entry.options;
            if (!Array.isArray(order) || order.length !== original.options.length || new Set(order).size !== order.length ||
                order.some(index => !Number.isInteger(index) || index < 0 || index >= original.options!.length)) return undefined;
            questions.push({
                ...original, options: order.map(index => original.options![index]),
                accepted: order.flatMap((index, display) => original.accepted!.includes(index) ? [display] : [])
            });
        } else {
            if (entry.options !== undefined) return undefined;
            questions.push({...original});
        }
    }
    const restored = new Map(questions.map(question => [question.id, question]));
    for (const [id, answer] of Object.entries(draft.answers)) {
        const question = restored.get(id);
        if (!question || (question.options ? typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= question.options.length : typeof answer !== "string")) return undefined;
    }
    return {questions, answers: {...draft.answers}, page: draft.page, wrongOnly: draft.wrongOnly};
}
