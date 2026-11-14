import {defaultView, findLesson, type Book, type Catalog, type CurriculumDiscovery, type StudyDestination} from "../modules/curriculum/public";
import {type Progress, progressSummary, resultsByRecency} from "../modules/learning-progress/public";

export interface Dashboard {
    total: number;
    active?: StudyDestination;
    isResuming: boolean;
    summary: ReturnType<typeof progressSummary>;
    recentResults: (StudyDestination & { result: Progress["results"][string] })[];
    books: Book[];
}

export interface DashboardUseCases {
    overview(catalog: Catalog, progress: Progress, level: string, query: string, recentLimit: number): Dashboard;
}

/** 跨上下文的读取用例：把学习记录与当前可用的课程目录关联起来。 */
export class DashboardService implements DashboardUseCases {
    constructor(private readonly curriculum: CurriculumDiscovery) {
    }

    overview(catalog: Catalog, progress: Progress, level: string, query: string, recentLimit: number): Dashboard {
        const lessons = this.curriculum.lessons(catalog);
        const last = progress.lastVisited;
        const previous = last && findLesson(catalog, last.unitId, last.view);
        const first = lessons[0];
        return {
            total: lessons.length,
            active: previous ?? (first && {...first, view: defaultView(first.lesson.views)}),
            isResuming: !!previous,
            summary: progressSummary(progress),
            recentResults: resultsByRecency(progress).flatMap(({unitId, view, result}) => {
                const destination = findLesson(catalog, unitId, view);
                return destination ? [{...destination, result}] : [];
            }).slice(0, recentLimit),
            books: this.curriculum.search(catalog, level, query),
        };
    }
}
