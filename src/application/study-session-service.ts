import {
    lessonQuestionSections, lessonWords, moduleOrder,
    type Lesson, type LessonQuestionSection, type ModuleKey, type View
} from "../modules/curriculum/public";
import {vocabularyQuizIdPrefix, type Answers, type AssessmentUseCases, type Question} from "../modules/assessment/public";
import {assessmentResultId, type Progress, type ProgressUseCases} from "../modules/learning-progress/public";

export type Submission = { status: "incomplete" } | { status: "submitted"; progress: Progress };

export interface StudySessionUseCases {
    /** 测验题按模块顺序分块，块内保持教材顺序；现场生成的词题归回来源模块。 */
    sections(lesson: Lesson): LessonQuestionSection[];

    /** 分块摊平后的题目，不打乱。 */
    source(lesson: Lesson): Question[];

    start(lesson: Lesson): Question[];

    submit(questions: readonly Question[], answers: Answers, progress: Progress, lessonId: string, view: View): Submission;
}

export class StudySessionService implements StudySessionUseCases {
    constructor(private readonly assessment: AssessmentUseCases, private readonly progress: ProgressUseCases) {
    }

    sections(lesson: Lesson): LessonQuestionSection[] {
        const grouped = new Map<ModuleKey, Question[]>();
        for (const section of lessonQuestionSections(lesson.modules))
            grouped.set(section.module, [...section.questions]);
        if (lesson.wordQuiz) {
            const words = lessonWords(lesson.modules);
            if (words.length) {
                const dynamic = this.assessment.vocabulary(words,
                    id => lesson.texts[id]?.zh ?? "",
                    id => lesson.texts[id]?.en ?? "");
                const wordModuleIds = new Set((lesson.modules.words?.items ?? []).map(word => word.id));
                for (const question of dynamic) {
                    // 生成题 id 是「前缀 + 词 id」：词表模块的词进「词汇」，汉字例词进「汉字」。
                    // 不按来源拆开生成，干扰项仍从整课词表里挑，出题行为不变。
                    const owner: ModuleKey = wordModuleIds.has(question.id.slice(vocabularyQuizIdPrefix.length))
                        ? "words" : "kanji";
                    const questions = grouped.get(owner);
                    if (questions) questions.push(question);
                    else grouped.set(owner, [question]);
                }
            }
        }
        return moduleOrder.flatMap(module => {
            const questions = grouped.get(module);
            return questions?.length ? [{module, questions}] : [];
        });
    }

    source(lesson: Lesson): Question[] {
        return this.sections(lesson).flatMap(section => section.questions);
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
