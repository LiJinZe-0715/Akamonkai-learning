import type {Progress, WordMark} from "../domain/progress";

export interface ProgressChange {
    progress: Progress;
    persisted: boolean;
}

export interface ProgressUseCases {
    load(): Progress;

    mark(progress: Progress, id: string, field: keyof WordMark): Progress;

    record(progress: Progress, id: string, correct: number, total: number): Progress;

    visit(progress: Progress, unitId: string, view: string): Progress;

    export(progress: Progress): string;

    import(serialized: string, existing: Progress): Progress;

    merge(existing: Progress, incoming: Progress): Progress;

    /** 清空后的进度：代数 +1，记录全无。 */
    clear(progress: Progress): Progress;

    save(progress: Progress): boolean;

    commit(existing: Progress, change: (latest: Progress) => Progress): Promise<ProgressChange>;

    subscribe(listener: () => void): () => void;

    recovery(): string | undefined;

    problem(): "corrupt" | "unavailable" | undefined;
}

export interface ProgressCommands {
    replace(progress: Progress, change?: (latest: Progress) => Progress): Promise<ProgressChange>;

    mark(progress: Progress, id: string, field: keyof WordMark): Promise<ProgressChange>;

    remember(progress: Progress, unitId: string, view: string): Promise<ProgressChange | undefined>;

    clear(progress: Progress): Promise<ProgressChange>;
}

/** 导入失败卡在哪一步。界面统一提示「文件无效」，但测试与排查要能分辨。 */
export type ImportFailure = "too-large" | "unreadable" | "not-progress";

export type ImportOutcome = { status: "imported"; progress: Progress } | { status: "invalid-file"; reason: ImportFailure };

export interface ProgressTransferUseCases {
    export(progress: Progress): void;

    exportRecovery(): void;

    import(file: unknown, existing: Progress | (() => Progress)): Promise<ImportOutcome>;
}
