import type { Catalog, Book, StudyDestination, CurriculumDiscovery } from "../modules/curriculum/public";
import { progressSummary, recentResults, type Progress } from "../modules/learning-progress/public";

export interface Dashboard {
  total: number;
  active?: StudyDestination;
  resuming: boolean;
  summary: ReturnType<typeof progressSummary>;
  recent: (StudyDestination & { result: Progress["results"][string] })[];
  visible: Book[];
}
export interface DashboardUseCases {
  overview(catalog: Catalog, progress: Progress, bookId: string, query: string, recentLimit: number): Dashboard;
}
/** Cross-context read use case: progress records are joined to currently available curriculum. */
export class DashboardService implements DashboardUseCases {
  constructor(private readonly curriculum: CurriculumDiscovery) {}
  overview(catalog: Catalog, progress: Progress, bookId: string, query: string, recentLimit: number): Dashboard {
    const lessons = this.curriculum.lessons(catalog);
    const last = progress.lastVisited;
    const previous = last && this.curriculum.destination(catalog, last.unitId, last.view);
    const first = lessons[0];
    return {
      total: lessons.length,
      active: previous ?? (first && { ...first, view: first.unit.views[0] }),
      resuming: !!previous,
      summary: progressSummary(progress),
      recent: recentResults(progress).flatMap(({ unitId, view, result }) => {
        const destination = this.curriculum.destination(catalog, unitId, view);
        return destination ? [{ ...destination, result }] : [];
      }).slice(0, recentLimit),
      visible: this.curriculum.search(catalog, bookId, query),
    };
  }
}
