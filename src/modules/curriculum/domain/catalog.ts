import {lessonViews} from "./lesson-modules";
import type {LessonModules} from "./lesson-modules";

/** 页签：由课里的模块推导，顺序固定，最后可选测验。 */
export type View = "kanji" | "words" | "articles" | "dialogues" | "grammar" | "quiz";
const viewOrder: readonly View[] = ["kanji", "words", "articles", "dialogues", "grammar", "quiz"];

export function orderedViews(views: readonly View[]): View[] {
    return viewOrder.filter(view => views.includes(view));
}

/** 有文章先打开文章，否则按模块顺序取第一个。 */
export function defaultView(views: readonly View[]): View {
    return views.includes("articles") ? "articles" : orderedViews(views)[0];
}

export function isView(value: unknown): value is View {
    return typeof value === "string" && viewOrder.some(view => view === value);
}

/** 目录索引条目：编译期从课文件派生，源数据里不写。 */
export interface LessonSummary {
    readonly id: string;
    readonly bookId: string;
    readonly title: string;
    readonly group?: string;
    readonly wordCount: number;
    /** 教材固定题的数量，不含打开测验页时现场生成的单词题。 */
    readonly questionCount: number;
    readonly views: readonly View[];
}

/** 书架上的分级，决定教材显示在哪一栏。 */
export const libraryLevels = ["beginner", "mid-intermediate", "intermediate", "jlpt-grammar"] as const;
export type LibraryLevel = (typeof libraryLevels)[number];

export function isLibraryLevel(value: unknown): value is LibraryLevel {
    return typeof value === "string" && libraryLevels.some(level => level === value);
}

/** 教材。 */
export interface Book {
    /** 类型标记，固定为 "book"。 */
    readonly kind: "book";
    /** id，也是源数据的目录名，比如 "chukyu-o-manabo-chukyu-zenki"。 */
    readonly id: string;
    /** 日语书名，用全称，比如「中級を学ぼう 中級前期」。 */
    readonly title: string;
    /** 书架上的分级。 */
    readonly level: LibraryLevel;
    /** 这本书的课 id，按教材顺序排列。课的内容在各自的文件里。 */
    readonly lessonIds: readonly string[];
}

export interface Catalog {
    readonly schemaVersion: 1;
    readonly siteTitle: string;
    readonly books: readonly Book[];
    /** 目录索引，编译期派生；页签由模块推导，不手写。 */
    readonly lessons: readonly LessonSummary[];
}

/** 由模块推导页签，供解码后的课与目录索引共用。 */
export function viewsOf(modules: LessonModules): View[] {
    return lessonViews(modules) as View[];
}
