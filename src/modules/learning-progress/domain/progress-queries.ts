import type {Progress, WordMark} from "./progress";

export type WordFilter = "all" | keyof WordMark;

export function matchesWordFilter(progress: Progress, id: string, filter: WordFilter): boolean {
    return filter === "all" || !!progress.words[id]?.[filter];
}

export function progressSummary(progress: Progress): { saved: number; mastered: number; tests: number } {
    const words = Object.values(progress.words);
    return {
        saved: words.filter(word => word.saved).length,
        mastered: words.filter(word => word.mastered).length,
        tests: Object.keys(progress.results).length
    };
}

/** 结果 ID 沿用版本 1 的格式，含带冒号的单元 ID。 */
export function assessmentResultId(unitId: string, view: string): string {
    return unitId + ":" + view;
}

/** 全部已记录的结果，新的在前；显示几条由调用方决定。 */
export function resultsByRecency(progress: Progress): {
    unitId: string;
    view: string;
    result: Progress["results"][string]
}[] {
    return Object.entries(progress.results).sort((left, right) => Date.parse(right[1].at) - Date.parse(left[1].at)).map(([key, result]) => {
        const split = key.lastIndexOf(":");
        return {unitId: key.slice(0, split), view: key.slice(split + 1), result};
    });
}
