import base from "node:assert/strict";

/**
 * 用例专用的断言入口。
 *
 * harness 的覆盖率按用例「声明的场景」记账，光靠声明挡不住空 body 刷满 100%。
 * 这里把断言包一层计数：body 跑完一次断言都没调，harness 直接判失败。
 *
 * 只给 suites/ 用；harness 自己仍然直接用 node:assert。
 */

let count = 0;

/** 当前累计的断言调用次数（跨用例累加，harness 用差值判断）。 */
export const assertionCount = () => count;

const counted = new Proxy(base, {
    apply(target, thisArg, args) {
        count += 1;
        return Reflect.apply(target, thisArg, args);
    },
    get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        // AssertionError 是构造函数，包一层会破坏 new / instanceof。
        if (typeof value !== "function" || property === "AssertionError") return value;
        return (...args) => {
            count += 1;
            return value.apply(target, args);
        };
    },
});

export default counted;
