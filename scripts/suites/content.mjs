import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "../harness.mjs";

/**
 * 内容与解码（新模型）。
 *
 * 内容用例只读 `fixture.source`（已深冻结），不拷贝——遍历 211 课
 * 不需要副本，也就没有污染的可能。
 */

const textFields = new Set([
    "meaningId", "noteId", "noteIds", "translationId", "analysisId",
    "instructionId", "explanationId", "introductionId",
    "formationId", "usageId", "pitfallId", "textId",
]);

/** 递归收集一课里所有译文引用。 */
function textReferences(lesson) {
    const ids = new Set();
    const walk = (value) => {
        if (Array.isArray(value)) return value.forEach(walk);
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
            if (key === "texts") continue;
            if (textFields.has(key)) {
                const list = typeof child === "string" ? [child] : child;
                for (const id of list) ids.add(id);
            }
            walk(child);
        }
    };
    walk(lesson);
    return [...ids];
}

/** 收集某种 kind 的对象。 */
function objectsOf(lesson, kinds) {
    const found = [];
    const walk = (value) => {
        if (Array.isArray(value)) return value.forEach(walk);
        if (!value || typeof value !== "object") return;
        if (kinds.includes(value.kind)) found.push(value);
        for (const child of Object.values(value)) walk(child);
    };
    walk(lesson.modules);
    return found;
}

const forbiddenKeys = new Set([
    "bodyJa", "paragraphIds", "characters", "wordRefs", "titleJa", "groupJa",
    "wordJa", "readingJa", "acceptedText", "accepted", "views", "units",
]);

/** 只查字段名，不去匹配日语正文里碰巧出现的英文单词。 */
function hasForbiddenKey(value) {
    if (Array.isArray(value)) return value.some(hasForbiddenKey);
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, child]) => forbiddenKeys.has(key) || hasForbiddenKey(child));
}

test("目录与课一一对应，模块结构合法且没有旧字段", ["content:structure"], ({fixture}) => {
    const {units, catalog} = fixture.source;
    assert.equal(catalog.books.length, 11, "教材数量骤减，可能误删");
    assert.equal(units.length, catalog.lessons.length, "课文件与目录条目数不一致");
    assert.equal(new Set(units.map(lesson => lesson.id)).size, units.length, "课 ID 必须唯一");
    assert.deepEqual(
        units.map(lesson => lesson.id).sort(),
        catalog.books.flatMap(book => book.lessonIds).sort(),
        "编译产物必须与目录完全一致，每课恰好出现一次",
    );
    const bookIds = new Set(catalog.books.map(book => book.id));
    const moduleKinds = {
        kanji: "kanji-module", words: "word-module", articles: "article-module",
        dialogues: "dialogue-module", grammar: "grammar-module",
    };
    for (const lesson of units) {
        const book = catalog.books.find(item => lesson.id.startsWith(item.id + "."));
        assert(book, `课没有所属教材：${lesson.id}`);
        assert(bookIds.has(lesson.bookId), `教材 id 不在目录里：${lesson.id}`);
        const keys = Object.keys(lesson.modules);
        assert(keys.length > 0, `课没有任何模块：${lesson.id}`);
        for (const key of keys) {
            assert(moduleKinds[key], `未知模块：${lesson.id} / ${key}`);
            assert.equal(lesson.modules[key].kind, moduleKinds[key], `模块 kind 不对：${lesson.id} / ${key}`);
            assert(lesson.modules[key].items.length > 0, `模块没有条目：${lesson.id} / ${key}`);
        }
        assert(!hasForbiddenKey(lesson), `残留旧字段：${lesson.id}`);
    }
    assert(catalog.books.find(book => book.id === "minna-no-nihongo-shokyu").lessonIds.length >= 50,
        "みんなの日本語 课次数骤减，可能误删");
    const verbs = units.find(lesson => lesson.id === "jlpt-n5-doshi-no-katsuyo.verbs");
    assert(verbs?.modules.grammar?.items.length >= 20, "动词参考资料条目骤减，可能误删");
    assert(fs.existsSync("data/content/units/jlpt-n5-doshi-no-katsuyo/verbs.json"), "参考资料应编译成普通课文件");
});

test("每条译文引用都有中日英，且不留孤儿译文", ["content:texts"], ({fixture}) => {
    const {units} = fixture.source;
    const missing = [];
    let checked = 0;
    for (const lesson of units) {
        const refs = textReferences(lesson);
        for (const id of refs) {
            const text = lesson.texts[id];
            if (!text || typeof text.zh !== "string" || typeof text.en !== "string") {
                missing.push(`${lesson.id} 缺译文 ${id}`);
                continue;
            }
            if (text.zh.trim() && !text.en.trim()) missing.push(`${lesson.id} 的 ${id} 有中文没有英文`);
        }
        const referenced = new Set(refs);
        for (const id of Object.keys(lesson.texts))
            if (!referenced.has(id)) missing.push(`${lesson.id} 有孤儿译文 ${id}`);
        checked += refs.length;
    }
    assert.deepEqual(missing.slice(0, 10), [], `共 ${missing.length} 处译文缺陷`);
    assert(checked >= 10000, "译文引用数量骤降，规则可能失效");
});

test("每道题都有可判定的答案，题干与选项分段合法", ["content:questions"], ({fixture}) => {
    const {units} = fixture.source;
    const problems = [];
    const seen = new Set();
    let checked = 0;
    for (const lesson of units) {
        for (const word of objectsOf(lesson, ["word"])) {
            if (!word.word || !word.reading) problems.push(`词条缺字段：${word.id}`);
            // 恢复旧套件里的「词表读音必须是平假名」；カタカナ课新生成的词也不例外。
            if (/[ァ-ヶヷ-ヺ]/.test(word.reading)) problems.push(`读音含片假名：${word.id}`);
        }
        for (const question of objectsOf(lesson, ["choice", "fill-in"])) {
            checked++;
            if (seen.has(question.id)) problems.push(`题目 ID 重复：${question.id}`);
            seen.add(question.id);
            if (!question.prompt.length) problems.push(`题目没有题干：${question.id}`);
            for (const segment of [...question.prompt, ...(question.options ?? []).flatMap(option => option)])
                if (Boolean(segment.japanese) === Boolean(segment.textId))
                    problems.push(`分段不合法：${question.id}`);
            if (question.kind === "choice") {
                if (question.options.length < 2) problems.push(`选项不足两个：${question.id}`);
                if (!question.correctOptionIndexes.length) problems.push(`没有正确选项：${question.id}`);
                for (const index of question.correctOptionIndexes)
                    if (!Number.isInteger(index) || !question.options[index]) problems.push(`正确选项越界：${question.id}`);
            } else {
                if (!["any-kana", "katakana"].includes(question.requiredScript))
                    problems.push(`requiredScript 不合法：${question.id}`);
                if (!question.acceptedAnswers.length || question.acceptedAnswers.some(text => !text?.trim()))
                    problems.push(`填空题没有答案：${question.id}`);
            }
        }
    }
    assert.deepEqual(problems.slice(0, 10), [], `共 ${problems.length} 处题目缺陷`);
    // 动态词题已改回运行时生成，落盘的只剩教材固定题。
    assert(checked >= 3500, `固定题数量骤减：${checked}`);
});

test("英文译文保留日文原句，专业术语不被改写", ["content:translation"], ({fixture}) => {
    const {learningTexts, units} = fixture.source;
    const changed = [];
    let protectedReferences = 0;

    for (const [id, text] of Object.entries(learningTexts)) {
        const wordExample = id.endsWith(".note") && id.includes(".word.")
            ? /^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々0-9]+)[：:]/u.exec(text.zh)?.[1]
            : undefined;
        if (wordExample && /[ぁ-んァ-ヶ]/u.test(wordExample)) {
            if (!text.en.includes(wordExample)) changed.push(`${id}: ${wordExample}`);
            protectedReferences++;
        }
        // 题意解析与补充说明允许意译：日文用引号提出来，英文可以换说法。
        if (id.endsWith(".meaning") || id.includes(".supplement.") || id.endsWith(".explanation")
            || id.includes(".note.") || text.en.startsWith("Target expression:")) continue;
        for (const [, literal] of text.zh.matchAll(/「([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+)」/gu)) {
            if (!/[ぁ-んァ-ヶ]/u.test(literal) || /[词汉语]|形$/u.test(literal)) continue;
            if (!text.en.includes(literal)) changed.push(`${id}: ${literal}`);
            protectedReferences++;
        }
    }
    assert.deepEqual(changed.slice(0, 10), [], `共 ${changed.length} 处日文原句被译文改写`);
    assert(protectedReferences >= 1500, "受保护的日文引用数量骤降，说明规则失效了");

    const contamination = /Egypt Protests|Oh my God|I don't know what I'm talking about|West Pilo|red gorillas|Great Kandong|\bFrom verb\.|\bhe verb\./i;
    for (const lesson of units)
        for (const text of Object.values(lesson.texts))
            assert(!contamination.test(text.en), `已知的翻译污染回来了：${lesson.id}`);
});

test("汉字按固定字数分课，编号连续且不重不漏", ["content:grouping"], ({fixture}) => {
    const {units, catalog} = fixture.source;
    const specs = [
        {id: "ichinichi-jugofun-no-kanji-renshu", lessons: 18, count: 540, first: 1},
        {id: "kanji-no-kyokasho-chukyu-700", lessons: 10, count: 200, first: 301},
    ];
    const byId = new Map(units.map(lesson => [lesson.id, lesson]));
    for (const spec of specs) {
        const book = catalog.books.find(item => item.id === spec.id);
        assert.equal(book.lessonIds.length, spec.lessons, `${spec.id} 分课数不对`);
        // 教材顺序以 catalog.lessonIds 为准；文件名排序是字典序，不能直接当课序。
        const kanji = book.lessonIds.flatMap(id => byId.get(id).modules.kanji.items);
        assert.equal(kanji.length, spec.count, `${spec.id} 汉字总数不对`);
        const numbers = kanji.map(item => Number(item.id.split(".").at(-1)));
        assert.deepEqual(numbers, Array.from({length: spec.count}, (_, index) => spec.first + index),
            `${spec.id} 汉字编号必须按教材顺序连续`);
        for (const id of book.lessonIds) {
            assert(byId.get(id).modules.kanji.items.length > 0, `汉字课不能为空：${id}`);
            assert.deepEqual(catalog.lessons.find(item => item.id === id).views.slice(0, 1), ["kanji"]);
        }
    }
});

test("课、条目、题目 ID 全局唯一", ["content:unique-ids"], ({fixture}) => {
    const {units} = fixture.source;
    const duplicates = [];
    const ids = new Set();
    for (const lesson of units) {
        const walk = (value) => {
            if (Array.isArray(value)) return value.forEach(walk);
            if (!value || typeof value !== "object") return;
            if (typeof value.id === "string" && value.kind) {
                if (ids.has(value.id)) duplicates.push(value.id);
                ids.add(value.id);
            }
            for (const child of Object.values(value)) walk(child);
        };
        walk(lesson);
    }
    assert.deepEqual(duplicates.slice(0, 10), [], `共 ${duplicates.length} 处 ID 冲突`);
    assert(ids.size >= 10000, "对象 id 数量骤减，可能误删");
});

test("整篇正文等于段落逐句拼接，对话台词不少于两段", ["content:structure"], ({fixture, load}) => {
    const {articleText} = load("src/modules/reading/domain/article.ts");
    const {units} = fixture.source;
    const problems = [];
    let articles = 0, dialogues = 0;
    for (const lesson of units) {
        for (const article of lesson.modules.articles?.items ?? []) {
            articles++;
            const joined = article.paragraphs.flatMap(paragraph => paragraph.sentences)
                .map(sentence => sentence.text).join("");
            if (articleText(article) !== joined) problems.push(`正文与逐句不一致：${article.id}`);
            assert(article.paragraphs.length > 0 && article.paragraphs.every(paragraph => paragraph.sentences.length > 0),
                `文章段落不能为空：${article.id}`);
        }
        for (const dialogue of lesson.modules.dialogues?.items ?? []) {
            dialogues++;
            if (dialogue.lines.length < 2 || dialogue.lines.some(line => !line.sentences.length))
                problems.push(`对话台词不完整：${dialogue.id}`);
        }
    }
    assert.deepEqual(problems, [], `共 ${problems.length} 处正文问题`);
    assert(articles >= 8 && dialogues >= 6, "本文或对话数量骤减，可能误删");
});

test("固定选择题按固定种子重排，答案不再集中在 A", ["assessment:seeded-shuffle"], ({fixture}) => {
    const {units} = fixture.source;
    let choice = 0;
    const positions = new Map();
    const byBook = new Map();
    for (const lesson of units) {
        for (const question of objectsOf(lesson, ["choice"])) {
            choice++;
            assert.equal(Object.keys(question)[0], "kind", `kind 必须是第一个字段：${question.id}`);
            for (const index of question.correctOptionIndexes) {
                assert(Number.isInteger(index) && index >= 0 && index < question.options.length,
                    `正确选项越界：${question.id}`);
                positions.set(index, (positions.get(index) ?? 0) + 1);
            }
            const book = byBook.get(lesson.bookId) ?? {total: 0, first: 0};
            book.total++;
            if (question.correctOptionIndexes.includes(0)) book.first++;
            byBook.set(lesson.bookId, book);
        }
    }
    assert.equal(choice, 1006, "落盘的固定选择题数量应与迁移报告一致");
    assert([...positions.values()].every(count => count > choice * 0.15),
        `答案下标必须分散到各个位置：${JSON.stringify([...positions])}`);
    for (const [book, counts] of byBook)
        assert(counts.first < counts.total * 0.5, `${book} 的正确答案仍集中在 A`);
});

test("固定题分散挂在对应条目下，中級与 TRY 不再挂本文或会话", ["content:question-owner"], ({fixture}) => {
    const {units} = fixture.source;
    let withGrammar = 0, onFirstOnly = 0;
    for (const lesson of units) {
        const questions = objectsOf(lesson, ["choice", "fill-in"]);
        if (!questions.length) continue;
        const owners = [...new Set(questions.map(question =>
            question.id.slice(0, question.id.indexOf(".question."))))];
        const grammars = objectsOf(lesson, ["grammar"]);
        if (grammars.length > 1 && questions.length > 1) {
            withGrammar++;
            if (owners.length === 1 && owners[0] === grammars[0].id) onFirstOnly++;
        }
        if (["chukyu-o-manabo-chukyu-zenki", "try-nihongo-noryoku-shiken-n2"].includes(lesson.bookId))
            assert(owners.every(id => !id.includes(".article.") && !id.includes(".dialogue.")),
                `题目挂到了本文或会话：${lesson.id}`);
    }
    assert(withGrammar >= 80, "覆盖的文法课太少");
    assert(onFirstOnly < withGrammar * 0.05,
        `仍有 ${onFirstOnly}/${withGrammar} 课把全部题目挂在第一条文法下`);
});

test("文法例句里的 A/B 对话拆成结构化台词", ["content:example-dialogues"], ({fixture}) => {
    let dialogues = 0;
    for (const lesson of fixture.source.units) {
        for (const grammar of objectsOf(lesson, ["grammar"])) {
            for (const example of grammar.examples) {
                if (example.kind !== "dialogue") continue;
                dialogues++;
                assert(example.lines.length >= 2, `对话至少两段台词：${example.id}`);
                assert(new Set(example.lines.map(line => line.role)).size > 1,
                    `角色必须轮换：${example.id}`);
                for (const line of example.lines) {
                    assert(line.role && line.sentences.length > 0, `台词缺字段：${example.id}`);
                    assert(line.sentences.every(sentence => !/^[A-C][：:]/.test(sentence.text)),
                        `句子里还留着角色标签：${example.id}`);
                    if (line.translationId)
                        assert(lesson.texts[line.translationId], `台词译文缺失：${line.translationId}`);
                }
            }
        }
    }
    assert(dialogues >= 67, `拆出的文法例句对话太少：${dialogues}`);
});
