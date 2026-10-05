import type { LessonBundle, View } from "../modules/curriculum/public";
import type { AssessmentUseCases, Answers, Question } from "../modules/assessment/public";
import { assessmentIdentity, type Progress, type ProgressUseCases } from "../modules/learning-progress/public";

export type Submission = { status: "incomplete" } | { status: "submitted"; progress: Progress };
export interface StudySessionUseCases {
  source(lesson: LessonBundle, view: View): Question[];
  start(lesson: LessonBundle, view: View): Question[];
  submit(questions: readonly Question[], answers: Answers, progress: Progress, unitId: string, view: View): Submission;
}
export class StudySessionService implements StudySessionUseCases {
  constructor(private readonly assessment: AssessmentUseCases, private readonly progress: ProgressUseCases) {}
  source(lesson: LessonBundle, view: View): Question[] {
    return view === "word-test"
      ? this.assessment.vocabulary(lesson.words, id => lesson.texts[id].zh, id => lesson.texts[id].en) : lesson.questions;
  }
  start(lesson: LessonBundle, view: View): Question[] {
    return this.assessment.start(this.source(lesson, view));
  }
  submit(questions: readonly Question[], answers: Answers, progress: Progress, unitId: string, view: View): Submission {
    const result = this.assessment.grade(questions, answers);
    if (!result.complete || result.total === 0) return { status: "incomplete" };
    return { status: "submitted", progress: this.progress.record(progress, assessmentIdentity(unitId, view), result.correct, result.total) };
  }
}
