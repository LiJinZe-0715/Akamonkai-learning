import {type Book, type Catalog, defaultView, isView, type LessonSummary, type View} from "./catalog";

export interface CatalogLesson {
    book: Book;
    lesson: LessonSummary;
}

export interface StudyDestination extends CatalogLesson {
    view: View;
}

export interface AdjacentLesson {
    lesson: LessonSummary;
    view: View;
    direction: "previous" | "next";
}

/** 目录里的课，按教材顺序展开。 */
export function catalogLessons(catalog: Catalog): CatalogLesson[] {
    const summaries = new Map(catalog.lessons.map(lesson => [lesson.id, lesson]));
    return catalog.books.flatMap(book => book.lessonIds.flatMap(id => {
        const lesson = summaries.get(id);
        return lesson ? [{book, lesson}] : [];
    }));
}

/** 学习记录指向的课与页签；页签必须真的在这一课开放。 */
export function findLesson(catalog: Catalog, lessonId: string, view: string): StudyDestination | undefined {
    // 先确认是合法页签，再去找课：不这么做就得把字符串断言成 View。
    if (!isView(view)) return undefined;
    const match = catalogLessons(catalog).find(item => item.lesson.id === lessonId && item.lesson.views.includes(view));
    return match ? {...match, view} : undefined;
}

export function filterCatalog(catalog: Catalog, level: string, query: string): Book[] {
    const needle = query.trim().toLowerCase();
    const summaries = new Map(catalog.lessons.map(lesson => [lesson.id, lesson]));
    const exams = new Map(catalog.exams.map(exam => [exam.id, exam]));
    return catalog.books.filter(book => level === "all" || book.shelfLevel === level)
        .map(book => {
            const lessonIds = book.lessonIds.filter(id => {
                const lesson = summaries.get(id);
                return lesson && [lesson.title, lesson.group ?? "", book.title]
                    .some(text => text.toLowerCase().includes(needle));
            });
            // 真题书没有课，命中查询或没有任何查询时都保留；书名命中同样算命中。
            const matched = book.examIds?.filter(id => {
                const exam = exams.get(id);
                if (!exam) return false;
                return !needle || exam.title.toLowerCase().includes(needle) || book.title.toLowerCase().includes(needle);
            }) ?? [];
            return {
                ...book,
                lessonIds,
                ...(book.examIds ? {examIds: matched} : {}),
            };
        })
        .filter(book => book.lessonIds.length + (book.examIds?.length ?? 0) > 0);
}

/** 同教材里紧挨着的前后两课；请求的页签不可用时退到该课的默认页签。 */
export function adjacentLessons(catalog: Catalog, lessonId: string, view: View): AdjacentLesson[] {
    const book = catalog.books.find(candidate => candidate.lessonIds.includes(lessonId));
    if (!book) return [];
    const summaries = new Map(catalog.lessons.map(lesson => [lesson.id, lesson]));
    const current = book.lessonIds.indexOf(lessonId);
    return book.lessonIds.flatMap((id, index) => {
        if (index !== current - 1 && index !== current + 1) return [];
        const lesson = summaries.get(id);
        if (!lesson) return [];
        return [{
            lesson,
            view: lesson.views.includes(view) ? view : defaultView(lesson.views),
            direction: index < current ? "previous" as const : "next" as const,
        }];
    });
}
