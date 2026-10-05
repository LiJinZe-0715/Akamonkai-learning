import type { Progress } from "../domain/progress";
export interface ProgressChange { progress: Progress; persisted: boolean; }
export interface ProgressUseCases {
 load(): Progress;
 mark(progress: Progress, id: string, field: "saved" | "mastered"): Progress;
 record(progress: Progress, id: string, correct: number, total: number): Progress;
 visit(progress: Progress, unitId: string, view: string): Progress;
 save(progress: Progress): boolean;
 export(progress: Progress): string;
 import(serialized: string, existing: Progress): Progress;
  commit(existing: Progress, change: (latest: Progress) => Progress): Promise<ProgressChange>;
  subscribe(listener: () => void): () => void;
  recovery(): string | undefined;
  problem(): "corrupt" | "unavailable" | undefined;
}
