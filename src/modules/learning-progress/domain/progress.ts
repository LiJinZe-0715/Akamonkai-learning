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
export const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const validWord = (value: unknown): value is WordMark => object(value) && typeof value.saved === "boolean" && typeof value.mastered === "boolean";
const validResult = (value: unknown): value is Progress["results"][string] => object(value) && Number.isInteger(value.total) && (value.total as number) > 0 &&
  Number.isInteger(value.correct) && (value.correct as number) >= 0 && (value.correct as number) <= (value.total as number) && validTime(value.at);
/** Recover independently valid records; the repository retains the original JSON. */
export function recoverProgress(value: unknown): Progress {
  const progress = emptyProgress();
  if (!object(value) || value.version !== 1) return progress;
  if (object(value.words)) progress.words = Object.fromEntries(Object.entries(value.words).filter(([id, word]) => id.trim() && validWord(word))) as Progress["words"];
  if (object(value.results)) progress.results = Object.fromEntries(Object.entries(value.results).filter(([id, result]) => id.trim() && validResult(result))) as Progress["results"];
  if (object(value.wordUpdatedAt)) {
    progress.wordUpdatedAt = Object.fromEntries(Object.entries(value.wordUpdatedAt).filter(([id, times]) => id.trim() && object(times))
      .map(([id, times]) => [id, Object.fromEntries(Object.entries(times as Record<string, unknown>).filter(([field, at]) => ["saved", "mastered"].includes(field) && validTime(at)))]));
  }
  const last = value.lastVisited;
  if (object(last) && typeof last.unitId === "string" && last.unitId.trim() && typeof last.view === "string" && last.view.trim() && validTime(last.at))
    progress.lastVisited = { unitId: last.unitId, view: last.view, at: last.at };
  return progress;
}
