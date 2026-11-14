import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "@typescript/typescript6";
import {test} from "../harness.mjs";

/**
 * 架构约束。
 *
 * 分层不是靠自觉，是把规则写成断言。每个用例独立重新扫描源码，
 * 不缓存任何中间结果——这样用例顺序无关，单跑与全跑结论一致。
 */

// 统一用正斜杠拼接：模块边与目录判定都按 posix 风格比较，
// 否则 Windows 的反斜杠会让所有路径前缀判断失效。
const files = directory =>
    fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry =>
        entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);

const isSource = file => /\.tsx?$/.test(file);
const sourceFiles = () => files("src").filter(isSource);
const moduleOf = file => /^src\/modules\/([^/]+)\//.exec(file)?.[1];

/** 解析一个文件的 import / export-from 边。 */
function edgesOf(file) {
    const code = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    const edges = [];
    for (const statement of ast.statements) {
        if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
        const specifier = statement.moduleSpecifier?.text;
        if (!specifier) continue;
        const typeOnly = statement.isTypeOnly || statement.importClause?.isTypeOnly;
        const target = specifier.startsWith(".")
            ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
            : null;
        edges.push({specifier, target, typeOnly, code});
    }
    return edges;
}

test("domain 层与内核只依赖 shared/kernel 与本模块 domain", ["arch:domain-purity"], () => {
    const offenders = [];
    // shared/kernel 也算内核：它是所有 domain 的公共底座，不能被模块反向绑架。
    const domainFiles = sourceFiles().filter(file => file.includes("/domain/") || file.startsWith("src/shared/kernel/"));
    for (const file of domainFiles) {
        const code = fs.readFileSync(file, "utf8");
        if (/react|document\.|window\.|localStorage|fetch\(/.test(code)) offenders.push(`浏览器/框架依赖: ${file}`);
        const owner = moduleOf(file);
        for (const {specifier, target, typeOnly} of edgesOf(file)) {
            if (!target) {
                if (/react|next|vite/.test(specifier)) offenders.push(`框架依赖: ${file} -> ${specifier}`);
                continue;
            }
            // 内核不许反向依赖任何模块，连类型也不行：否则模块搬走了，内核得跟着改。
            if (!owner) {
                if (target.startsWith("src/modules/")) offenders.push(`内核反向依赖模块: ${file} -> ${target}`);
                continue;
            }
            // 类型可以经别的模块的公开入口引用（docs/content-model.md 第 5 节就是这么定义
            // Kanji / Word / Article / Grammar 之间的引用的）；运行时依赖仍然
            // 只能落在 shared/kernel 与本模块 domain。
            if (typeOnly && target.endsWith("/public")) continue;
            if (!target.startsWith("src/shared/kernel/") && !target.startsWith(`src/modules/${owner}/domain/`))
                offenders.push(`越界依赖: ${file} -> ${target}`);
        }
    }
    assert.deepEqual(offenders, [], "domain 层必须纯净");
});

test("application 层不碰浏览器，只向内依赖", ["arch:application-purity"], () => {
    const offenders = [];
    for (const file of sourceFiles().filter(file => file.includes("/application/"))) {
        const code = fs.readFileSync(file, "utf8");
        if (/document\.|window\.|new Blob\(|createObjectURL|localStorage|sessionStorage|\bfetch\(/.test(code))
            offenders.push(`浏览器依赖: ${file}`);
        for (const {target, specifier} of edgesOf(file)) {
            if (!target) {
                if (/react|next|vite/.test(specifier)) offenders.push(`框架依赖: ${file} -> ${specifier}`);
                continue;
            }
            if (target.includes("/infrastructure/") || target.includes("/presentation/"))
                offenders.push(`向外依赖: ${file} -> ${target}`);
        }
    }
    assert.deepEqual(offenders, [], "application 层必须与浏览器无关");
});

test("跨模块只能走公开入口，表现层不绕过 infrastructure 端口", ["arch:boundary"], () => {
    const offenders = [];
    for (const file of sourceFiles()) {
        const owner = moduleOf(file);
        for (const {target, typeOnly} of edgesOf(file)) {
            if (!target) continue;
            const targetModule = moduleOf(target);
            if (target.includes("/infrastructure/") && !file.includes("/infrastructure/") && !file.startsWith("src/bootstrap/"))
                offenders.push(`绕过端口: ${file} -> ${target}`);
            if (target.includes("/presentation/data/") && !file.includes("/presentation/"))
                offenders.push(`UI 配置内泄: ${file} -> ${target}`);
            if (file.includes("/presentation/") && targetModule && targetModule !== owner &&
                !target.endsWith("/public") && !target.endsWith("/presentation/index"))
                offenders.push(`表现层越界: ${file} -> ${target}`);
            if (owner && targetModule && owner !== targetModule &&
                !target.endsWith("/public") && !(file.includes("/presentation/") && target.endsWith("/presentation/index")))
                offenders.push(`私有模块访问: ${file} -> ${target}`);
            if (file.endsWith("/public.ts") && !typeOnly && !target.includes("/domain/"))
                offenders.push(`公开入口导出具体实现: ${file} -> ${target}`);
        }
    }
    assert.deepEqual(offenders, [], "模块边界必须封闭");
});

test("表现层不直连 domain，模块外只走 public", ["arch:layer-access"], () => {
    const offenders = [];
    for (const file of sourceFiles()) {
        const owner = moduleOf(file);
        const presentation = file.includes("/presentation/");
        // application / shared 不属于任何模块，是"外层"。
        const outer = file.startsWith("src/application/") || file.startsWith("src/shared/");
        for (const {target} of edgesOf(file)) {
            if (!target) continue;
            const targetModule = moduleOf(target);
            // 本模块的 domain 只能经 public 暴露：presentation 不再直接穿过去。
            if (presentation && targetModule === owner && target.includes("/domain/"))
                offenders.push(`表现层直连 domain: ${file} -> ${target}`);
            // 模块外只能用模块的公开入口，不能摸 application / infrastructure / domain。
            if (outer && targetModule && !target.endsWith("/public"))
                offenders.push(`模块外绕过 public: ${file} -> ${target}`);
        }
    }
    assert.deepEqual(offenders, [], "层间访问必须经公开入口");
});

test("依赖图无环，类型依赖也算边", ["arch:cycle"], () => {
    const graph = new Map();
    for (const file of sourceFiles()) {
        const edges = edgesOf(file)
            .map(({target}) => target)
            .filter(Boolean)
            .map(target => [target, `${target}.ts`, `${target}.tsx`, `${target}.json`].find(candidate => fs.existsSync(candidate)))
            .filter(Boolean);
        graph.set(file, edges);
    }
    const cycles = [];
    for (const file of graph.keys()) {
        const visit = (current, trail) => {
            for (const next of graph.get(current) ?? []) {
                if (next === file) {
                    cycles.push([...trail, next].join(" -> "));
                    return;
                }
                if (trail.includes(next)) continue;
                visit(next, [...trail, next]);
            }
        };
        visit(file, [file]);
    }
    assert.deepEqual(cycles, [], "存在循环依赖");
});

test("源码不直接 import 内容数据，内容只能经端口读入", ["arch:content-import"], () => {
    const offenders = [];
    for (const file of sourceFiles()) {
        for (const {specifier, target} of edgesOf(file)) {
            if (specifier.endsWith(".json") || specifier.includes("/content/")) offenders.push(`${file} -> ${specifier}`);
            if (target?.startsWith("data/")) offenders.push(`${file} -> ${target}`);
        }
    }
    assert.deepEqual(offenders, [], "内容数据必须运行时读取");
});
