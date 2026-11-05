import {lessonQuestions, lessonWords, type Lesson, type View} from "../modules/curriculum/public";
import type {Answers, AssessmentUseCases, Question} from "../modules/assessment/public";
import {assessmentResultId, type Progress, type ProgressUseCases} from "../modules/learning-progress/public";

export type Submission = { status: "incomplete" } | { status: "submitted"; progress: Progress };

export interface StudySessionUseCases {
    /** 测验题按模块顺序、条目顺序收集，不打乱。 */
    source(lesson: Lesson): Question[];

    start(lesson: Lesson): Question[];

    submit(questions: readonly Question[], answers: Answers, progress: Progress, lessonId: string, view: View): Submission;
}

export class StudySessionService implements StudySessionUseCases {
    constructor(private readonly assessment: AssessmentUseCases, private readonly progress: ProgressUseCases) {
    }

    source(lesson: Lesson): Question[] {
        // 教材固定题按原顺序；带 wordQuiz 的课再现场生成一批打乱过的单词题。
        const fixed = [...lessonQuestions(lesson.modules)];
        const words = lesson.wordQuiz ? lessonWords(lesson.modules) : [];
        if (!words.length) return fixed;
        const dynamic = this.assessment.vocabulary(words,
            id => lesson.texts[id]?.zh ?? "",
            id => lesson.texts[id]?.en ?? "");
        return [...fixed, ...dynamic];
    }

    start(lesson: Lesson): Question[] {
        return this.assessment.start(this.source(lesson));
    }

    submit(questions: readonly Question[], answers: Answers, progress: Progress, lessonId: string, view: View): Submission {
        const result = this.assessment.grade(questions, answers);
        if (!result.complete || result.total === 0) return {status: "incomplete"};
        return {
            status: "submitted",
            progress: this.progress.record(progress, assessmentResultId(lessonId, view), result.correct, result.total)
        };
    }
}
