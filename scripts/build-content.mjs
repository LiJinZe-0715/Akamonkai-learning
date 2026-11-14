import fs from "node:fs";
import path from "node:path";
import {buildCatalog, compileLessons} from "./content-compiler.mjs";
import {buildSearchIndex} from "./search-index.mjs";
import {compileExams} from "./exam-compiler.mjs";
import {createLog} from "./build-log.mjs";

const log = createLog("build-content");
const publicRoot = path.resolve("public");
const output = path.resolve(publicRoot, "content");
if (path.dirname(output) !== publicRoot || path.basename(output) !== "content")
    throw new Error("Invalid generated content directory");
// 生成内容每次构建都会整体重写，所以这里不先清空目录：
// 万一删到一半中断（回收站满了、文件被占用），网站就没有内容可用；
// 而下面每个文件都是确定性产物。
// 「不先清空」不等于「不用清」：课改名或删掉后，旧 JSON 不会自己消失，而
// public/content 会被复制进 dist、再复制进 APK。所以先写完全部文件，最后再删
// 这一版没产出的孤儿——中途失败也只是多留几个文件，不会出现「站点没有内容」。
const produced = new Set(["catalog.json", "ui.json", "search.json"]);

const lessons = await log.step("编译教材内容", () => {
    const compiled = compileLessons();
    log.info(`${compiled.length} 课`);
    return compiled;
});

const exams = await log.step("编译真题内容", () => {
    const compiled = compileExams();
    log.info(`${compiled.length} 场`);
    return compiled;
});

await log.step("写目录与检索索引", () => {
    fs.mkdirSync("public/content/units", {recursive: true});
    fs.mkdirSync("public/content/exams", {recursive: true});
    const catalog = buildCatalog(lessons, exams);
    fs.writeFileSync("public/content/catalog.json", JSON.stringify(catalog));
    // 检索索引跟着内容一起产出：课、例句、词义改了，索引不可能忘更新。
    fs.writeFileSync("public/content/search.json", JSON.stringify(buildSearchIndex(lessons, catalog)));
});

await log.step("写课文件与界面文案", () => {
    for (const lesson of lessons) {
        // docs/content-model.md 4.4：产物文件名就是课 id，课 id 里的点号照写。
        produced.add("units/" + lesson.id + ".json");
        fs.writeFileSync("public/content/units/" + lesson.id + ".json", JSON.stringify(lesson));
    }
    for (const exam of exams) {
        // questionCount 是给目录用的派生值，写进文件会被严格解码器当成多余字段拒收。
        const {questionCount: _ignored, ...body} = exam;
        produced.add("exams/" + exam.id + ".json");
        fs.writeFileSync("public/content/exams/" + exam.id + ".json", JSON.stringify(body));
    }
    fs.copyFileSync("data/content/localization/ui.json", "public/content/ui.json");
    log.info(`${produced.size} 个文件`);
});

await log.step("清理上一版留下的文件", () => {
    let pruned = 0;
    const pruneGenerated = (folder, prefix = "") => {
        for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
            const relative = prefix ? prefix + "/" + entry.name : entry.name;
            const target = path.join(folder, entry.name);
            if (entry.isDirectory()) pruneGenerated(target, relative);
            else if (!produced.has(relative)) {
                fs.rmSync(target);
                pruned++;
            }
        }
        // 整个目录都空了就一起收走，免得 public/content 里堆着空壳。
        if (prefix && fs.readdirSync(folder).length === 0) fs.rmdirSync(folder);
    };
    pruneGenerated(output);
    if (pruned) log.info(`删掉 ${pruned} 个旧文件`);
});
