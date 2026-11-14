import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {test} from "../harness.mjs";

const countOf = (html, className) => (html.match(new RegExp(`class="${className}"`, "g")) || []).length;

/**
 * 汉字教材（新模型）。
 *
 * 两本汉字书各按固定字数分课，课文件里就是 Kanji 条目；
 * 不再有单字文件、运行时分组，也不再有独立的 kanji-*.json。
 */

const BOOKS = [
    {id: "ichinichi-jugofun-no-kanji-renshu", lessons: 18, count: 540, first: 1},
    {id: "kanji-no-kyokasho-chukyu-700", lessons: 10, count: 200, first: 301},
];
const kanjiLessons = lessons => lessons
    .filter(lesson => BOOKS.some(book => lesson.bookId === book.id))
    // 文件名排序是字典序（1, 10, 11 … 2），教材顺序要看课号。
    .sort((left, right) => Number(left.id.split(".").at(-1)) - Number(right.id.split(".").at(-1)));
const allKanji = lessons => kanjiLessons(lessons).flatMap(lesson => lesson.modules.kanji.items);

test("两本汉字教材分课独立，编号连续且不串数据", ["kanji:textbook-isolation"], ({fixture}) => {
    const lessons = fixture.source.units;
    const catalog = fixture.source.catalog;
    assert(!fs.existsSync("data/content/kanji-daily.json") && !fs.existsSync("data/content/kanji-700.json"),
        "旧的单字源文件必须已经删除");
    for (const book of BOOKS) {
        const ids = catalog.books.find(item => item.id === book.id).lessonIds;
        assert.equal(ids.length, book.lessons, `${book.id} 分课数不对`);
        assert(fs.existsSync(`data/content/units/${book.id}`), `${book.id} 源目录必须等于教材 id`);
        const kanji = allKanji(lessons.filter(lesson => lesson.bookId === book.id));
        assert.equal(kanji.length, book.count, `${book.id} 汉字总数不对`);
        assert.deepEqual(kanji.map(item => Number(item.id.split(".").at(-1))),
            Array.from({length: book.count}, (_, index) => book.first + index), `${book.id} 编号必须连续`);
        assert(kanji.every(item => item.id.startsWith(book.id + ".")), `${book.id} 混入了别的教材的汉字`);
    }
    // 中級を学ぼう 的漢字練習并入各自课的汉字模块，不算这两本书。
    assert(allKanji(lessons).length >= 740, "两本汉字书合计字数骤减");
});

test("汉字详情：画数、音训读、例词与例句都挂在同一个字下", ["kanji:character-detail"], ({load, fixture}) => {
    const {normalizeAnswer} = load("src/modules/assessment/domain/question.ts");
    for (const kanji of allKanji(fixture.source.units)) {
        assert(/^\p{Script=Han}$/u.test(kanji.character), `character 必须是单个汉字：${kanji.id}`);
        if (kanji.strokeCount !== undefined)
            assert(Number.isInteger(kanji.strokeCount) && kanji.strokeCount > 0, `画数不合法：${kanji.id}`);
        for (const field of ["onReadings", "kunReadings"]) {
            assert(Array.isArray(kanji[field]), `${field} 必须是数组：${kanji.id}`);
            for (const reading of kanji[field])
                assert(/^[\p{Script=Hiragana}\p{Script=Katakana}ー.]+$/u.test(reading),
                    `${field} 只能是假名与送假名点：${kanji.id} / ${reading}`);
        }
        for (const reading of kanji.kunReadings)
            assert(/^[\p{Script=Hiragana}ー.]+$/u.test(reading), `训读用平假名：${kanji.id} / ${reading}`);
        assert(kanji.words.length > 0 && kanji.words.every(word => word.id.startsWith(kanji.id + ".word.")),
            `例词必须属于本字：${kanji.id}`);
        for (const word of kanji.words) {
            assert(word.word.includes(kanji.character) || word.reading.includes(kanji.character),
                `例词与本字无关：${word.id}`);
            const question = word.questions.find(item => item.kind === "fill-in");
            assert(question, `例词要有读音题：${word.id}`);
            assert(question.answer.some(answer => normalizeAnswer(answer) === normalizeAnswer(word.reading)),
                `读音题答案与例词读音不一致：${word.id}`);
        }
        for (const sentence of kanji.examples) {
            assert.equal(sentence.kind, "sentence", `例句类型不对：${kanji.id}`);
            assert(!/^(?:画数|音読み|訓読み)[：:]/.test(sentence.text),
                `结构化前的读音串还留在例句里：${kanji.id} / ${sentence.text}`);
        }
        for (const special of kanji.specialReadings)
            assert(special.word && special.reading, `特别读音缺字段：${kanji.id}`);
    }
});

test("同形异读的读音题带上下文，不泄露振假名", ["kanji:reading-test"], context => {
    let ambiguous = 0, contextual = 0;
    for (const kanji of allKanji(context.fixture.source.units)) {
        for (const word of kanji.words.filter(item =>
            kanji.words.some(other => other.word === item.word && other.reading !== item.reading))) {
            ambiguous++;
            const question = word.questions.find(item => item.kind === "fill-in");
            assert(question, `同形异读例词必须有读音题：${word.id}`);
            const prompt = question.prompt.filter(segment => segment.japanese).map(segment => segment.japanese).join("");
            if (prompt.includes(`「${word.word}」`)) contextual++;
            assert(!prompt.includes("["), `读音题不能直接显示振假名：${word.id}`);
        }
    }
    assert(ambiguous >= 10 && contextual >= 10, "同形异读用例消失了，规则可能已经失效");
});

test("汉字课按模块渲染，题目覆盖读音与词义", ["content:grouping", "unit:kanji-group"], async context => {
    const {load, fixture} = context;
    const {CurriculumService} = load("src/modules/curriculum/application/curriculum-service.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const {KanjiScreen} = load("src/modules/curriculum/presentation/pages/KanjiScreen.tsx");
    const {lessonQuestions} = load("src/modules/curriculum/domain/lesson-modules.ts");
    const {createStudyServices} = load("src/bootstrap/create-study-services.ts");
    const require = createRequire(import.meta.url);
    const {renderToStaticMarkup} = require("react-dom/server");
    const React = require("react");
    const {StudyProvider} = load("src/presentation/StudyContext.tsx");

    const ui = fixture.ui();
    const catalog = fixture.catalog();
    const lessons = fixture.units();
    const reads = {};
    const byId = new Map(lessons.map(lesson => [lesson.id, lesson]));
    const service = new CurriculumService(new HttpCurriculumRepository(async resource => {
        reads[resource] = (reads[resource] ?? 0) + 1;
        if (resource === "/content/catalog.json") return structuredClone(catalog);
        const id = resource.slice("/content/units/".length, -".json".length);
        assert(byId.has(id), `读取了不存在的课文件：${resource}`);
        return structuredClone(byId.get(id));
    }));
    const services = createStudyServices(ui);
    const render = (props, locale) => {
        services.localization.current = () => locale;
        return renderToStaticMarkup(React.createElement(StudyProvider, {services},
            React.createElement(KanjiScreen, props)));
    };

    const book = catalog.books.find(item => item.id === BOOKS[0].id);
    for (const id of book.lessonIds.slice(0, 3)) {
        const lesson = await service.lesson(id);
        const items = lesson.modules.kanji.items;
        assert(items.length > 0, `汉字课不能为空：${id}`);
        assert.equal(catalog.lessons.find(item => item.id === id).views[0], "kanji", "页签由模块推导");
        assert.equal(lesson.id, id, "按点号分层的课 id 必须能取到对应文件");

        for (const locale of ["zh", "en"]) {
            const html = render({items, texts: lesson.texts, lessonId: lesson.id}, locale);
            assert.equal(countOf(html, "kanji-character"), items.length, `汉字卡片数量不对：${id}`);
            assert(!html.includes('class="vocabulary-toolbar"'), "每个字都重复一套词表工具栏是浪费");
            assert(!html.includes('class="speech-controls"'), "语音设置不应塞进每张单字卡");
            const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
            assert.equal(new Set(ids).size, ids.length, `出现重复 DOM 标识：${id}`);
            for (const kanji of items) {
                assert(html.includes(`href="#character-${kanji.id}"`), `缺少字间锚点：${kanji.id}`);
                for (const word of kanji.words) assert(html.includes(`data-word-id="${word.id}"`));
            }
        }
        const questions = lessonQuestions(lesson.modules);
        assert(questions.length >= items.length, "测验必须包含每个字的读音题");
        assert(questions.every(question => question.kind === "fill-in"), "汉字课的落盘题是读音填空题");
        // 词义选择题改回打开测验页时现场生成，不再固化成「正确答案全 A」的静态题。
        assert(lesson.wordQuiz, "汉字课必须带 wordQuiz 标记");
        const {lessonWords} = load("src/modules/curriculum/domain/lesson-modules.ts");
        const dynamic = services.assessment.vocabulary(lessonWords(lesson.modules),
            id => lesson.texts[id]?.zh ?? "", id => lesson.texts[id]?.en ?? "");
        assert(dynamic.length > 0, "现场必须能生成词义题");
        assert(dynamic.every(question => question.kind === "choice"), "现场词题是选择题");
        const all = [...questions, ...dynamic];
        assert.equal(new Set(all.map(question => question.id)).size, all.length, "测验题 ID 不得重复");
    }
    assert.equal(reads["/content/catalog.json"], undefined, "按 id 直接取课，不需要先读目录");
    await assert.rejects(service.lesson("../private"), /Invalid lesson ID/, "非法 id 必须挡在请求之前");
});

test("汉字结构化字段完整，旧的读音串不再作为例句", ["kanji:source-photos"], ({fixture}) => {
    const kanji = allKanji(fixture.source.units);
    assert(kanji.length >= 740, "汉字总数骤减");
    const withStrokes = kanji.filter(item => item.strokeCount !== undefined);
    assert(withStrokes.length >= 210, "画数字段骤减，结构化可能没跑完");
    assert(kanji.every(item => Array.isArray(item.onReadings) && Array.isArray(item.kunReadings)
        && Array.isArray(item.specialReadings) && Array.isArray(item.words) && Array.isArray(item.examples)),
    "汉字字段必须是结构化数组");
    let special = 0;
    for (const item of kanji) special += item.specialReadings.length;
    assert(special >= 2, "教材里标了「特別な読み」的条目必须解析成 specialReadings");
});
