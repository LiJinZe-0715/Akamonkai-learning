import type { Segment, TextId } from "../../../shared/kernel/types";
export interface Question {
  id: string;
  prompt: Segment[];
  instructionId?: TextId;
  options?: Segment[][];
  accepted?: number[];
  acceptedText?: string[];
  explanationId?: TextId;
}
export type Answers = Record<string, number | string>;
export function normalizeAnswer(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96));
}
export function isCorrect(q: Question, value: number | string | undefined) {
  if (q.options)
    return typeof value === "number" && (q.accepted ?? []).includes(value);
  return (
    typeof value === "string" &&
    !!normalizeAnswer(value) &&
    (q.acceptedText ?? []).some(
      (a) => normalizeAnswer(a) === normalizeAnswer(value),
    )
  );
}
export function grade(questions: readonly Question[], answers: Answers) {
  const answered = questions.filter(
    (q) => answers[q.id] !== undefined && String(answers[q.id]).trim() !== "",
  ).length;
  const wrongIds = questions
    .filter((q) => !isCorrect(q, answers[q.id]))
    .map((q) => q.id);
  return {
    total: questions.length,
    answered,
    correct: questions.length - wrongIds.length,
    wrongIds,
    complete: answered === questions.length,
  };
}
export function shuffle<T>(
  values: readonly T[],
  random: () => number,
): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
export function prepareQuestions(
  questions: readonly Question[],
  random: () => number,
): Question[] {
  return shuffle(questions, random).map((q) => {
    if (!q.options) return { ...q };
    const indices = shuffle(
      q.options.map((_, i) => i),
      random,
    );
    return {
      ...q,
      options: indices.map((i) => q.options![i]),
      accepted: indices.flatMap((original, display) =>
        (q.accepted ?? []).includes(original) ? [display] : [],
      ),
    };
  });
}
