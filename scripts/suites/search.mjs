import assert from "node:assert/strict";
import {test} from "../harness.mjs";
import {searchKinds} from "../search-index.mjs";

/**
 * 全文检索（新模型）。
 *
 * 索引是构建产物，最容易出的错是「跑得通但搜不到东西」：
 * 课漏进索引、条目指向不存在的下标、中文释义没带进来。
 */

const domain = context => context.load("src/modules/search/domain/search-index.ts");

test("检索索引覆盖教材里的每个课次", ["search:index"], context => {
    const {decodeSearchIndex} = domain(context);
    const built = context.fixture.searchIndex();
    const decoded = decodeSearchIndex(built);
    assert.equal(decoded.entries.length, built.entries.length);
    const catalog = context.fixture.source.catalog;
    const indexed = new Set(built.units.map(entry => entry[0]));
    const missing = catalog.lessons.map(lesson => lesson.id).filter(id => !indexed.has(id));
    assert.deepEqual(missing.slice(0, 5), [], `${missing.length} 个课次没进索引`);
    assert(built.entries.length >= 5000, `条目太少：${built.entries.length}`);
    const byId = new Map(catalog.lessons.map(lesson => [lesson.id, lesson.views]));
    for (const [unitIndex, kind] of built.entries) {
        const unit = built.units[unitIndex];
        assert(unit, `条目指向不存在的课 ${unitIndex}`);
        assert(searchKinds.includes(kind), `未知条目类型 ${kind}`);
        assert(byId.get(unit[0]), `索引里的课不在目录里：${unit[0]}`);
    }
    // 课次索引里带的是由模块推导出的页签，不是手写 views。
    for (const unit of built.units) {
        const views = byId.get(unit[0]);
        assert.deepEqual(unit[5], views, `页签与目录不一致：${unit[0]}`);
    }
});

test("日文查询能搜到例句", ["search:ja"], context => {
    const {decodeSearchIndex, searchIndex} = domain(context);
    const hits = searchIndex(decodeSearchIndex(context.fixture.searchIndex()), "音楽");
    assert(hits.length > 0, "「音楽」应该能搜到东西");
    assert(hits.some(hit => ["example", "passage", "word"].includes(hit.kind)), "内容条目应当出现在结果里");
    assert(hits.every(hit => hit.ja.includes("音楽") || hit.zh.includes("音楽")), "结果必须真的包含查询词");
});

test("中文查询能搜到单词释义", ["search:zh"], context => {
    const {decodeSearchIndex, searchIndex} = domain(context);
    const hits = searchIndex(decodeSearchIndex(context.fixture.searchIndex()), "效果");
    assert(hits.length > 0, "「效果」应该能搜到东西");
    assert(hits.some(hit => hit.kind === "word"), "词义命中应当包含单词条目");
    assert(hits.every(hit => hit.ja.includes("效果") || hit.zh.includes("效果")), "结果必须命中中文释义");
});

test("完全相同的条目排在包含匹配之前", ["search:rank"], context => {
    const {decodeSearchIndex, searchIndex, viewForEntry} = domain(context);
    const built = decodeSearchIndex({
        schemaVersion: 1,
        units: [["u1", "b", "书", "课一", "组", ["grammar", "articles"]], ["u2", "b", "书", "课二", "组", ["words"]]],
        entries: [
            [0, "example", "好きな音楽を聞く", ""],
            [0, "grammar", "音楽療法", ""],
            [0, "grammar", "音楽", ""],
            [1, "word", "効果（こうか）", "效果"],
        ],
    });
    assert.equal(searchIndex(built, "音楽")[0].ja, "音楽");
    assert.equal(searchIndex(built, "效果")[0].kind, "word");
    assert.equal(viewForEntry({kind: "word"}, {views: ["grammar", "words"]}), "words");
    assert.equal(viewForEntry({kind: "kanji"}, {views: ["kanji", "quiz"]}), "kanji");
    assert.equal(viewForEntry({kind: "dialogue"}, {views: ["dialogues", "quiz"]}), "dialogues");
    assert.equal(viewForEntry({kind: "passage"}, {views: ["grammar"]}), "grammar");
});

test("空查询与纯空格不返回结果", ["search:empty"], context => {
    const {decodeSearchIndex, searchIndex} = domain(context);
    const built = decodeSearchIndex(context.fixture.searchIndex());
    assert.deepEqual(searchIndex(built, ""), []);
    assert.deepEqual(searchIndex(built, "   "), []);
    assert.deepEqual(searchIndex(built, "音楽 絶対に存在しない語"), []);
});

test("结构损坏的索引必须被拒绝", ["search:decode"], context => {
    const {decodeSearchIndex} = domain(context);
    const good = {schemaVersion: 1, units: [["u1", "b", "书", "课一", "组", ["words"]]], entries: [[0, "word", "語", "词"]]};
    assert.equal(decodeSearchIndex(structuredClone(good)).units[0].title, "课一");
    assert.throws(() => decodeSearchIndex({...good, schemaVersion: 2}), /schema/i);
    assert.throws(() => decodeSearchIndex({...good, entries: [[3, "word", "語", "词"]]}), /entry/i);
    assert.throws(() => decodeSearchIndex({...good, entries: [[0, "poem", "語", "词"]]}), /entry/i);
    assert.throws(() => decodeSearchIndex({...good, units: [["u1", "b"]]}), /unit/i);
});
