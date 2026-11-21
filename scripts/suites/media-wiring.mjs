import assert from "../assertions.mjs";
import fs from "node:fs";
import {test} from "../harness.mjs";

/**
 * 资源接线：dev/build 先拉资源、资源目录不入库、CI 按清单缓存资源。
 * 全部读真实文件做静态断言，不联网、不跑命令行。
 */

const read = file => fs.readFileSync(file, "utf8");

test("资源：dev 和 build 开头先拉资源，build 仍以 vite build 结尾", ["media:wiring"], () => {
    const {scripts} = JSON.parse(read("package.json"));
    const prefix = "node scripts/media.mjs pull --quiet && ";
    assert(scripts.dev.startsWith(prefix), `dev 应以「${prefix}」开头：${scripts.dev}`);
    assert(scripts.build.startsWith(prefix), `build 应以「${prefix}」开头：${scripts.build}`);
    // build-android.mjs 跑 pnpm build --base=/，参数接在最后一条命令后面，
    // 所以最后必须仍是 vite build，否则 --base 会递给别的命令。
    assert(scripts.build.endsWith("vite build"), `build 应以 vite build 结尾：${scripts.build}`);
    for (const name of ["media:pull", "media:verify", "media:publish", "media:manifest"])
        assert.equal(scripts[name], `node scripts/media.mjs ${name.slice("media:".length)}`,
            `缺少或写错了脚本 ${name}`);
});

test("资源：public/media/ 不入库", ["media:wiring"], () => {
    const lines = read(".gitignore").split(/\r?\n/);
    assert(lines.includes("/public/media/"), ".gitignore 应有一行正好是 /public/media/");
});

test("资源：CI 按清单哈希缓存资源，缓存步骤在构建之前", ["media:wiring"], () => {
    const workflow = read(".github/workflows/deploy-pages.yml");
    assert.match(workflow, /actions\/cache@/, "工作流缺少 actions/cache 步骤");
    assert.match(workflow, /path: public\/media/, "缓存的路径应是 public/media");
    assert(workflow.includes("hashFiles('data/media/manifest.json')"),
        "缓存 key 应由 data/media/manifest.json 的哈希派生，清单不变就不重新下载");
    const cacheAt = workflow.indexOf("actions/cache@");
    const buildAt = workflow.indexOf("run: pnpm build");
    assert(buildAt !== -1, "工作流里找不到 pnpm build 步骤");
    assert(cacheAt < buildAt, "Cache media 步骤必须出现在 pnpm build 之前，否则缓存不起作用");
});

test("资源：哈希缓存在 public 之外，令牌绝不出现在日志里", ["media:wiring"], () => {
    const source = read("scripts/media.mjs");
    assert(source.includes("node_modules/.cache"), "哈希缓存应放在 node_modules/.cache 下");
    // 缓存放进 public/ 会被 vite 拷进网站和 APK。
    assert(!source.includes('"public/media/.'), "缓存文件不能放进 public/media/");
    // 令牌变量名与 media.mjs 里写死的一致（token / uploadToken）。
    assert.doesNotMatch(source, /(?:log|console)\.\w+\([^)]*\b(?:token|uploadToken)\b/,
        "令牌变量出现在 log./console. 调用的参数里，会把密钥打进终端和日志文件");
});