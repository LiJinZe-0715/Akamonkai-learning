import assert from "node:assert/strict";
import {test} from "../harness.mjs";

/**
 * 数据解码（新模型）。
 *
 * 每个用例都从 structuredClone 的副本出发，畸形输入不会碰到夹具本身。
 * 正向用例证明「合法数据往返不变」，反向用例证明「每种坏数据都被拒绝」。
 */

const decoder = ({load}) => load("src/modules/curriculum/infrastructure/content-decoder.ts");
const firstWith = (lessons, predicate) => lessons.find(predicate);

test("合法目录与全部课往返解码后完全不变", ["decode:valid"], context => {
    const {decodeCatalog, decodeLesson} = decoder(context);
    const catalog = context.fixture.catalog(), lessons = context.fixture.units();
    assert.deepEqual(decodeCatalog(structuredClone(catalog)), catalog);
    for (const lesson of lessons)
        assert.deepEqual(decodeLesson(structuredClone(lesson), lesson.id), lesson, `往返失真：${lesson.id}`);
});

test("文章的录音只收站点内 media/ 下的 mp3，旧字段一律拒绝", ["decode:malformed"], context => {
    const {decodeLesson} = decoder(context);
    const lesson = structuredClone(context.fixture.units()
        .find(unit => unit.bookId === "chukyu-o-manabo-chukyu-zenki"));
    assert(lesson, "夹具里需要有带录音的课");
    for (const value of ["https://example.com/a.mp3", "media/../../secret.mp3", "media/x.wav", ""]) {
        const broken = structuredClone(lesson);
        broken.modules.articles.items[0].audio = value;
        assert.throws(() => decodeLesson(broken, broken.id), /audio/, `非法录音路径未被拒：${value}`);
    }
    const oldField = structuredClone(lesson);
    oldField.modules.articles.items[0].audioSrc = "media/x.mp3";
    assert.throws(() => decodeLesson(oldField, oldField.id), /unexpected field/,
        "audioSrc 是已删掉的死字段，不该被解码器接受");
});

test("缺少译文的数据必须被拒绝", ["decode:missing-translation"], context => {
    const {decodeLesson} = decoder(context);
    const broken = structuredClone(firstWith(context.fixture.units(), lesson => lesson.modules.words));
    const id = broken.modules.words.items[0].meaningId;
    delete broken.texts[id];
    assert.throws(() => decodeLesson(broken, broken.id), /missing translation/);
});

test("单词解析字段必须通过译文校验", ["decode:missing-translation"], context => {
    const {decodeLesson} = decoder(context);
    const lesson = structuredClone(firstWith(context.fixture.units(),
        item => item.modules.words?.items.some(word => word.analysisId)));
    assert(lesson, "夹具里需要有带解析的词条");
    assert.doesNotThrow(() => decodeLesson(structuredClone(lesson), lesson.id), "合法的解析字段不应被拒");

    const word = lesson.modules.words.items.find(item => item.analysisId);
    const missing = structuredClone(lesson);
    delete missing.texts[word.analysisId];
    assert.throws(() => decodeLesson(missing, missing.id), /missing translation/);

    const malformed = structuredClone(lesson);
    malformed.modules.words.items.find(item => item.analysisId).analysisId = 42;
    assert.throws(() => decodeLesson(malformed, malformed.id), /expected text/);
});

test("请求的 ID 与数据身份不符必须被拒绝", ["decode:identity"], context => {
    const {decodeLesson} = decoder(context);
    const lesson = structuredClone(context.fixture.units()[0]);
    assert.throws(() => decodeLesson(lesson, "wrong-id"), /identity mismatch/);
});

test("目录版本号不认识必须被拒绝", ["decode:schema"], context => {
    const {decodeCatalog, decodeLesson} = decoder(context);
    const catalog = structuredClone(context.fixture.catalog());
    assert.throws(() => decodeCatalog({...catalog, schemaVersion: 99}), /schema/);
    const lesson = structuredClone(context.fixture.units()[0]);
    assert.throws(() => decodeCatalog({...catalog, books: []}), /unknown book/);
    assert.doesNotThrow(() => decodeLesson(lesson, lesson.id));
});

test("重复的课与单词必须被拒绝", ["decode:duplicate"], context => {
    const {decodeCatalog, decodeLesson} = decoder(context);
    const catalog = structuredClone(context.fixture.catalog());
    catalog.books[0].lessonIds.push(catalog.books[0].lessonIds[0]);
    assert.throws(() => decodeCatalog(catalog), /duplicate/i);

    const lesson = structuredClone(firstWith(context.fixture.units(), item => item.modules.words?.items.length > 1));
    lesson.modules.words.items.push({...lesson.modules.words.items[0]});
    assert.throws(() => decodeLesson(lesson, lesson.id), /duplicate ID/);
});

test("字段类型错误必须被拒绝，修正后必须能通过", ["decode:malformed"], context => {
    const {decodeLesson} = decoder(context);
    const wordsLesson = structuredClone(firstWith(context.fixture.units(),
        item => JSON.stringify(item.modules).includes('"answer"')));
    const findQuestion = value => {
        if (Array.isArray(value)) return value.map(findQuestion).find(Boolean);
        if (!value || typeof value !== "object") return undefined;
        if (value.kind === "choice") return value;
        return Object.values(value).map(findQuestion).find(Boolean);
    };
    const question = findQuestion(wordsLesson.modules);
    assert(question, "夹具里需要有选择题");
    const textId = Object.keys(wordsLesson.texts)[0];

    question.prompt = [{japanese: 42, textId}];
    assert.throws(() => decodeLesson(wordsLesson, wordsLesson.id), /segment needs exactly one/);
    question.prompt = [{japanese: "日文", textId}];
    assert.throws(() => decodeLesson(wordsLesson, wordsLesson.id), /segment needs exactly one/);
    question.prompt = [{japanese: 42}];
    assert.throws(() => decodeLesson(wordsLesson, wordsLesson.id), /expected text/);
    const repaired = structuredClone(firstWith(context.fixture.units(), item => item.modules.words));
    assert.doesNotThrow(() => decodeLesson(repaired, repaired.id), "原始夹具必须能解码");

    const badId = structuredClone(repaired);
    badId.modules.words.items[0].id = " ";
    assert.throws(() => decodeLesson(badId, badId.id), /invalid ID/);

    const extra = structuredClone(context.fixture.units()[0]);
    extra.legacyField = true;
    assert.throws(() => decodeLesson(extra, extra.id), /unexpected field/);

    const orphan = structuredClone(context.fixture.units()[0]);
    orphan.texts["orphan.translation"] = {zh: "孤", en: "orphan"};
    assert.throws(() => decodeLesson(orphan, orphan.id), /orphan translation/);
});
