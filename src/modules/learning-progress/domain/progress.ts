export interface WordMark {
    saved: boolean;
    mastered: boolean;
}

export interface Progress {
    version: 1;
    words: Record<string, WordMark>;
    results: Record<string, { correct: number; total: number; at: string }>;
    lastVisited?: { unitId: string; view: string; at: string };
    wordUpdatedAt?: Record<string, { saved?: string; mastered?: string }>;
    /**
     * 清空过几次。合并时代数高的一方整体胜出：清空之前的记录（别的标签页、内存里的旧状态）
     * 不会再合并回来。没有这个字段等同于 0。
     */
    generation?: number;
}

export const emptyProgress = (): Progress => ({
    version: 1,
    words: {},
    results: {},
});

export function validateProgress(value: unknown): value is Progress {
    if (!value || typeof value !== "object") return false;
    const p = value as Progress;
    return (
        p.version === 1 &&
        !!p.words &&
        !!p.results &&
        typeof p.words === "object" &&
        typeof p.results === "object" &&
        !Array.isArray(p.words) &&
        !Array.isArray(p.results) &&
        (p.generation === undefined || validGeneration(p.generation)) &&
        (p.wordUpdatedAt === undefined || (typeof p.wordUpdatedAt === "object" && p.wordUpdatedAt !== null && !Array.isArray(p.wordUpdatedAt) &&
            Object.entries(p.wordUpdatedAt).every(([id, times]) => !!id.trim() && times && typeof times === "object" && !Array.isArray(times) &&
                [times.saved, times.mastered].every(at => at === undefined || validTime(at))))) &&
        (p.lastVisited === undefined ||
            (!!p.lastVisited &&
                typeof p.lastVisited.unitId === "string" && !!p.lastVisited.unitId.trim() &&
                typeof p.lastVisited.view === "string" && !!p.lastVisited.view.trim() &&
                typeof p.lastVisited.at === "string" && Number.isFinite(Date.parse(p.lastVisited.at)))) &&
        Object.entries(p.words).every(
            ([id, w]) => !!id.trim() && validWord(w),
        ) &&
        Object.entries(p.results).every(
            ([id, r]) => !!id.trim() && validResult(r),
        )
    );
}

const validGeneration = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const validWord = (value: unknown): value is WordMark => object(value) && typeof value.saved === "boolean" && typeof value.mastered === "boolean";
const validResult = (value: unknown): value is Progress["results"][string] =>
    object(value) &&
    typeof value.total === "number" && Number.isInteger(value.total) && value.total > 0 &&
    typeof value.correct === "number" && Number.isInteger(value.correct) && value.correct >= 0 &&
    value.correct <= value.total && validTime(value.at);

/**
 * 逐条抢救仍然有效的记录；仓库保留原始 JSON。
 *
 * 用逐条赋值而不是 `Object.fromEntries(...) as ...`：断言会把「过滤条件写错」
 * 变成静默的类型事故，而这里正是要防数据写坏的地方。
 */
export function recoverProgress(value: unknown): Progress {
    const progress = emptyProgress();
    if (!object(value) || value.version !== 1) return progress;
    if (validGeneration(value.generation)) progress.generation = value.generation;
    if (object(value.words)) {
        for (const [id, word] of Object.entries(value.words))
            if (id.trim() && validWord(word)) progress.words[id] = word;
    }
    if (object(value.results)) {
        for (const [id, result] of Object.entries(value.results))
            if (id.trim() && validResult(result)) progress.results[id] = result;
    }
    if (object(value.wordUpdatedAt)) {
        const updatedAt: NonNullable<Progress["wordUpdatedAt"]> = {};
        for (const [id, times] of Object.entries(value.wordUpdatedAt)) {
            if (!id.trim() || !object(times)) continue;
            const marks: { saved?: string; mastered?: string } = {};
            if (validTime(times.saved)) marks.saved = times.saved;
            if (validTime(times.mastered)) marks.mastered = times.mastered;
            updatedAt[id] = marks;
        }
        if (Object.keys(updatedAt).length) progress.wordUpdatedAt = updatedAt;
    }
    const last = value.lastVisited;
    if (object(last) && typeof last.unitId === "string" && last.unitId.trim() && typeof last.view === "string" && last.view.trim() && validTime(last.at))
        progress.lastVisited = {unitId: last.unitId, view: last.view, at: last.at};
    return progress;
}
