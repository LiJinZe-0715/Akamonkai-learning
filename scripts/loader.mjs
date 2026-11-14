import fs from "node:fs";
import path from "node:path";
import ts from "@typescript/typescript6";
import {createRequire} from "node:module";

/**
 * 直接把 TypeScript 源码加载进内存执行，不经过构建。
 *
 * 两条设计要点：
 * - 转译产物包在严格模式下执行。夹具是冻结的，任何「顺手改一下共享数据」
 *   都会当场抛 TypeError，而不是静默污染后续用例。
 * - 模块缓存按路径共享。前提是被加载的模块本身无状态（只有类与纯函数），
 *   这条前提由 check.mjs 里的架构断言守着。
 */

const EXTENSIONS = ["", ".ts", ".tsx", ".json", ".mjs"];

export function createLoader(root = process.cwd()) {
    const cache = new Map();

    const resolvePath = base => {
        const candidate = EXTENSIONS.map(extension => base + extension).find(fs.existsSync);
        if (!candidate) throw new Error(`无法解析模块: ${base}`);
        return path.resolve(candidate);
    };

    /**
     * @param {string} file 相对项目根的路径
     * @param {(specifier: string) => object | undefined} [resolveOverride]
     *        命中时用返回值替代真实模块。用于注入假的 react / 上下文，
     *        让 hook 能在纯 Node 里按真实生命周期执行。带覆盖时不走缓存。
     */
    function load(file, resolveOverride) {
        const absolute = resolvePath(path.resolve(root, file));
        const cached = cache.get(absolute);
        if (cached && !resolveOverride) return cached.exports;
        if (absolute.endsWith(".json")) return readJson(absolute);

        const module = {exports: {}};
        if (!resolveOverride) cache.set(absolute, module);
        const require = createRequire(absolute);
        const local = spec => {
            const override = resolveOverride?.(spec);
            if (override) return override;
            if (!spec.startsWith(".")) return require(spec);
            return load(path.resolve(path.dirname(absolute), spec), resolveOverride);
        };
        const source = fs.readFileSync(absolute, "utf8");
        const compiled = ts.transpileModule(source, {
            fileName: absolute,
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                jsx: ts.JsxEmit.ReactJSX,
                esModuleInterop: true,
            },
        }).outputText;
        // 严格模式让冻结夹具上的写入直接抛错。
        new Function("require", "module", "exports", `"use strict";\n${compiled}`)(local, module, module.exports);
        return module.exports;
    }

    return load;
}

export function readJson(file) {
    return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

/** 递归冻结，用于把共享夹具钉成只读。 */
export function deepFreeze(value, seen = new Set()) {
    if (value === null || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key], seen);
    return Object.freeze(value);
}
