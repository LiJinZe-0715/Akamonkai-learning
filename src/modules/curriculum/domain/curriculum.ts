import {type Book, defaultView, isView, type Catalog, type LessonSummary, type View} from "./catalog";

/** 唯一可恢复的路由错误：URL 指向的课不存在。 */
export class UnavailableLessonError extends Error {
    constructor() {
        super("Unavailable lesson");
        this.name = "UnavailableLessonError";
    }
}

/** 聚合策略：只能选中目录里的课及其已开放的页签。 */
export class Curriculum {
    constructor(private readonly catalog: Catalog) {
    }

    select(lessonId: string, view: string | null): {book: Book; lesson: LessonSummary; view: View} {
        const book = this.catalog.books.find(candidate => candidate.lessonIds.includes(lessonId));
        const lesson = book && this.catalog.lessons.find(candidate => candidate.id === lessonId);
        // 不带页签参数时打开默认模式；其他模式都在一次点击之内。
        const target = view ?? (lesson ? defaultView(lesson.views) : null);
        if (!book || !lesson || !isView(target) || !lesson.views.includes(target))
            throw new UnavailableLessonError();
        return {book, lesson, view: target};
    }
}
