import type { AssessmentUseCases } from "./contracts";
import {
  grade,
  prepareQuestions,
  isCorrect,
  type Question,
  type Answers,
} from "../domain/assessment";
import { buildVocabularyQuestions, type VocabularyQuestionSource } from "../domain/vocabulary-questions";
export class AssessmentService implements AssessmentUseCases {
  constructor(private readonly random: () => number = Math.random) {}
  start(questions: readonly Question[]) {
    return prepareQuestions(questions, this.random);
  }
  grade(questions: readonly Question[], answers: Answers) {
    return grade(questions, answers);
  }
  correct(q: Question, value: number | string | undefined) {
    return isCorrect(q, value);
  }
  retry(questions: readonly Question[], answers: Answers) {
    return prepareQuestions(
      questions.filter((q) => !isCorrect(q, answers[q.id])),
      this.random,
    );
  }
  vocabulary(words: readonly VocabularyQuestionSource[], meaning: (id: string) => string, alternativeMeaning?: (id: string) => string) { return buildVocabularyQuestions(words, meaning, alternativeMeaning); }
}
