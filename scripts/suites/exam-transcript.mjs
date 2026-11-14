import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "../harness.mjs";

/**
 * 逐字核对结论的回归锁。
 *
 * 十套真题都曾按原卷 PDF 一页一页核过（见 JLPT/_audit_progress.md 与
 * JLPT/_audit_2024.md），那些错字是转录时抄错的，不是语感问题。
 * 结构校验抓不到「観察 写回 視察」，重跑一次转录脚本就会悄悄退化，
 * 所以把结论直接锁成断言；卷面本身印错、印重的句子也锁成 require，
 * 防止后人「顺手改对」反而偏离原卷。
 *
 * 锁表由 JLPT/_gen_locks.py 与 JLPT/_dsl_fix.py 的修正项生成，
 * 每条都回原卷裁图确认过。
 * require：该卷全文必须出现；forbid：该卷全文必须不出现。
 */

const LOCKS = JSON.parse(fs.readFileSync(
    new URL("../exam-transcript-locks.json", import.meta.url), "utf8")).papers;

const EXAM_DIR = "data/exams/jlpt-n2-shiken";

/** 把一份卷面摊成带定位的文本片段，报错时能指到具体题目或正文行。 */
function entries(exam) {
    const found = [];
    const push = (where, text) => {
        if (typeof text === "string" && text) found.push({where, text});
        else if (Array.isArray(text)) text.forEach((line, index) => push(`${where}[${index}]`, line));
    };
    for (const [module, key] of [["知識", "knowledge"], ["読解", "reading"], ["聴解", "listening"]]) {
        for (const group of exam[key].groups) {
            const base = `${module}/${group.label}`;
            push(`${base} instruction`, group.instruction);
            push(`${base} title`, group.title);
            for (const [index, passage] of (group.passages ?? []).entries()) {
                const at = `${base} 第${index + 1}篇`;
                push(`${at} title`, passage.title);
                push(`${at} body`, passage.body);
                for (const question of passage.questions) {
                    const q = `${at} #${question.number}`;
                    push(`${q} prompt`, question.prompt);
                    push(`${q} options`, question.options.map(option => option.text));
                }
            }
            for (const question of group.questions ?? []) {
                const q = `${base} #${question.number}`;
                push(`${q} prompt`, question.prompt);
                push(`${q} options`, question.options.map(option => option.text));
            }
        }
    }
    return found;
}

test("真题逐字核对结论不退化：改对的字必须在，改掉的错字不许回来", ["exam:transcript"], () => {
    const problems = [];
    for (const [tag, lock] of Object.entries(LOCKS)) {
        const file = `${EXAM_DIR}/${tag}.json`;
        if (!fs.existsSync(file)) {
            problems.push(`${file}: 锁表里有这一套，源数据却不存在`);
            continue;
        }
        const exam = JSON.parse(fs.readFileSync(file, "utf8"));
        const parts = entries(exam);
        const whole = parts.map(part => part.text).join("\n");

        for (const needle of lock.require)
            if (!whole.includes(needle))
                problems.push(`${file}: 缺少已核对的原文「${needle.slice(0, 60)}」`);
        for (const needle of lock.forbid) {
            const hit = parts.find(part => part.text.includes(needle));
            if (hit) problems.push(`${file}: ${hit.where} 又出现了已改掉的「${needle.slice(0, 60)}」`);
        }
    }
    assert.equal(problems.length, 0, `共 ${problems.length} 处：\n${problems.slice(0, 12).join("\n")}`);
});

test("逐字锁表本身完整：十套齐全，每套都有正反两类断言", ["exam:transcript"], () => {
    const tags = Object.keys(LOCKS);
    assert.equal(tags.length, 10, "锁表应覆盖十套已核对的真题");
    for (const [tag, lock] of Object.entries(LOCKS)) {
        assert(lock.require.length >= 3, `${tag}: 正向锁太少`);
        assert(lock.forbid.length >= 2, `${tag}: 反向锁太少`);
        for (const needle of lock.require)
            assert(!lock.forbid.includes(needle), `${tag}: 「${needle}」既要求存在又要求消失`);
    }
});
