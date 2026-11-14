import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "../harness.mjs";

/**
 * 内容与解码（新模型）。
 *
 * 内容用例只读 `fixture.source`（已深冻结），不拷贝——遍历全部教材课
 * 不需要副本，也就没有污染的可能。
 */

const textFields = new Set([
    "meaningId", "noteIds", "translationId", "analysisId",
    "instructionId", "explanationId", "introductionId",
    "formationId", "usageId", "pitfallId", "textId",
    "differenceId", "glossId",
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
    assert(catalog.books.length >= 13, "教材数量骤减，可能误删");
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
            for (const segment of [...question.prompt, ...(question.options ?? []).flatMap(option => option)]) {
                if (Boolean(segment.japanese) === Boolean(segment.textId))
                    problems.push(`分段不合法：${question.id}`);
            }
            if (question.kind === "choice") {
                if (question.options.length < 2) problems.push(`选项不足两个：${question.id}`);
                if (!question.answer.length) problems.push(`没有正确选项：${question.id}`);
                for (const index of question.answer)
                    if (!Number.isInteger(index) || !question.options[index]) problems.push(`正确选项越界：${question.id}`);
            } else {
                if (!["any-kana", "katakana"].includes(question.requiredScript))
                    problems.push(`requiredScript 不合法：${question.id}`);
                if (!question.answer.length || question.answer.some(text => !text?.trim()))
                    problems.push(`填空题没有答案：${question.id}`);
            }
        }
    }
    assert.deepEqual(problems.slice(0, 10), [], `共 ${problems.length} 处题目缺陷`);
    // 动态词题已改回运行时生成，落盘的只剩教材固定题。
    assert(checked >= 3500, `固定题数量骤减：${checked}`);
});

test("词的解析自洽：词性、自他、基本形、骨架、辨析", ["content:word-analysis"], ({fixture}) => {
    const {units, learningTexts} = fixture.source;
    const partsOfSpeech = new Set([
        "noun", "verbal-noun", "verb", "i-adjective", "na-adjective", "adverb",
        "conjunction", "adnominal", "interjection", "prefix", "suffix", "counter",
        "expression", "other",
    ]);
    const transitivityValues = new Set(["intransitive", "transitive", "both"]);
    const verbParts = new Set(["verb", "verbal-noun"]);
    const badPatternOwners = new Set(["prefix", "suffix", "counter"]);
    const problems = [];
    let annotated = 0;
    let patternCount = 0;
    let contrastCount = 0;

    for (const lesson of units) {
        const words = objectsOf(lesson, ["word"]);
        const ownMeaningIds = new Set(words.map(word => word.meaningId));
        for (const word of words) {
            if (word.pos !== undefined) {
                annotated++;
                if (!partsOfSpeech.has(word.pos)) problems.push(`词性不在枚举里：${word.id} / ${word.pos}`);
            }
            if (word.transitivity !== undefined) {
                if (!transitivityValues.has(word.transitivity)) problems.push(`自他取值不合法：${word.id}`);
                if (!verbParts.has(word.pos)) problems.push(`非动词却标了自他：${word.id}`);
            }
            if (word.lemma !== undefined) {
                if (!word.lemma.trim() || /[～\s（）()。]/.test(word.lemma)) problems.push(`基本形写法不合法：${word.id}`);
                if (word.lemma === word.word) problems.push(`基本形与本词相同，应该省略：${word.id}`);
            }
            for (const pattern of word.patterns ?? []) {
                patternCount++;
                if (pattern.pattern.split("<w>").length !== 2) problems.push(`骨架必须正好一个 <w>：${word.id}`);
                if (!Object.hasOwn(learningTexts, pattern.usageId)) problems.push(`骨架说明没有译文：${word.id}`);
            }
            for (const contrast of word.contrasts ?? []) {
                contrastCount++;
                if (contrast.word === word.word) problems.push(`辨析对象是本词：${word.id}`);
                if (!Object.hasOwn(learningTexts, contrast.glossId)) problems.push(`辨析词义没有译文：${word.id}`);
                // 指向 .meaning 时必须真的是本课某个词条的词义：跨课引用取不到译文。
                if (contrast.glossId.endsWith(".meaning") && !ownMeaningIds.has(contrast.glossId))
                    problems.push(`辨析词义跨课引用：${word.id} / ${contrast.glossId}`);
            }
            // 这三类词没有「搭配助词」可言，写了骨架一定是错的。
            if ((word.patterns ?? []).length) {
                if (/[～~]/.test(word.word)) problems.push(`带波浪号的构词成分不该有骨架：${word.id}`);
                if (badPatternOwners.has(word.pos)) problems.push(`缀词不该有骨架：${word.id}`);
                if (word.pos === "expression" && word.word.endsWith("。")) problems.push(`定型寒暄句不该有骨架：${word.id}`);
            }
        }
    }
    assert.deepEqual(problems.slice(0, 10), [], `共 ${problems.length} 处解析字段缺陷`);
    // 反向：learning.json 里的解析译文必须真被某个词条引用，否则是漏挂字段（合并脚本曾静默丢掉 analysisId）。
    const referenced = new Set();
    for (const lesson of units) for (const word of objectsOf(lesson, ["word"])) {
        for (const pattern of word.patterns ?? []) referenced.add(pattern.usageId);
        for (const contrast of word.contrasts ?? []) {
            referenced.add(contrast.glossId);
            referenced.add(contrast.differenceId);
        }
        if (word.analysisId !== undefined) referenced.add(word.analysisId);
    }
    const orphans = Object.keys(learningTexts)
        .filter(id => /\.word\.\d+\.(pattern\.\d+\.usage|contrast\.\d+\.gloss|contrast\.\d+\.difference|analysis)$/.test(id))
        .filter(id => !referenced.has(id));
    assert.deepEqual(orphans.slice(0, 10), [], `共 ${orphans.length} 条解析译文没有词条引用`);
    // 首批两本书已填完（579 词）；数字只作「别把内容删回去」的下限。
    assert(annotated >= 579, `解析覆盖骤减：${annotated}`);
    assert(patternCount >= 145 && contrastCount >= 270, "骨架或辨析数量骤减");
});

test("英文译文保留日文原句，专业术语不被改写", ["content:translation"], ({fixture}) => {
    const {learningTexts, units} = fixture.source;
    const changed = [];
    let protectedReferences = 0;

    for (const [id, text] of Object.entries(learningTexts)) {
        // 按所属字段判断，不按 id 形状判断：单词的补充说明升级成 `.note.<序号>` 后仍要受保护。
        const isWordNote = /\.word\.\d+\.note(?:\.\d+)?$/.test(id);
        const isGrammarNote = /\.grammar\.\d+\.note\.\d+$/.test(id);
        const wordExample = isWordNote
            ? /^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々0-9]+)[：:]/u.exec(text.zh)?.[1]
            : undefined;
        if (wordExample && /[ぁ-んァ-ヶ]/u.test(wordExample)) {
            if (!text.en.includes(wordExample)) changed.push(`${id}: ${wordExample}`);
            protectedReferences++;
        }
        // 题意解析、释义与文法补充说明允许意译：日文用引号提出来，英文可以换说法。
        if (id.endsWith(".meaning") || id.includes(".supplement.") || id.endsWith(".explanation")
            || isGrammarNote || text.en.startsWith("Target expression:")) continue;
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
    // 生中継按书页重构：每课 4 篇独立对话 + 每条【重要表現】录音各 1 篇，各配 1 篇镜像本文。
    // L5/L8 各有 3 条重要表現轨，其余 8 课 2 条，合计 10 课 62 篇。
    // 镜像正文可逆、角色与分组边界不丢、不带译文；所有台词都还在。
    let shadowArticles = 0, shadowLines = 0, shadowGroups = 0;
    for (const lesson of units) {
        if (lesson.bookId !== "nihongo-namachukei") continue;
        const shadows = lesson.modules.articles?.items ?? [];
        const scripts = lesson.modules.dialogues?.items ?? [];
        const groupedCount = scripts.length - 4;
        assert(groupedCount === 2 || groupedCount === 3,
            `生中継每课应有 4 + 2/3 篇会话：${lesson.id}`);
        assert.equal(shadows.length, scripts.length, `生中継每课本文篇数与会话不符：${lesson.id}`);
        assert.deepEqual(shadows.map(article => article.title), scripts.map(dialogue => dialogue.title),
            `本文与会话标题不对应：${lesson.id}`);
        assert.deepEqual(scripts.slice(0, 4).map(dialogue => dialogue.title),
            ["聞き取り練習 ①", "聞き取り練習 ②", "聞き取り練習 ③", "聞き取り練習 ④"],
            `独立对话标题与书页不符：${lesson.id}`);
        assert.deepEqual(scripts.slice(4).map(dialogue => dialogue.title),
            ["重要表現 ①", "重要表現 ②", "重要表現 ③"].slice(0, groupedCount),
            `重要表現各篇标题与录音轨不对应：${lesson.id}`);
        assert(scripts.slice(0, 4).every(dialogue => dialogue.lines.every(line =>
            line.section === undefined && line.group === undefined)),
        `独立对话不该带分组标记：${lesson.id}`);
        // 拆开后每篇正好一条录音轨：1 个 ■ 小标题写在首条台词，篇内 ①②③④ 各自隔开。
        const sectionTitles = [];
        scripts.slice(4).forEach(dialogue => {
            const sections = dialogue.lines.filter(line => line.section !== undefined).map(line => line.section);
            const groups = dialogue.lines.filter(line => line.group !== undefined).map(line => line.group);
            assert.equal(sections.length, 1, `每个重要表現篇应只有 1 个 ■ 小标题：${dialogue.id}`);
            assert.equal(dialogue.lines[0].section, sections[0], `■ 小标题应写在篇首：${dialogue.id}`);
            assert(groups.length >= 2 && new Set(groups).size === groups.length,
                `①②③④ 组号缺失或重复：${dialogue.id}`);
            sectionTitles.push(sections[0]);
            shadowGroups += groups.length;
        });
        assert.equal(new Set(sectionTitles).size, groupedCount, `■ 小标题重复：${lesson.id}`);
        shadows.forEach((article, index) => {
            shadowArticles++;
            shadowLines += scripts[index].lines.length;
            const source = scripts[index].lines.flatMap(line => line.sentences)
                .map(sentence => sentence.text).join("");
            const rebuilt = article.paragraphs.flatMap(paragraph => paragraph.sentences)
                .map(sentence => sentence.text).join("");
            assert.equal(rebuilt, source, `跟读文章正文与原对话不一致：${article.id}`);
            // 角色游程：同角色连续台词合段，但遇到分组起始标记必须另起一段。
            const runs = [];
            for (const line of scripts[index].lines)
                if (!runs.length || line.section !== undefined || line.group !== undefined
                    || runs.at(-1).role !== line.role)
                    runs.push({role: line.role, section: line.section, group: line.group});
            assert.deepEqual(article.paragraphs.map(paragraph => ({
                role: paragraph.role, section: paragraph.section, group: paragraph.group,
            })), runs, `角色分段或分组边界与台词不一致：${article.id}`);
            assert(article.paragraphs.every(paragraph => paragraph.role && paragraph.sentences.length > 0),
                `空段落或缺角色：${article.id}`);
            assert(article.paragraphs.every(paragraph => paragraph.sentences.every(sentence =>
                sentence.translationId === undefined && sentence.analysisId === undefined)),
            `跟读文章不该带译文或拆解：${article.id}`);
        });
    }
    assert.equal(shadowArticles, 62, "生中継跟读文章应为 8 课 × 6 + L5/L8 × 7 = 62 篇");
    assert(shadowLines >= 838, "生中継台词数量骤减，可能误删");
    assert(shadowGroups >= 82, "生中継分组数量骤减，重要表現可能被拆散或漏篇");
});

test("中级前期 8 课的本文录音引用与媒体文件一一对应", ["content:structure"], ({fixture}) => {
    const book = "chukyu-o-manabo-chukyu-zenki";
    const lessons = fixture.source.units.filter(unit => unit.bookId === book);
    assert.equal(lessons.length, 8, "中级前期应有 8 课");
    const seen = new Set();
    for (const lesson of lessons) {
        const articles = lesson.modules.articles?.items ?? [];
        assert.equal(articles.length, 1, `本文应只有一篇：${lesson.id}`);
        assert.equal(articles[0].paragraphs.length, 1, `录音挂在整篇一整段的文章上：${lesson.id}`);
        const audio = `media/manabo/${lesson.id}.mp3`;
        assert.equal(articles[0].audio, audio, `录音路径与课 id 不符：${lesson.id}`);
        assert(!seen.has(audio), `两课共用了同一条录音：${audio}`);
        seen.add(audio);
        assert(fs.existsSync(path.join("public", audio)), `录音文件不存在：${audio}`);
    }
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
            for (const index of question.answer) {
                assert(Number.isInteger(index) && index >= 0 && index < question.options.length,
                    `正确选项越界：${question.id}`);
                positions.set(index, (positions.get(index) ?? 0) + 1);
            }
            const book = byBook.get(lesson.bookId) ?? {total: 0, first: 0};
            book.total++;
            if (question.answer.includes(0)) book.first++;
            byBook.set(lesson.bookId, book);
        }
    }
    assert(choice >= 1006, "落盘的固定选择题数量少于迁移报告，可能误删");
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

