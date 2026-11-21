import type {ExamRepository} from "../application/ports";
import type {Exam} from "../domain/exam";
import {type JsonReader, readJson} from "../../../shared/infrastructure/http-json";
import {decodeExam} from "./exam-decoder";

/** 真题 id 与教材课 id 同一套路径规则；顺带挡掉路径穿越。 */
const examIdPattern = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

export class HttpExamRepository implements ExamRepository {
    private exams = new Map<string, Promise<Exam>>();

    constructor(private readonly read: JsonReader = readJson) {
    }

    exam(id: string) {
        if (!examIdPattern.test(id)) return Promise.reject(new Error("Invalid exam ID"));
        let pending = this.exams.get(id);
        if (!pending) {
            pending = this.read("/content/exams/" + id + ".json")
                .then(value => decodeExam(value, id))
                .catch(error => {
                    this.exams.delete(id);
                    throw error;
                });
            this.exams.set(id, pending);
        }
        return pending;
    }
}
