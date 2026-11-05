import type {Progress, WordMark} from "../domain/progress";
import type {ProgressChange, ProgressCommands, ProgressUseCases} from "./contracts";

/** 持久化写入失败时，仍照旧返回内存中的学习状态。 */
export class ProgressCommandService implements ProgressCommands {
    constructor(private readonly progress: ProgressUseCases) {
    }

    replace(progress: Progress, change?: (latest: Progress) => Progress): Promise<ProgressChange> {
        return this.progress.commit(progress, change ?? (current => this.progress.merge(current, progress)));
    }

    mark(progress: Progress, id: string, field: keyof WordMark): Promise<ProgressChange> {
        return this.progress.commit(progress, current => this.progress.mark(current, id, field));
    }

    clear(progress: Progress): Promise<ProgressChange> {
        return this.progress.commit(progress, current => this.progress.clear(current));
    }

    async remember(progress: Progress, unitId: string, view: string): Promise<ProgressChange | undefined> {
        if (progress.lastVisited?.unitId === unitId && progress.lastVisited.view === view) return undefined;
        return this.progress.commit(progress, current => this.progress.visit(current, unitId, view));
    }
}
