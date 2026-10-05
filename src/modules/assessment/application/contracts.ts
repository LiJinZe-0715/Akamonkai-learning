import type { Question, Answers } from "../domain/assessment";
import type { VocabularyQuestionSource } from "../domain/vocabulary-questions";
export interface AssessmentUseCases {
 start(questions: readonly Question[]): Question[];
 grade(questions: readonly Question[], answers: Answers): {total: number; answered: number; correct: number; wrongIds: string[]; complete: boolean};
 correct(question: Question, answer: number | string | undefined): boolean;
 retry(questions: readonly Question[], answers: Answers): Question[];
 vocabulary(words: readonly VocabularyQuestionSource[], meaning: (id: string) => string, alternativeMeaning?: (id: string) => string): Question[];
}
