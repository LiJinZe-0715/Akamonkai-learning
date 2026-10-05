import type { Progress, WordMark } from "./progress";

export type WordFilter = "all" | keyof WordMark;
export function matchesWordFilter(progress: Progress, id: string, filter: WordFilter): boolean {
  return filter === "all" || !!progress.words[id]?.[filter];
}
export function progressSummary(progress: Progress): { saved: number; mastered: number; tests: number } {
  const words = Object.values(progress.words);
  return { saved: words.filter(word => word.saved).length, mastered: words.filter(word => word.mastered).length, tests: Object.keys(progress.results).length };
}
/** Result IDs keep the version 1 format, including unit IDs containing colons. */
export function assessmentIdentity(unitId: string, view: string): string { return unitId + ":" + view; }
export function recentResults(progress: Progress): { unitId: string; view: string; result: Progress["results"][string] }[] {
  return Object.entries(progress.results).sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).map(([key, result]) => {
    const split = key.lastIndexOf(":");
    return { unitId: key.slice(0, split), view: key.slice(split + 1), result };
  });
}
