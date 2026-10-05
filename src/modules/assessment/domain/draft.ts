import type { Answers, Question } from "./assessment";
export interface DraftState { questions: Question[]; answers: Answers; page: number; wrongOnly: boolean; }
interface Draft {
  version: 1;
  signature: string;
  order: { id: string; options?: number[] }[];
  answers: Answers;
  page: number;
  wrongOnly: boolean;
}
const signature = (source: readonly Question[]) => JSON.stringify(source);
export function captureDraft(source: readonly Question[], state: DraftState): Draft {
  return {
    version: 1, signature: signature(source), page: state.page, wrongOnly: state.wrongOnly, answers: { ...state.answers },
    order: state.questions.map(question => {
      const original = source.find(item => item.id === question.id);
      if (!original) throw new Error("Unknown draft question");
      return { id: question.id, ...(question.options ? { options: question.options.map(option => original.options!.findIndex(item => JSON.stringify(item) === JSON.stringify(option))) } : {}) };
    }),
  };
}
/** Restore permutations of current source questions, never serialized content or answer keys. */
export function restoreDraft(source: readonly Question[], value: unknown, pageSize: number): DraftState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const draft = value as Draft;
  if (draft.version !== 1 || draft.signature !== signature(source) || typeof draft.wrongOnly !== "boolean" ||
      !Array.isArray(draft.order) || !draft.order.length || (!draft.wrongOnly && draft.order.length !== source.length) ||
      !Number.isInteger(draft.page) || draft.page < 0 || draft.page >= Math.ceil(draft.order.length / pageSize) ||
      !draft.answers || typeof draft.answers !== "object" || Array.isArray(draft.answers)) return undefined;
  const questions: Question[] = [], seen = new Set<string>();
  for (const entry of draft.order) {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) return undefined;
    seen.add(entry.id);
    const original = source.find(question => question.id === entry.id);
    if (!original) return undefined;
    if (original.options) {
      const order = entry.options;
      if (!Array.isArray(order) || order.length !== original.options.length || new Set(order).size !== order.length ||
          order.some(index => !Number.isInteger(index) || index < 0 || index >= original.options!.length)) return undefined;
      questions.push({ ...original, options: order.map(index => original.options![index]),
        accepted: order.flatMap((index, display) => original.accepted!.includes(index) ? [display] : []) });
    } else {
      if (entry.options !== undefined) return undefined;
      questions.push({ ...original });
    }
  }
  for (const [id, answer] of Object.entries(draft.answers)) {
    const question = questions.find(item => item.id === id);
    if (!question || (question.options ? typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= question.options.length : typeof answer !== "string")) return undefined;
  }
  return { questions, answers: { ...draft.answers }, page: draft.page, wrongOnly: draft.wrongOnly };
}
