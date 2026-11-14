import fs from "node:fs";
import path from "node:path";
import {compileExams} from "./exam-compiler.mjs";

/** 读一个内容 JSON；坏了要报出是哪个文件，否则 200 多个文件里无从找起。 */
const read = (p) => {
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (error) {
        throw new Error(`读取内容文件失败：${p}（${error.message}）`, {cause: error});
    }
};
const fail = (message) => { throw new Error("内容编译失败：" + message); };
const check = (condition, message) => { if (!condition) fail(message); };

const sourceRoot = "data/content";
const lessonRoot = path.join(sourceRoot, "units");

export const libraryLevelIds = ["beginner", "mid-intermediate", "intermediate", "jlpt-grammar", "jlpt-shiken"];
/** 模块顺序，也就是页签顺序（docs/content-model.md 6.1）。 */
export const moduleOrder = ["articles", "dialogues", "grammar", "words", "kanji"];
export const moduleKinds = {
    kanji: "kanji-module",
    words: "word-module",
    articles: "article-module",
    dialogues: "dialogue-module",
    grammar: "grammar-module",
};

/** 存放译文 id 的字段（bookId / id / wordId 不是译文）。 */
const textFields = new Set([
    "meaningId", "noteIds", "translationId", "analysisId",
    "instructionId", "explanationId", "introductionId",
    "formationId", "usageId", "pitfallId", "textId",
    "differenceId", "glossId",
]);

function courseFiles(directory) {
    return fs.readdirSync(directory, {withFileTypes: true})
        .flatMap((entry) => entry.isDirectory()
            ? courseFiles(path.join(directory, entry.name))
            : entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : [])
        .sort();
}

/** 收集一棵对象树引用的全部译文 id，并校验每个引用都能在 learning.json 里找到。 */
function collectTextIds(value, learning, refs, owner, pathSoFar = "") {
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectTextIds(item, learning, refs, owner, `${pathSoFar}[${index}]`));
        return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
        if (textFields.has(key)) {
            const ids = typeof child === "string" ? [child] : child;
            check(Array.isArray(ids) || typeof child === "string", `${owner} 的 ${pathSoFar}.${key} 不是译文 id`);
            for (const id of ids) {
                check(typeof id === "string", `${owner} 的 ${pathSoFar}.${key} 不是字符串`);
                check(Object.hasOwn(learning, id), `${owner} 引用了不存在的译文：${id}`);
                refs.add(id);
            }
        }
        collectTextIds(child, learning, refs, owner, `${pathSoFar}.${key}`);
    }
}

/** 按数组顺序统计题目与单词，不重排。 */
function countKinds(value, counts) {
    if (Array.isArray(value)) return value.forEach(item => countKinds(item, counts));
    if (!value || typeof value !== "object") return;
    if (value.kind === "word") counts.words++;
    if (value.kind === "choice" || value.kind === "fill-in") counts.questions++;
    for (const child of Object.values(value)) countKinds(child, counts);
}

export function lessonCounts(lesson) {
    const counts = {words: 0, questions: 0};
    countKinds(lesson.modules, counts);
    return counts;
}

/** 页签由模块推导：有哪个模块就显示哪个，有固定题或现场词题时最后加「测验」。 */
export function lessonViews(lesson) {
    const views = moduleOrder.filter(key => lesson.modules[key] !== undefined);
    return lessonCounts(lesson).questions || lesson.wordQuiz ? [...views, "quiz"] : views;
}

function compileLesson(file, learning) {
    const source = read(file);
    const bookId = path.relative(lessonRoot, file).split(path.sep)[0];
    const number = path.basename(file, ".json");
    check(source.kind === "lesson", "源数据不是课：" + file);
    check(source.bookId === bookId, `课必须在所属教材目录里：${file}（bookId=${source.bookId}）`);
    check(source.id === bookId + "." + number, `课 id 与文件名不一致：${file}`);
    check(typeof source.title === "string", "课缺少标题：" + file);
    check(source.modules && typeof source.modules === "object", "课缺少模块：" + file);
    const present = moduleOrder.filter(key => source.modules[key] !== undefined);
    check(present.length > 0, "课没有任何模块：" + file);
    for (const key of present) {
        const module = source.modules[key];
        check(module.kind === moduleKinds[key], `${source.id} 的 ${key} 模块类型不对`);
        check(Array.isArray(module.items) && module.items.length > 0, `${source.id} 的 ${key} 模块没有条目`);
    }
    const refs = new Set();
    collectTextIds(source, learning, refs, source.id);
    const texts = Object.fromEntries([...refs].map(id => [id, learning[id]]));
    return {...source, texts};
}

/**
 * 编译全部课：源数据已经按 docs/design.md 4.2 分好课，编译只负责补上这一课用到的译文，
 * 不再展开共享词表、不再在运行时给汉字分组。
 */
export function compileLessons() {
    const learning = read(path.join(sourceRoot, "localization/learning.json"));
    const lessons = courseFiles(lessonRoot).map(file => compileLesson(file, learning));
    const ids = new Set();
    for (const lesson of lessons) {
        check(!ids.has(lesson.id), "课 id 重复：" + lesson.id);
        ids.add(lesson.id);
    }
    return lessons;
}

/** 目录索引条目：编译期从课文件派生，页签、词数、题数都不手写。 */
function lessonSummary(lesson, group) {
    const counts = lessonCounts(lesson);
    return {
        id: lesson.id,
        bookId: lesson.bookId,
        title: lesson.title,
        ...(group !== undefined ? {group} : {}),
        wordCount: counts.words,
        questionCount: counts.questions,
        views: lessonViews(lesson),
    };
}

/** 由教材目录 + 课文件生成运行时目录。 */
export function buildCatalog(lessons = compileLessons(), exams = compileExams()) {
    const source = read(path.join(sourceRoot, "catalog.json"));
    check(source.schemaVersion === 1, "catalog.json 版本不对");
    check(typeof source.siteTitle === "string", "catalog.json 缺少 siteTitle");
    check(Array.isArray(source.books), "catalog.json 缺少 books");
    const byId = new Map(lessons.map(lesson => [lesson.id, lesson]));
    const examById = new Map(exams.map(exam => [exam.id, exam]));
    const groups = source.lessonGroups ?? {};
    const lessonIds = [];
    const examIds = [];
    const books = source.books.map(book => {
        check(book.kind === "book", "教材缺少 kind：" + book.id);
        check(libraryLevelIds.includes(book.shelfLevel), "未知教材等级：" + book.id);
        // 教材书有课，真题书有考试，两者至少一个。
        const bookLessons = book.lessonIds ?? [];
        const bookExams = book.examIds ?? [];
        check(bookLessons.length + bookExams.length > 0, "教材没有内容：" + book.id);
        for (const id of bookLessons) {
            const lesson = byId.get(id);
            check(lesson, "目录里的课不存在：" + id);
            check(lesson.bookId === book.id, `课 ${id} 不在教材 ${book.id} 里`);
            check(!lessonIds.includes(id), "目录里重复登记课：" + id);
            lessonIds.push(id);
        }
        for (const id of bookExams) {
            const exam = examById.get(id);
            check(exam, "目录里的真题不存在：" + id);
            check(exam.bookId === book.id, `真题 ${id} 不在教材 ${book.id} 里`);
            check(!examIds.includes(id), "目录里重复登记真题：" + id);
            examIds.push(id);
        }
        return {
            kind: "book", id: book.id, title: book.title, shelfLevel: book.shelfLevel,
            lessonIds: [...bookLessons],
            ...(bookExams.length ? {examIds: [...bookExams]} : {}),
        };
    });
    check(lessonIds.length === lessons.length, "有课没被登记进 catalog.json");
    check(examIds.length === exams.length, "有真题没被登记进 catalog.json");
    const summaries = lessonIds.map(id => lessonSummary(byId.get(id), groups[id]));
    const examSummaries = examIds.map(id => {
        const exam = examById.get(id);
        return {id: exam.id, bookId: exam.bookId, title: exam.title, examLevel: exam.examLevel,
            questionCount: exam.questionCount};
    });
    return {schemaVersion: 1, siteTitle: source.siteTitle, books, lessons: summaries, exams: examSummaries};
}
