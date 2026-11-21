import type {Progress} from "../domain/progress";

export interface ProgressRepository {
    read(): unknown;

    write(progress: Progress): boolean;

    exclusive?<T>(task: (writable: boolean) => T): Promise<T>;

    subscribe?(listener: () => void): () => void;

    recovery?(): string | undefined;
}

/** UI 传入不透明的文件选择句柄；浏览器相关方法留在适配器里。 */
export interface ProgressFileStore {
    size(file: unknown): number;

    read(file: unknown): Promise<string>;

    download(serialized: string, filename?: string): void;
}
