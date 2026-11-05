import {buildCatalog, compileLessons} from "./content-compiler.mjs";

/**
 * 全文检索索引（构建期生成，运行时按需加载）。
 *
 * 索引只存「能让人认出这一条」的字段：日文原文、中文释义、所属课。
 * 课另存一份，条目用下标引用它，避免每条重复教材名与课次名。
 *
 * 为什么放在构建期：内容有几 MB、两百多个课文件，运行时不可能全量加载；
 * 索引单文件只在打开搜索页时请求一次。
 */

/** 条目类型：文法条目、例句、本文句子、单词、汉字、会话台词。 */
export const searchKinds = ["grammar", "example", "passage", "word", "kanji", "dialogue"];

const textOf = (texts, id) => (id && texts?.[id]?.zh) || "";

/** 同一句例句会在多课重复出现，索引里只留一条，结果不重复。 */
const identity = (kind, ja, zh) => kind + "\u0000" + ja + "\u0000" + zh;

const childrenOf = (items) => items.flatMap(item => [item, ...childrenOf(item.children ?? [])]);

export function buildSearchIndex(lessons = compileLessons(), catalog = buildCatalog(lessons)) {
    const searchUnits = [];
    const unitIndex = new Map();
    const entries = [];
    const seen = new Set();
    const bookTitle = new Map(catalog.books.map(book => [book.id, book.title]));

    // 先把目录里的课全部登记进来，顺序即教材顺序：结果同分时按上课顺序排，
    // 也让「某个课次没有任何可检索内容」这件事在索引里看得见。
    for (const lesson of catalog.lessons) {
        unitIndex.set(lesson.id, searchUnits.length);
        searchUnits.push([
            lesson.id, lesson.bookId, bookTitle.get(lesson.bookId) ?? "",
            lesson.title, lesson.group ?? "", lesson.views,
        ]);
    }

    const add = (lesson, kind, ja, zh) => {
        const text = String(ja ?? "").trim();
        if (!text) return;
        const key = identity(kind, text, zh);
        if (seen.has(key)) return;
        seen.add(key);
        const index = unitIndex.get(lesson.id);
        if (index === undefined) return;
        entries.push([index, kind, text, zh]);
    };
    const addSentence = (lesson, kind, sentence) =>
        add(lesson, kind, sentence.text, textOf(lesson.texts, sentence.translationId));
    const addDialogue = (lesson, dialogue) => {
        for (const line of dialogue.lines)
            for (const sentence of line.sentences)
                add(lesson, "dialogue", sentence.text, textOf(lesson.texts, line.translationId));
    };

    for (const lesson of lessons) {
        const modules = lesson.modules;
        for (const kanji of modules.kanji?.items ?? []) {
            add(lesson, "kanji", kanji.character, textOf(lesson.texts, kanji.meaningId));
            for (const word of kanji.words)
                add(lesson, "word", word.word + "（" + word.reading + "）", textOf(lesson.texts, word.meaningId));
            for (const sentence of kanji.examples) addSentence(lesson, "example", sentence);
        }
        for (const word of modules.words?.items ?? [])
            add(lesson, "word", word.word + "（" + word.reading + "）", textOf(lesson.texts, word.meaningId));
        for (const article of modules.articles?.items ?? []) {
            add(lesson, "passage", article.title, textOf(lesson.texts, article.introductionId));
            for (const paragraph of article.paragraphs)
                for (const sentence of paragraph.sentences) addSentence(lesson, "passage", sentence);
        }
        for (const dialogue of modules.dialogues?.items ?? []) addDialogue(lesson, dialogue);
        for (const grammar of childrenOf(modules.grammar?.items ?? [])) {
            add(lesson, "grammar", grammar.title, textOf(lesson.texts, grammar.meaningId));
            for (const example of grammar.examples) {
                if (example.kind === "dialogue") addDialogue(lesson, example);
                else addSentence(lesson, "example", example);
            }
        }
    }

    return {schemaVersion: 1, units: searchUnits, entries};
}
