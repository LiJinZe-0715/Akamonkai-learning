import type {Answers, AssessmentResult, Question} from "../domain/question";
import type {DraftState} from "../domain/draft";
import type {VocabularyQuestionSource} from "../domain/vocabulary-questions";

export interface DraftUseCases {
    restore(key: string, source: readonly Question[]): DraftState | undefined;

    save(key: string, source: readonly Question[], state: DraftState): boolean;

    clear(key: string): boolean;

    clearAll(): boolean;
}

export interface AssessmentUseCases {
    /** 按教材原顺序出题，不打乱题目和选项。 */
    start(questions: readonly Question[]): Question[];

    grade(questions: readonly Question[], answers: Answers): AssessmentResult;

    isCorrect(question: Question, answer: number | string | undefined): boolean;

    retry(questions: readonly Question[], answers: Answers): Question[];

    /**
     * 单词测验现场生成：选项与干扰项都打乱，不受固定题「不打乱」的约束。
     * 传 seed 时改用确定性随机源（按课 id 派生），同一课每次生成同一套题。
     */
    vocabulary(words: readonly VocabularyQuestionSource[], meaning: (id: string) => string,
               alternativeMeaning?: (id: string) => string, seed?: string): Question[];
}
