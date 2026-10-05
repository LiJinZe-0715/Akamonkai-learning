import type { ProgressUseCases } from "./contracts";
import { emptyProgress, recoverProgress, validateProgress, type Progress } from "../domain/progress";
import { LearningProgress } from "../domain/learning-progress";
import type { ProgressRepository } from "./ports";
import type { Clock } from "../../../shared/kernel/clock";
export class ProgressService implements ProgressUseCases {
  private pending: Promise<unknown> = Promise.resolve();
  private issue?: "corrupt" | "unavailable";
  constructor(private readonly repository: ProgressRepository, private readonly clock: Clock, private readonly aliases: Readonly<Record<string, string>> = {}) {}
  private normalize(progress: Progress) { return new LearningProgress(progress).rekey(this.aliases); }
  load() {
    const value = this.repository.read();
    this.issue = value === undefined ? "unavailable" : value !== null && !validateProgress(value) ? "corrupt" : undefined;
    return this.normalize(value === null || value === undefined ? emptyProgress() : validateProgress(value) ? value : recoverProgress(value));
  }
  private time(previous?: string) { return new Date(Math.max(Date.parse(this.clock.now()), previous ? Date.parse(previous) + 1 : 0)).toISOString(); }
  mark(progress: Progress, id: string, field: "saved" | "mastered") {
    const state = this.normalize(progress), canonical = Object.hasOwn(this.aliases, id) ? this.aliases[id] : id;
    return new LearningProgress(state).mark(canonical, field, this.time(state.wordUpdatedAt?.[canonical]?.[field]));
  }
  record(progress: Progress, id: string, correct: number, total: number) { return new LearningProgress(progress).record(id, correct, total, this.time(progress.results[id]?.at)); }
  visit(progress: Progress, unitId: string, view: string) { return new LearningProgress(progress).visit(unitId, view, this.time(progress.lastVisited?.at)); }
  save(progress: Progress) { new LearningProgress(progress); return this.repository.write(progress); }
  export(progress: Progress) { new LearningProgress(progress); return JSON.stringify(progress, null, 2); }
  import(serialized: string, existing: Progress) {
    const next: unknown = JSON.parse(serialized);
    if (!validateProgress(next)) throw new Error("Invalid progress file");
    return new LearningProgress(this.normalize(existing)).merge(this.normalize(next));
  }
  commit(existing: Progress, change: (latest: Progress) => Progress) {
    const task = () => {
      const work = (writable: boolean) => {
        const latest = this.import(this.export(existing), this.load());
        const progress = this.normalize(change(latest));
        return { progress, persisted: writable && this.save(progress) };
      };
      return this.repository.exclusive ? this.repository.exclusive(work) : Promise.resolve(work(true));
    };
    const result = this.pending.then(task);
    this.pending = result.catch(() => {});
    return result;
  }
  subscribe(listener: () => void) { return this.repository.subscribe?.(listener) ?? (() => {}); }
  recovery() { return this.repository.recovery?.(); }
  problem() { return this.issue; }
}
