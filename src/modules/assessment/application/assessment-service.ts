import type {AssessmentUseCases} from "./contracts";
import {type Answers, type AssessmentResult, grade, isCorrect, type Question} from "../domain/question";
import {buildVocabularyQuestions, seededRandom, type VocabularyQuestionSource} from "../domain/vocabulary-questions";

export class AssessmentService implements AssessmentUseCases {
    /** 现场生成的单词题用这个随机源；测试里可注入固定序列。 */
    constructor(private readonly random: () => number = Math.random) {
    }

    start(questions: readonly Question[]) {
        // 按教材原顺序出，只复制一层，避免调用方改动影响题目源。
        return [...questions];
    }

    grade(questions: readonly Question[], answers: Answers): AssessmentResult {
        return grade(questions, answers);
    }

    isCorrect(question: Question, answer: number | string | undefined) {
        return isCorrect(question, answer);
    }

    retry(questions: readonly Question[], answers: Answers) {
        return questions.filter(question => !isCorrect(question, answers[question.id]));
    }

    vocabulary(words: readonly VocabularyQuestionSource[], meaning: (id: string) => string,
               alternativeMeaning?: (id: string) => string, seed?: string) {
        // 有 seed 就走确定性随机源：同一课每次打开都还原同一套选项顺序，
        // 草稿签名（含正确答案下标）才不会失配。没 seed 时保留可注入的随机源给测试用。
        const random = seed === undefined ? this.random : seededRandom(seed);
        return buildVocabularyQuestions(words, meaning, random, alternativeMeaning);
    }
}
