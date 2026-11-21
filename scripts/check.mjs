import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {declareScenarios, run} from "./harness.mjs";
import {createLoader} from "./loader.mjs";
import {createFixtures} from "./fixtures.mjs";
import {scenarioList} from "./scenarios.mjs";

/**
 * 校验入口。
 *
 * 顺序很重要：先把场景清单登记进骨架，再加载用例套件——
 * 用例在注册时就校验自己声明的场景是否存在，写错场景名会立刻失败。
 *
 * 用法：
 *   node scripts/check.mjs                 全部用例
 *   node scripts/check.mjs --only=草稿     只跑名字含「草稿」的用例
 *   node scripts/check.mjs --shuffle       打乱顺序（验证用例之间无状态依赖）
 */

const args = process.argv.slice(2);
const option = name => {
    const prefix = `--${name}=`;
    const found = args.find(arg => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
};

declareScenarios(scenarioList());

const load = createLoader(process.cwd());
const fixtures = createFixtures({load});

const suiteDirectory = path.join(import.meta.dirname, "suites");
for (const entry of fs.readdirSync(suiteDirectory).sort())
    if (entry.endsWith(".mjs")) await import(pathToFileURL(path.join(suiteDirectory, entry)).href);

// --shuffle 用固定种子打乱顺序：用例之间若有状态依赖，打乱后必然暴露，
// 而同一个种子每次都得到同一个顺序，失败可复现。--shuffle=N 换一个顺序。
// 种子必须是非负整数：0/NaN 以前会让打乱静默失效，负数会算出负下标直接崩。
const shuffleArgument = args.find(arg => arg === "--shuffle" || arg.startsWith("--shuffle="));
const seedText = shuffleArgument?.includes("=")
    ? shuffleArgument.slice("--shuffle=".length) : null;
if (seedText !== null && !/^\d+$/.test(seedText))
    throw new Error(`--shuffle 需要非负整数种子，收到：${shuffleArgument}`);
const shuffle = shuffleArgument ? (seedText === null ? 1 : Number(seedText)) : false;
if (shuffleArgument && !Number.isSafeInteger(shuffle))
    throw new Error(`--shuffle 种子超出安全整数范围：${shuffleArgument}`);

const only = option("only");
// CI 里禁止筛选模式：它跳过覆盖率校验，用错就是「全绿但只跑了两条」。
if (only && (process.env.CI || process.env.GITHUB_ACTIONS))
    throw new Error("CI 不允许 --only：筛选模式跳过覆盖率校验，会假绿");

const passed = await run({
    load,
    fixtures,
    clock: () => "2026-10-05T00:00:00.000Z",
    shuffle,
    only,
});
// run() 的返回值也要兜住：报告里没设 exitCode 的分支不能悄悄以 0 退出。
if (!passed) process.exitCode = 1;
