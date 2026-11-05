import assert from "node:assert/strict";
import {test} from "../harness.mjs";

/**
 * 出站端口。
 *
 * 这些用例只关心「端口在坏天气下的行为」：并发会不会重复拉取、失败能不能重试、
 * 非法路径会不会被挡在门外。全部用注入的假 fetch，不碰真实网络。
 */

test("并发请求合并成一次读取", ["port:coalesce"], async ({load, fixture}) => {
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const catalog = fixture.catalog();
    let reads = 0;
    const repository = new HttpCurriculumRepository(async path => {
        reads++;
        assert.equal(path, "/content/catalog.json");
        return structuredClone(catalog);
    });
    const [first, second] = await Promise.all([repository.catalog(), repository.catalog()]);
    assert.equal(reads, 1, "并发请求必须合并");
    assert.deepEqual(first, catalog);
    assert.equal(first, second, "合并后必须返回同一个对象");
    // 拿到之后仍然只读一次。
    await repository.catalog();
    assert.equal(reads, 1, "缓存命中不应再次读取");
});

test("失败可以重试，成功结果按 ID 去重", ["port:retry"], async ({load, fixture}) => {
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const catalog = fixture.catalog();
    const unit = fixture.units()[0];
    assert(unit.id.includes("."), "新课 id 必须是路径式 id");
    let lessonReads = 0;
    const repository = new HttpCurriculumRepository(async path => {
        if (path === "/content/catalog.json") return structuredClone(catalog);
        lessonReads++;
        if (lessonReads === 1) throw new Error("Temporary outage");
        return structuredClone(unit);
    });

    await assert.rejects(repository.lesson(unit.id), /outage/, "首次失败必须抛出");
    const [a, b] = await Promise.all([repository.lesson(unit.id), repository.lesson(unit.id)]);
    assert.equal(a, b, "重试成功后并发请求必须去重");
    assert.equal(lessonReads, 2, "失败的读取不计入缓存，成功的一次只读一遍");
});

test("目录解码失败后可以重新拉取", ["port:retry"], async ({load, fixture}) => {
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const catalog = fixture.catalog();
    let reads = 0;
    const repository = new HttpCurriculumRepository(async () => (++reads === 1 ? {} : structuredClone(catalog)));
    await assert.rejects(repository.catalog(), /schema/, "结构不对必须拒绝");
    assert.deepEqual(await repository.catalog(), catalog, "拒绝之后必须能重新拉取");
});

test("课程 ID 里的路径穿越被挡住", ["port:traversal"], async ({load}) => {
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const requested = [];
    const repository = new HttpCurriculumRepository(async path => {
        requested.push(path);
        return {};
    });
    await assert.rejects(repository.lesson("../private"), /Invalid lesson ID/);
    await assert.rejects(repository.lesson("a/b"), /Invalid lesson ID/);
    await assert.rejects(repository.lesson("minna.1/../../private"), /Invalid lesson ID/);
    // 点号分层的新课 id 必须能发出请求（返回 {} 会被解码器拒绝，这里只关心路径）。
    await assert.rejects(repository.lesson("minna-no-nihongo-shokyu.1"), /Invalid curriculum data/);
    assert.deepEqual(requested, ["/content/units/minna-no-nihongo-shokyu.1.json"],
        "合法的点号 id 只应请求自己的课文件");
});

test("HTTP 端口：非 2xx 报错、超时中断、内容路径按文档目录解析", ["port:failure"], async context => {
    const {load} = context;
    const {readJson} = load("src/shared/infrastructure/http-json.ts");
    let requested;

    context.globals({fetch: async (url, options) => {
        assert(options.signal, "必须带中断信号");
        requested = url;
        return {ok: true, json: async () => ({loaded: true})};
    }});
    for (const baseURI of ["https://example.test/app/", "https://example.test/app/index.html", "https://example.test/app"]) {
        context.globals({document: {baseURI}});
        await readJson("/content/test.json", 10);
        assert.equal(requested, "https://example.test/app/content/test.json", `内容路径解析错误：${baseURI}`);
    }
    context.globals({document: {baseURI: "file:///android_asset/index.html"}});
    await readJson("content/test.json", 10);
    assert.equal(requested, "file:///android_asset/content/test.json", "本地打包要保留资产目录");
    // 构建期注入了内容指纹时，URL 带上它：内容一变，缓存就失效。
    context.globals({__CONTENT_VERSION__: "abc123"});
    await readJson("/content/test.json", 10);
    assert.equal(requested, "file:///android_asset/content/test.json?v=abc123", "内容请求必须带内容指纹");

    context.globals({fetch: async () => ({ok: false})});
    await assert.rejects(readJson("missing", 10), /could not be loaded/);

    let signal;
    context.globals({fetch: (_, options) => {
        signal = options.signal;
        return new Promise(() => {
        });
    }});
    await assert.rejects(readJson("hanging", 5), /timed out/);
    assert(signal.aborted, "超时必须真的中断请求");
});

test("翻译目录缺键或空值时被拒绝", ["decode:malformed"], ({load, fixture}) => {
    const {decodeTranslations} = load("src/modules/localization/infrastructure/http-ui-catalog.ts");
    const {requiredUiTextIds} = load("src/modules/localization/domain/ui-text-ids.ts");
    const ui = fixture.ui();
    assert.deepEqual([...requiredUiTextIds].sort(), Object.keys(ui).sort(), "必需文案清单必须与实际一致");
    assert.throws(() => decodeTranslations({}), "空目录必须拒绝");
    const missing = {...ui};
    delete missing[requiredUiTextIds[0]];
    assert.throws(() => decodeTranslations(missing), "缺键必须拒绝");
    assert.throws(() => decodeTranslations({...ui, [requiredUiTextIds[0]]: {zh: "", en: "Home"}}), "空中文必须拒绝");
});
