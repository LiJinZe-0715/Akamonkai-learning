import {captureExamDraft, type ExamDraftState, restoreExamDraft} from "../domain/exam-draft";
import type {ExamQuestion} from "../domain/exam";
import type {ExamDraftRepository, ExamDraftUseCases} from "./ports";

/** 键与教材草稿共用前缀，清空学习记录时会被一并清掉。 */
export class ExamDraftService implements ExamDraftUseCases {
    constructor(private readonly repository: ExamDraftRepository) {
    }

    private key(examId: string): string {
        return examId + ":exam";
    }

    restore(examId: string, questions: readonly ExamQuestion[]) {
        return restoreExamDraft(questions, this.repository.read(this.key(examId)));
    }

    save(examId: string, questions: readonly ExamQuestion[], state: ExamDraftState) {
        const key = this.key(examId);
        // 空进度没有保留价值：删掉而不是写一条空记录。
        if (!Object.keys(state.answers).length && !state.revealed.length) return this.repository.remove(key);
        return this.repository.write(key, captureExamDraft(questions, state));
    }

    clear(examId: string) {
        return this.repository.remove(this.key(examId));
    }
}
