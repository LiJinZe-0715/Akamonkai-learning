import assert from "../assertions.mjs";
import fs from "node:fs";
import path from "node:path";
import {test} from "../harness.mjs";
import {
    assetName, contentType, createManifest, downloadUrl, findMediaReferences,
    planPull, planUpload, validateManifest,
} from "../media-manifest.mjs";

/**
 * 资源清单的纯逻辑。
 *
 * 清单要等实际上传之后才会生成，所以「内容引用与清单一一对应」那条用例在本机
 * 暂时没有 data/media/manifest.json 可读——它照常登记，等清单入库后自然生效。
 */

const repository = "LiJinZe-0715/Akamonkai-learning";
const hash = character => character.repeat(64);

/** 断言某个调用被拒绝，且消息里提到了出问题的值。 */
function rejects(action, fragment) {
    assert.throws(action, error => error instanceof Error && error.message.includes(fragment),
        `必须拒绝：${fragment}`);
}

/** 递归列出目录下所有 .json 文件。 */
function jsonFiles(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return jsonFiles(full);
        return entry.name.endsWith(".json") ? [full] : [];
    });
}

const audio = {path: "media/jlpt/n2-2021-07-listening.mp3", bytes: 31189788, sha256: hash("b")};
const image = {path: "media/jlpt/n2-2021-07-listening-q2.png", bytes: 103288, sha256: hash("a")};

test("资源：路径换算为附件名，各扩展名给正确的 Content-Type", ["media:asset-name"], () => {
    assert.equal(assetName("media/jlpt/n2-2023-07-listening.mp3"), "n2-2023-07-listening.mp3");
    assert.equal(assetName("media/manabo/chukyu-o-manabo-chukyu-zenki.1.mp3"),
        "chukyu-o-manabo-chukyu-zenki.1.mp3", "附件名只取最后一段，目录不进发布页");
    assert.equal(assetName("media/jlpt/n2-2021-07-listening-q2.png"), "n2-2021-07-listening-q2.png");

    assert.equal(contentType("media/jlpt/a.mp3"), "audio/mpeg");
    assert.equal(contentType("media/jlpt/a.png"), "image/png");
    assert.equal(contentType("media/jlpt/a.jpg"), "image/jpeg");
    assert.equal(contentType("media/jlpt/a.jpeg"), "image/jpeg");
    assert.equal(contentType("media/jlpt/a.webp"), "image/webp");

    const rejected = ["https://x/a.mp3", "media/../a.mp3", "media/A.mp3", "media/a.wav", "media/a.mp3x", "a.mp3"];
    for (const value of rejected) {
        rejects(() => assetName(value), value);
        rejects(() => contentType(value), value);
    }
});

test("资源：清单生成时键已排序，坏字段、重名与多余键全部拒绝", ["media:manifest"], () => {
    const manifest = createManifest({repository, release: "resource", files: [audio, image]});
    assert.deepEqual(Object.keys(manifest.files), [image.path, audio.path], "files 的键必须按字符串升序");
    assert.deepEqual(manifest.files[audio.path], {bytes: audio.bytes, sha256: audio.sha256});
    assert.equal(validateManifest(manifest), manifest, "合法清单原样返回");

    assert.equal(downloadUrl(manifest, audio.path),
        "https://github.com/LiJinZe-0715/Akamonkai-learning/releases/download/resource/n2-2021-07-listening.mp3");
    // release 和附件名各自编码：发布页的地址是路径段，空格和中文都必须转义。
    const spaced = createManifest({repository, release: "v1 资源", files: [audio]});
    assert.equal(downloadUrl(spaced, audio.path),
        "https://github.com/LiJinZe-0715/Akamonkai-learning/releases/download/v1%20%E8%B5%84%E6%BA%90/n2-2021-07-listening.mp3");

    // createManifest：重复路径、附件名重名、字节数与哈希不合法。
    rejects(() => createManifest({repository, release: "resource", files: [audio, {...audio}]}), audio.path);
    rejects(() => createManifest({repository, release: "resource", files: [audio, {...audio, path: "media/other/n2-2021-07-listening.mp3"}]}),
        "附件名重复");
    rejects(() => createManifest({repository, release: "resource", files: [{...audio, bytes: 0}]}), audio.path);
    rejects(() => createManifest({repository, release: "resource", files: [{...audio, bytes: 1.5}]}), audio.path);
    rejects(() => createManifest({repository, release: "resource", files: [{...audio, sha256: hash("a").slice(1)}]}),
        audio.path);
    rejects(() => createManifest({repository, release: "resource", files: [{...audio, sha256: "A".repeat(64)}]}),
        audio.path);

    // validateManifest：多余键与字段错误。
    rejects(() => validateManifest({...manifest, generatedAt: "2026-11-17"}), "generatedAt");
    rejects(() => validateManifest({
        ...manifest,
        files: {...manifest.files, [audio.path]: {...manifest.files[audio.path], mode: 420}},
    }), "mode");
    rejects(() => validateManifest({
        ...manifest,
        files: {
            [audio.path]: {bytes: 1, sha256: hash("a")},
            "media/other/n2-2021-07-listening.mp3": {bytes: 2, sha256: hash("b")},
        },
    }), "附件名重复");
    rejects(() => validateManifest({...manifest, repository: "Akamonkai-learning"}), "owner/name");
    rejects(() => validateManifest({...manifest, release: ""}), "release");
    rejects(() => validateManifest({repository, release: "resource"}), "files");
    rejects(() => validateManifest(null), "清单必须是对象");
    rejects(() => validateManifest({...manifest, files: {"public/media/a.mp3": {bytes: 1, sha256: hash("a")}}}),
        "public/media/a.mp3");
});

test("资源：拉取计划按哈希判定下载、跳过与本地多出的文件", ["media:pull-plan"], () => {
    const second = {path: "media/jlpt/n2-2021-07-listening-q2.png", bytes: 103288, sha256: hash("c")};
    const manifest = createManifest({repository, release: "resource", files: [audio, second]});

    assert.deepEqual(planPull(manifest, {}), {
        download: [second.path, audio.path], ok: [], extra: [],
    }, "本地一个都没有时全部要下载");

    assert.deepEqual(planPull(manifest, {
        [audio.path]: {sha256: audio.sha256},
        [second.path]: {sha256: second.sha256},
    }), {download: [], ok: [second.path, audio.path], extra: []}, "哈希一致的全部跳过");

    assert.deepEqual(planPull(manifest, {
        [audio.path]: {sha256: audio.sha256},
        [second.path]: {sha256: hash("d")},
    }), {download: [second.path], ok: [audio.path], extra: []}, "哈希变了的重新下载");

    assert.deepEqual(planPull(manifest, {
        [audio.path]: {sha256: audio.sha256},
        [second.path]: undefined,
        "media/old/legacy.mp3": {sha256: hash("e")},
        "media/gone.mp3": undefined,
    }), {download: [second.path], ok: [audio.path], extra: ["media/old/legacy.mp3"]},
    "本地多出且真实存在的才算 extra，没算过哈希的不算");
});

test("资源：上传计划判定上传、替换、保留与发布页上多出的附件", ["media:upload-plan"], () => {
    const first = {path: "media/jlpt/a.mp3", bytes: 10, sha256: hash("1")};
    const second = {path: "media/jlpt/b.png", bytes: 20, sha256: hash("2")};
    const manifest = createManifest({repository, release: "resource", files: [first, second]});

    assert.deepEqual(planUpload(manifest, []), {
        upload: [first.path, second.path], replace: [], keep: [], extra: [],
    }, "发布页为空时全部要上传");

    assert.deepEqual(planUpload(manifest, [
        {id: 11, name: "a.mp3", size: 10, digest: `sha256:${first.sha256}`},
        {id: 12, name: "b.png", size: 20, digest: `sha256:${second.sha256}`},
    ]), {upload: [], replace: [], keep: [first.path, second.path], extra: []}, "哈希与大小都一致就保留");

    assert.deepEqual(planUpload(manifest, [
        {id: 21, name: "a.mp3", size: 10, digest: `sha256:${hash("9")}`},
        {id: 22, name: "b.png", size: 20, digest: null},
    ]), {
        upload: [],
        replace: [{path: first.path, assetId: 21}, {path: second.path, assetId: 22}],
        keep: [],
        extra: [],
    }, "digest 不同或缺失时替换，assetId 取自现有附件");

    assert.deepEqual(planUpload(manifest, [
        {id: 31, name: "a.mp3", size: 9, digest: `sha256:${first.sha256}`},
        {id: 32, name: "b.png", size: 20, digest: `sha256:${second.sha256}`},
        {id: 33, name: "old.png", size: 5, digest: null},
    ]), {
        upload: [], replace: [{path: first.path, assetId: 31}], keep: [second.path], extra: ["old.png"],
    }, "大小不同也算替换；发布页多出的只报告");
});

test("资源：嵌套内容里的 media 引用去重后升序收集", ["media:references"], () => {
    const sample = {
        lesson: {
            modules: {
                articles: {items: [
                    {audio: "media/manabo/chukyu-o-manabo-chukyu-zenki.1.mp3", title: "見 media/nope.mp3"},
                    {audio: "media/jlpt/n2-2023-07-listening.mp3", image: "media/jlpt/n2-2021-07-listening-q2.png"},
                ]},
                images: ["media/jlpt/n2-2021-07-listening-q2.png"],
            },
        },
        notes: ["见 media/a.mp3", "media/a.wav", 12, null, {deep: [{x: "media/jlpt/n2-2023-07-listening.mp3"}]}],
    };
    assert.deepEqual(findMediaReferences(sample), [
        "media/jlpt/n2-2021-07-listening-q2.png",
        "media/jlpt/n2-2023-07-listening.mp3",
        "media/manabo/chukyu-o-manabo-chukyu-zenki.1.mp3",
    ], "只收整串路径，句子里顺带提到 media/ 的不算，重复的只留一条");
});

test("资源：内容数据里的 media 引用与入库清单一一对应", ["media:references"], () => {
    const referenced = new Set();
    // 教材在 data/content，真题在 data/exams：两处都会引用 media/。
    for (const file of ["data/content", "data/exams"].flatMap(folder => jsonFiles(folder)))
        for (const reference of findMediaReferences(JSON.parse(fs.readFileSync(file, "utf8"))))
            referenced.add(reference);
    const manifest = validateManifest(JSON.parse(fs.readFileSync("data/media/manifest.json", "utf8")));
    const listed = Object.keys(manifest.files);
    const unlisted = [...referenced].filter(reference => !Object.hasOwn(manifest.files, reference)).sort();
    const unused = listed.filter(reference => !referenced.has(reference)).sort();
    assert(referenced.size > 0, "内容数据里一条 media 引用都没有，规则可能失效");
    assert.deepEqual([
        ...unlisted.map(reference => `内容引用了清单里没有的资源：${reference}`),
        ...unused.map(reference => `清单里的资源没有任何内容引用：${reference}`),
    ], [], `共 ${unlisted.length + unused.length} 处引用与清单不一致`);
});
