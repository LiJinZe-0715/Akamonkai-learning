import type {Exam, ExamQuestion} from "../domain/exam";
import type {ExamDraftState} from "../domain/exam-draft";

/** 真题读取口。与教材的 CurriculumRepository 分开：真题不是课，加载路径也不同。 */
export interface ExamRepository {
    exam(id: string): Promise<Exam>;
}

export interface ExamUseCases {
    exam(id: string): Promise<Exam>;
}

/** 真题作答草稿：与教材草稿共用一套本地存储，按考试 id 索引。 */
export interface ExamDraftRepository {
    read(key: string): unknown;

    write(key: string, value: unknown): boolean;

    remove(key: string): boolean;
}

export interface ExamDraftUseCases {
    restore(examId: string, questions: readonly ExamQuestion[]): ExamDraftState | undefined;

    save(examId: string, questions: readonly ExamQuestion[], state: ExamDraftState): boolean;

    clear(examId: string): boolean;
}
