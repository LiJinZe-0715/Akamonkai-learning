import assert from "node:assert/strict";

/**
 * 无状态用例骨架。
 *
 * 三条硬约束：
 * 1. 用例之间不共享任何可变状态——夹具每次重建，全局每次还原。
 * 2. 用例可以单独运行，也可以任意顺序运行，结果必须一致。
 * 3. 用例结束后如果残留了全局改动，直接判失败，而不是静默带进下一个用例。
 *
 * 不依赖任何测试框架：只需要 node:assert。
 */

const cases = [];
const registry = new Map();
const covered = new Map();
/** URL 上的可替换方法不在 globalThis 上，单独跟踪。 */
const TRACKED_URL_METHODS = ["createObjectURL", "revokeObjectURL"];

/**
 * 登记一个必须被覆盖的场景。
 * 场景清单由 scenarios.mjs 从真实枚举推导，不在这里手写。
 */
export function declareScenario({id, group, description}) {
    assert(!registry.has(id), `场景重复登记: ${id}`);
    registry.set(id, {group, description});
}

export function declareScenarios(entries) {
    for (const entry of entries) declareScenario(entry);
}

/**
 * 注册一个用例。
 * @param {string} name 用例名，失败时直接定位
 * @param {string[] | {scenarios: string[]}} options 该用例覆盖的场景，可直接传数组
 * @param {(ctx: object) => unknown | Promise<unknown>} body
 */
export function test(name, options, body) {
    const scenarios = Array.isArray(options) ? options : options?.scenarios ?? [];
    for (const id of scenarios)
        assert(registry.has(id), `用例「${name}」声明了未登记的场景: ${id}`);
    assert(!cases.some(item => item.name === name), `用例重名: ${name}`);
    cases.push({name, scenarios, body});
}

/* ── 环境隔离 ─────────────────────────────────────────────── */

function sameDescriptor(current, original) {
    if (!current || !original) return current === original;
    // 用 Object.is 而不是 ===：NaN 是合法的全局值，=== 会把它误判成「被改写」。
    return current.configurable === original.configurable &&
        current.enumerable === original.enumerable &&
        current.writable === original.writable &&
        Object.is(current.value, original.value) &&
        Object.is(current.get, original.get) &&
        Object.is(current.set, original.set);
}

function snapshotEnvironment() {
    const descriptors = new Map();
    for (const key of Object.getOwnPropertyNames(globalThis))
        descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const urlMethods = new Map();
    for (const method of TRACKED_URL_METHODS) urlMethods.set(method, URL[method]);
    return {descriptors, urlMethods};
}

/**
 * 还原环境，并返回用例留下的痕迹。
 * 痕迹非空说明用例污染了全局——这正是「有状态」的来源，必须暴露而不是掩盖。
 * `declared` 里的名字是用例通过 globals()/url() 主动声明的，属于授权改动，不算泄漏。
 */
function restoreEnvironment(snapshot, declared = new Set()) {
    const leaks = [];
    for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (snapshot.descriptors.has(key)) continue;
        delete globalThis[key];
        if (!declared.has(key)) leaks.push(`新增全局 ${key}`);
    }
    for (const [key, original] of snapshot.descriptors) {
        const current = Object.getOwnPropertyDescriptor(globalThis, key);
        if (sameDescriptor(current, original)) continue;
        Object.defineProperty(globalThis, key, original);
        if (!declared.has(key)) leaks.push(`改写全局 ${key}`);
    }
    for (const [method, original] of snapshot.urlMethods) {
        if (URL[method] === original) continue;
        URL[method] = original;
        if (!declared.has(`URL.${method}`)) leaks.push(`改写 URL.${method}`);
    }
    return leaks;
}

/* ── 执行 ─────────────────────────────────────────────────── */

function createContext({load, fixtures, clock}) {
    // 每个用例拿一份独立夹具：内部按需克隆、按用例记忆化，
    // 用例改它不会影响任何其他用例。
    const fixture = fixtures();
    // 用例主动声明的全局改动，还原时不算泄漏。
    const declared = new Set();
    // 用例创建的资源（定时器、订阅、清理函数），用例结束后逆序释放。
    const cleanups = [];

    const context = {
        load,
        clock,
        fixture,
        declared,
        /** 登记一个清理动作。用于定时器、订阅这类全局还原覆盖不到的资源。 */
        cleanup(action) {
            cleanups.push(action);
        },
        /** 安装全局变量。用例结束后由环境快照统一还原，不需要手工清理。 */
        globals(values) {
            for (const [name, value] of Object.entries(values)) {
                Object.defineProperty(globalThis, name, {
                    configurable: true,
                    writable: true,
                    value,
                });
                declared.add(name);
            }
        },
        /** 删除全局变量，用例结束后同样由快照还原。 */
        removeGlobal(name) {
            delete globalThis[name];
            declared.add(name);
        },
        /** 替换 URL 上的方法，用例结束后由快照还原。 */
        url(methods) {
            for (const [name, value] of Object.entries(methods)) {
                URL[name] = value;
                declared.add(`URL.${name}`);
            }
        },
        runCleanups() {
            while (cleanups.length) {
                try {
                    cleanups.pop()();
                } catch (error) {
                    return [`清理动作抛错：${error.message}`];
                }
            }
            return [];
        },
    };
    return context;
}

/** 当前挂起的定时器数量。用例结束后应当回到基线。 */
function pendingTimers() {
    return process.getActiveResourcesInfo().filter(resource => resource === "Timeout").length;
}

function shuffle(list, seed) {
    // 确定性打乱：同一个 seed 每次得到同一个顺序，失败可以复现。
    const result = [...list];
    let state = seed || 1;
    for (let index = result.length - 1; index > 0; index--) {
        state = (state * 1664525 + 1013904223) % 4294967296;
        const swap = state % (index + 1);
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
}

/**
 * 执行全部用例。
 * @param {{load: Function, fixtures: object, clock: () => string,
 *          shuffle?: number|boolean, only?: string}} options
 */
export async function run({load, fixtures, clock, shuffle: shuffleSeed = false, only = null}) {
    const selected = only
        ? cases.filter(item => item.name.includes(only) || item.scenarios.some(id => id.includes(only)))
        : [...cases];
    assert(selected.length, only ? `没有匹配「${only}」的用例` : "没有注册任何用例");
    const ordered = shuffleSeed ? shuffle(selected, shuffleSeed === true ? 1 : shuffleSeed) : selected;

    const failures = [];
    const startedAt = process.hrtime.bigint();

    for (const item of ordered) {
        const context = createContext({load, fixtures, clock});
        const snapshot = snapshotEnvironment();
        const timerBaseline = pendingTimers();
        try {
            await item.body(context);
            const cleanupErrors = context.runCleanups();
            const leaks = [...cleanupErrors, ...restoreEnvironment(snapshot, context.declared)];
            // 用例留下的定时器会在环境还原之后才触发，届时报错已经指不到它了。
            // 所以在用例边界上直接拦下来。
            const leftover = pendingTimers() - timerBaseline;
            if (leftover > 0) leaks.push(`遗留 ${leftover} 个未清理的定时器`);
            if (leaks.length)
                throw new Error(`用例残留全局改动，违反无状态约束：${leaks.join("、")}`);
            for (const id of item.scenarios)
                covered.set(id, [...(covered.get(id) ?? []), item.name]);
        } catch (error) {
            context.runCleanups();
            restoreEnvironment(snapshot, context.declared);
            failures.push({name: item.name, scenarios: item.scenarios, error});
        }
    }
    const elapsed = Number(process.hrtime.bigint() - startedAt) / 1e6;
    report({ordered, failures, elapsed, only});
    return failures.length === 0;
}

/* ── 报告 ─────────────────────────────────────────────────── */

function report({ordered, failures, elapsed, only}) {
    for (const failure of failures) {
        console.error(`\n✗ ${failure.name}`);
        if (failure.scenarios.length) console.error(`  场景: ${failure.scenarios.join(", ")}`);
        console.error(`  ${String(failure.error?.stack ?? failure.error).split("\n").slice(0, 6).join("\n  ")}`);
    }

    const missing = [...registry.keys()].filter(id => !covered.has(id));
    const passed = ordered.length - failures.length;
    const total = registry.size;
    const reached = total - missing.length;

    console.log("");
    console.log(`用例  ${passed}/${ordered.length} 通过${only ? "（筛选模式）" : ""}`);
    console.log(`场景  ${reached}/${total} 覆盖  ${total ? Math.round((reached / total) * 100) : 100}%`);
    console.log(`耗时  ${elapsed.toFixed(0)} ms`);

    if (missing.length && !only) {
        const groups = new Map();
        for (const id of missing) {
            const {group, description} = registry.get(id);
            groups.set(group, [...(groups.get(group) ?? []), `${id}（${description}）`]);
        }
        console.error("\n✗ 场景未覆盖，禁止合入：");
        for (const [group, entries] of groups) {
            console.error(`  ${group}`);
            for (const entry of entries) console.error(`    · ${entry}`);
        }
    }

    if (failures.length) {
        console.error(`\n✗ ${failures.length} 个用例失败`);
        process.exitCode = 1;
    } else if (missing.length && !only) {
        console.error(`\n✗ 场景覆盖率不足：缺 ${missing.length} 项`);
        process.exitCode = 1;
    } else if (only) {
        console.log(`\n✓ 筛选用例全部通过（覆盖率在完整运行中校验）`);
    } else {
        console.log("\n✓ 全部通过，场景覆盖 100%");
    }
}

export function caseNames() {
    return cases.map(item => item.name);
}

export function scenarioIds() {
    return [...registry.keys()];
}
