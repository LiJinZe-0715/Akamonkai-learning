import type { Progress } from "../domain/progress";
export interface ProgressRepository {
  read(): unknown;
  write(progress: Progress): boolean;
  exclusive?<T>(task: (writable: boolean) => T): Promise<T>;
  subscribe?(listener: () => void): () => void;
  recovery?(): string | undefined;
}
