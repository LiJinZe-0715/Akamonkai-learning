import type {Segment, TextId} from "../../../shared/kernel/text-types";

interface QuestionContent {
    readonly id: string;
    readonly prompt: readonly Segment[];
    readonly instructionId?: TextId;
    readonly explanationId?: TextId;
}

export type Question = QuestionContent & (
    { readonly options: readonly (readonly Segment[])[]; readonly accepted: readonly number[]; readonly acceptedText?: never } |
    { readonly options?: never; readonly accepted?: never; readonly acceptedText: readonly string[] }
);

export type Answers = Record<string, number | string>;

/** Katakana with no precomposed hiragana form; NFKC keeps these composed, so map them by hand. */
const katakanaExtras: Readonly<Record<string, string>> = {
    "ヷ": "わ\u3099", "ヸ": "ゐ\u3099", "ヹ": "ゑ\u3099", "ヺ": "を\u3099",
};

export function normalizeAnswer(value: string) {
    return value
        .normalize("NFKC")
        .trim()
        .replace(/\s/g, "")
        // ァ..ヶ sit exactly one hiragana block below their hiragana counterparts.
        .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96))
        .replace(/[ヷ-ヺ]/g, (c) => katakanaExtras[c] ?? c);
    // ー is shared by both scripts and is deliberately preserved.
}

export function isCorrect(q: Question, value: number | string | undefined) {
    if (q.options)
        return typeof value === "number" && q.accepted.includes(value);
    return (
        typeof value === "string" &&
        !!normalizeAnswer(value) &&
        q.acceptedText.some(
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
        if (!q.options) return {...q};
        const indices = shuffle(
            q.options.map((_, i) => i),
            random,
        );
        return {
            ...q,
            options: indices.map((i) => q.options![i]),
            accepted: indices.flatMap((original, display) =>
                q.accepted.includes(original) ? [display] : [],
            ),
        };
    });
}
