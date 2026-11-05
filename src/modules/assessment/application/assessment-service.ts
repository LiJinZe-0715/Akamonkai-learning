import type {AssessmentUseCases} from "./contracts";
import {type Answers, grade, isCorrect, prepareQuestions, type Question} from "../domain/question";
import {buildVocabularyQuestions, type VocabularyQuestionSource} from "../domain/vocabulary-questions";

export class AssessmentService implements AssessmentUseCases {
    /** 现场生成的单词题用这个随机源；测试里可注入固定序列。 */
    constructor(private readonly random: () => number = Math.random) {
    }

    start(questions: readonly Question[]) {
        return prepareQuestions(questions);
    }

    grade(questions: readonly Question[], answers: Answers) {
        return grade(questions, answers);
    }

    isCorrect(question: Question, answer: number | string | undefined) {
        return isCorrect(question, answer);
    }

    retry(questions: readonly Question[], answers: Answers) {
        return prepareQuestions(questions.filter(question => !isCorrect(question, answers[question.id])));
    }

    vocabulary(words: readonly VocabularyQuestionSource[], meaning: (id: string) => string, alternativeMeaning?: (id: string) => string) {
        return buildVocabularyQuestions(words, meaning, this.random, alternativeMeaning);
    }
}
