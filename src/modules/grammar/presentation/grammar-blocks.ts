import type {TextId} from "../../../shared/kernel/text-types";

/** How a paragraph reads: core meaning, pattern, prose or warning. */
export type ExplainTone = "core" | "pattern" | "plain" | "warn";

export interface ExplainBlock {
    id: TextId;
    labelId: string;
    tone: ExplainTone;
}

/**
 * Textbook authors name paragraph suffixes after their job, and every textbook
 * picked a slightly different word for the same job. Map them onto one reading
 * order so the explanation keeps a stable shape across books.
 */
const suffixes: Record<string, {labelId: string; tone: ExplainTone; order: number}> = {
    meaning: {labelId: "ui.grammarMeaning", tone: "core", order: 0},
    anchor: {labelId: "ui.grammarMeaning", tone: "core", order: 0},
    explanation: {labelId: "ui.grammarMeaning", tone: "core", order: 0},
    gist: {labelId: "ui.grammarMeaning", tone: "core", order: 0},
    formation: {labelId: "ui.grammarFormation", tone: "pattern", order: 1},
    connection: {labelId: "ui.grammarFormation", tone: "pattern", order: 1},
    join: {labelId: "ui.grammarFormation", tone: "pattern", order: 1},
    usage: {labelId: "ui.grammarUsage", tone: "plain", order: 2},
    logic: {labelId: "ui.grammarUsage", tone: "plain", order: 2},
    note: {labelId: "ui.grammarNote", tone: "plain", order: 3},
    contrast: {labelId: "ui.grammarPitfall", tone: "warn", order: 4},
    pitfall: {labelId: "ui.grammarPitfall", tone: "warn", order: 4},
    analysis: {labelId: "ui.grammarBreakdown", tone: "plain", order: 5},
};

const fallback = {labelId: "ui.grammarNote", tone: "plain" as ExplainTone, order: 6};

/** Split an article's paragraph list into labelled blocks, in reading order. */
export function explainBlocks(paragraphIds: readonly TextId[]): ExplainBlock[] {
    return paragraphIds
        .map((id, index) => {
            const suffix = id.slice(id.lastIndexOf(".") + 1);
            const kind = suffixes[suffix] ?? fallback;
            return {id, labelId: kind.labelId, tone: kind.tone, order: kind.order, index};
        })
        .sort((a, b) => a.order - b.order || a.index - b.index)
        .map(({id, labelId, tone}) => ({id, labelId, tone}));
}
