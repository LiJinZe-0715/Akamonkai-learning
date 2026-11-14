import type {TranslationCatalog} from "../../../shared/kernel/text-types";
import type {LessonModules} from "../domain/lesson-modules";
import type {Book, Catalog, LessonSummary, View} from "../domain/catalog";
import type {AdjacentLesson, CatalogLesson} from "../domain/catalog-queries";

/**
 * 课：教材里的一课；汉字书里是固定字数的一组字。
 * 每课单独编译成一个文件，学习进度按课记。
 */
export interface Lesson {
    /** 类型标记，固定为 "lesson"。 */
    readonly kind: "lesson";
    /** id，也是页面地址和产物文件名，比如 "try-nihongo-noryoku-shiken-n2.5-1"。 */
    readonly id: string;
    /** 所属教材的 id，必须和课文件所在的目录名一致。 */
    readonly bookId: string;
    /** 日语标题，比如「第1課」「1~30」「Topic 3 読解：地震」。 */
    readonly title: string;
    /** 这一课有的模块。 */
    readonly modules: LessonModules;
    /** 这一课用到的全部译文，由编译器从 learning.json 里收集，源数据里不写。 */
    readonly texts: TranslationCatalog;
    /**
     * 这一课的测验页要不要现场生成单词题（旧版 word-test 视图）。
     * 单词题不落盘：选项与干扰项每次生成时打乱，「不打乱」只约束教材固定题。
     */
    readonly wordQuiz?: boolean;
}

export interface LessonSelection {
    book: Book;
    lesson: LessonSummary;
    view: View;
}

export interface CurriculumQueries {
    catalog(): Promise<Catalog>;

    lesson(id: string): Promise<Lesson>;

    /** 把 URL 上的课 id 与页签解析成一次选课；课不存在时抛 UnavailableLessonError。 */
    select(catalog: Catalog, lessonId: string | null, view: string | null): LessonSelection | null;
}

export interface CurriculumDiscovery {
    lessons(catalog: Catalog): CatalogLesson[];

    search(catalog: Catalog, level: string, query: string): Book[];

    adjacent(catalog: Catalog, lessonId: string, view: View): AdjacentLesson[];
}
