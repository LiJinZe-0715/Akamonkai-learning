import type {TextId} from "../../../shared/kernel/text-types";

export interface Word {
    readonly id: string;
    readonly progressId?: string;
    readonly wordJa: string;
    readonly readingJa: string;
    readonly meaningId: TextId;
    readonly noteId?: TextId;
}

export function filterWords(
    words: readonly Word[],
    query: string,
    meaning: (id: TextId) => string,
): Word[] {
    const needle = query.trim().toLocaleLowerCase();
    return words.filter(
        (w) =>
            !needle ||
            [w.wordJa, w.readingJa, meaning(w.meaningId)].some((s) =>
                s.toLocaleLowerCase().includes(needle),
            ),
    );
}
