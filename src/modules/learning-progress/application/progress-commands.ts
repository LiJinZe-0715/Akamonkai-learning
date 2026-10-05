import type { Progress, WordMark } from "../domain/progress";
import type { ProgressUseCases, ProgressChange } from "./contracts";

export type { ProgressChange } from "./contracts";
export interface ProgressCommands {
  replace(progress: Progress, change?: (latest: Progress) => Progress): Promise<ProgressChange>;
  mark(progress: Progress, id: string, field: keyof WordMark): Promise<ProgressChange>;
  remember(progress: Progress, unitId: string, view: string): Promise<ProgressChange | undefined>;
}
/** A failed persistence write still returns the in-memory learning state, as before. */
export class ProgressCommandService implements ProgressCommands {
  constructor(private readonly progress: ProgressUseCases) {}
  replace(progress: Progress, change?: (latest: Progress) => Progress): Promise<ProgressChange> { return this.progress.commit(progress, change ?? (current => this.progress.import(this.progress.export(progress), current))); }
  mark(progress: Progress, id: string, field: keyof WordMark): Promise<ProgressChange> {
    return this.progress.commit(progress, current => this.progress.mark(current, id, field));
  }
  async remember(progress: Progress, unitId: string, view: string): Promise<ProgressChange | undefined> {
    if (progress.lastVisited?.unitId === unitId && progress.lastVisited.view === view) return undefined;
    return this.progress.commit(progress, current => this.progress.visit(current, unitId, view));
  }
}
