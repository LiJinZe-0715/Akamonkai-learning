import type {Exam} from "../domain/exam";
import type {ExamRepository, ExamUseCases} from "./ports";

export class ExamService implements ExamUseCases {
    constructor(private readonly repository: ExamRepository) {
    }

    exam(id: string): Promise<Exam> {
        return this.repository.exam(id);
    }
}
