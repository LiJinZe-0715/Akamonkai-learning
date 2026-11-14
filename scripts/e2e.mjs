import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * 真浏览器端到端检查（零依赖，直接用 Chrome DevTools Protocol）。
 *
 * 静态渲染断言只能证明 HTML 结构，证明不了交互、布局与引擎调用。这里用
 * 本机 Chrome 真实打开页面，注入一份可控的语音引擎，验证：
 *   1. 文法页 A/B 对话例句的声优下拉存在、可选、选中后朗读确实换声；
 *   2. 未单独配置的角色回退到整页默认声音；
 *   3. 长句换行时角色名不折行、按钮贴右、译文在行外（之前三次布局 bug）；
 *   4. 首次点击播放直接朗读真句子，队列里没有空白预热样本。
 *
 * 用法：先 `pnpm dev`，再 `pnpm e2e`。脚本会自己探测 dev server 端口，
 * 可用 E2E_BASE、E2E_CHROME、E2E_CDP_PORT 覆盖。
 *
 * CI 里跑的是构建产物：`pnpm build` 之后 `pnpm preview`（4173），
 * 用 E2E_BASE 指到它；容器里需要 E2E_NO_SANDBOX=1 放行 Chrome 沙箱。
 */

// vite 端口被占用时会自动换一个，所以不能写死。
let BASE = (process.env.E2E_BASE ?? "").replace(/\/$/, "");
const CHROME = process.env.E2E_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.E2E_CDP_PORT ?? 9333);
/**
 * CI 的容器里 Chrome 命名空间沙箱常被 seccomp 拦掉，/dev/shm 也偏小。
 * 只在这两个环境变量显式开启时才放宽；本地保持默认沙箱与 shm 行为。
 */
const CHROME_ISOLATION_FLAGS = process.env.E2E_NO_SANDBOX
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
    : [];
const SHOT = path.resolve("logs/e2e-grammar.png");
const LINE_SHOT = path.resolve("logs/e2e-grammar-lines.png");
const PROFILE = path.join(os.tmpdir(), "akamonkai-e2e-chrome");

const GRAMMAR_LESSON = "chukyu-o-manabo-chukyu-zenki.2";      // 有 A/B 对话例句，且本课没有对话模块
const DIALOGUE_LESSON = "try-nihongo-noryoku-shiken-n2.5-1";   // 有真实对话页
/** 故意不用 1.0：只有非默认值才能证明「设置页语速确实传到每条 utterance」。 */
const E2E_RATE = 1.25;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** 页面加载前装一个假的语音引擎：两个日语声音，speak 立刻开口并结束。 */
const INJECT = `
(() => {
  // 页面脚本读偏好之前落地：证明语速不是靠默认值碰巧一致。
  try { localStorage.setItem("akamonkai-speech-v1", JSON.stringify({rate: ${E2E_RATE}})); } catch {}
  window.__spoken = [];
  const voices = [
    {voiceURI: "e2e-voice-a", name: "E2E Voice A", lang: "ja-JP", localService: true},
    {voiceURI: "e2e-voice-b", name: "E2E Voice B", lang: "ja-JP", localService: true},
  ];
  const synth = {
    getVoices: () => voices,
    speak(utterance) {
      window.__spoken.push({
        text: utterance.text,
        voice: utterance.voice && utterance.voice.voiceURI,
        lang: utterance.lang,
        rate: utterance.rate,
      });
      setTimeout(() => utterance.onstart && utterance.onstart(), 0);
      setTimeout(() => utterance.onend && utterance.onend(), 0);
    },
    cancel() { window.__spoken.push({cancel: true}); },
    addEventListener() {}, removeEventListener() {},
    pause() {}, resume() {},
    pending: false, speaking: false, paused: false,
  };
  try { delete window.speechSynthesis; } catch {}
  Object.defineProperty(window, "speechSynthesis", {value: synth, configurable: true});
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
  };
})();
`;

async function waitJson(url, label, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return await response.json();
        } catch { /* 端口还没起来 */ }
        await sleep(150);
    }
    throw new Error(`${label} 未就绪：${url}`);
}

function connect(url) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        socket.addEventListener("open", () => resolve(socket), {once: true});
        socket.addEventListener("error", reject, {once: true});
    });
}

/** 一个 CDP 会话：按 id 配对请求与响应。 */
function session(socket) {
    let next = 0;
    const pending = new Map();
    socket.addEventListener("message", event => {
        const message = JSON.parse(String(event.data));
        if (!message.id) return;
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(`${message.error.message} (${message.error.code})`));
        else entry.resolve(message.result);
    });
    return (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++next;
        pending.set(id, {resolve, reject});
        socket.send(JSON.stringify({id, method, params}));
    });
}

async function evaluate(send, expression) {
    const result = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) {
        throw new Error("页面脚本异常：" +
            (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
    }
    return result.result.value;
}

async function waitFor(send, expression, label, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await evaluate(send, `!!(${expression})`)) return;
        await sleep(150);
    }
    const state = await evaluate(send, `({
        url: location.href,
        text: document.body.innerText.slice(0, 240),
        selects: document.querySelectorAll("select").length,
        jlines: document.querySelectorAll(".jline").length,
    })`);
    throw new Error(`等待「${label}」超时：${JSON.stringify(state)}`);
}

/** 改 select 的值并走 React 的 onChange（必须用原生 setter）。 */
async function selectVoice(send, labelPattern, value) {
    const result = await evaluate(send, `(() => {
        const re = new RegExp(${JSON.stringify(labelPattern)});
        const label = [...document.querySelectorAll(".speech-controls.speech-roles label")]
            .find(item => re.test(item.firstChild?.textContent ?? ""));
        if (!label) return {ok: false, reason: "找不到标签 " + re};
        const select = label.querySelector("select");
        if (!select) return {ok: false, reason: "标签里没有 select"};
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(select, ${JSON.stringify(value)});
        select.dispatchEvent(new Event("change", {bubbles: true}));
        return {ok: true, value: select.value};
    })()`);
    assert(result.ok, result.reason);
    assert.equal(result.value, value, `下拉没选中 ${value}`);
}

async function playRole(send, role) {
    const clicked = await evaluate(send, `(() => {
        const row = [...document.querySelectorAll(".jline.has-role")].find(item =>
            (item.querySelector(".jline-role")?.textContent ?? "").trim().startsWith(${JSON.stringify(role)}));
        if (!row) return false;
        row.querySelector(".icon-button")?.click();
        return true;
    })()`);
    assert(clicked, `找不到角色 ${role} 的朗读按钮`);
    await waitFor(send, "window.__spoken.some(entry => entry.text)", `角色 ${role} 的朗读`);
    return evaluate(send, "window.__spoken.filter(entry => entry.text).map(entry => ({text: entry.text, voice: entry.voice, rate: entry.rate}))");
}

async function resolveBase() {
    const candidates = ["http://127.0.0.1:5173", "http://127.0.0.1:4173",
        "http://127.0.0.1:4174", "http://127.0.0.1:4175"];
    for (const candidate of candidates) {
        // 端口上可能是别的本地服务：确认返回的是本项目页面再连。
        const html = await fetch(candidate).then(response => response.ok ? response.text() : "").catch(() => "");
        if (html.includes("akamonkai.theme")) return candidate;
    }
    throw new Error(`没找到开发服务器（试过 ${candidates.join("、")}），先运行 pnpm dev，或用 E2E_BASE 指定`);
}

async function main() {
    await fs.mkdir(path.dirname(SHOT), {recursive: true});
    BASE ||= await resolveBase();
    console.log("· 开发服务器：", BASE);

    const chrome = spawn(CHROME, [
        "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        ...CHROME_ISOLATION_FLAGS,
        `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
        "--window-size=1280,900", "about:blank",
    ], {stdio: "ignore"});

    let socket;
    let browserSocket;
    try {
        await waitJson(`http://127.0.0.1:${PORT}/json/version`, "Chrome 调试端口");
        const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(response => response.json());
        const page = targets.find(target => target.type === "page");
        assert(page, "没有可用的浏览器页面 target");
        socket = await connect(page.webSocketDebuggerUrl);
        const send = session(socket);
        await send("Page.enable");
        await send("Runtime.enable");
        await send("Emulation.setDeviceMetricsOverride",
            {width: 1280, height: 900, deviceScaleFactor: 1, mobile: false});
        await send("Page.addScriptToEvaluateOnNewDocument", {source: INJECT});

        /* ── 1. 文法页：声优栏 ─────────────────────────────── */
        await send("Page.navigate", {url: `${BASE}/?unit=${GRAMMAR_LESSON}&view=grammar`});
        await waitFor(send, "document.querySelector('.grammar-article')", "文法条目渲染");
        await waitFor(send, "document.querySelector('.speech-controls.speech-roles select')", "文法页声优栏");

        const bar = await evaluate(send, `(() => {
            const section = document.querySelector(".speech-controls.speech-roles");
            return {
                labels: [...section.querySelectorAll("label")].map(item => item.firstChild?.textContent?.trim() ?? ""),
                selects: section.querySelectorAll("select").length,
                disabled: [...section.querySelectorAll("select")].some(item => item.disabled),
            };
        })()`);
        assert.equal(bar.selects, 3, `文法页应有「默认声音 + A + B」三个下拉，实际 ${bar.selects}：${bar.labels}`);
        assert(bar.labels.some(label => /默认声音|Default voice/.test(label)), `缺少默认声音下拉：${bar.labels}`);
        assert(bar.labels.some(label => label.startsWith("A")), `缺少 A 的下拉：${bar.labels}`);
        assert(bar.labels.some(label => label.startsWith("B")), `缺少 B 的下拉：${bar.labels}`);
        assert(!bar.disabled, "注入的日语声音没被识别，下拉是禁用的");
        console.log("✓ 文法页声优栏：", bar.labels.join(" / "));

        // 课页要能直接调语速，而不是只能回设置页；滑杆的值还得是保存下来的那个。
        const rateInput = await evaluate(send, `(() => {
            const input = document.querySelector(".speech-controls input[type='range']");
            return input ? {value: Number(input.value), label: input.closest("label")?.firstChild?.textContent?.trim()} : null;
        })()`);
        assert(rateInput, "课页声优栏缺少语速滑杆");
        assert.equal(rateInput.value, E2E_RATE, `课页语速没读到设置里保存的值：${JSON.stringify(rateInput)}`);
        console.log("✓ 课页语速滑杆：", JSON.stringify(rateInput));

        /* ── 2. 选中后朗读真的换声 ─────────────────────────── */
        await selectVoice(send, "默认声音|Default voice", "e2e-voice-b");
        await selectVoice(send, "^A", "e2e-voice-a");
        await sleep(100); // 等 React 状态与 localStorage 落地

        const forA = await playRole(send, "A");
        assert.equal(forA.at(-1).voice, "e2e-voice-a", `A 没用专属声音：${JSON.stringify(forA)}`);
        assert(forA.every(entry => entry.rate === E2E_RATE), `A 的例句没带上设置语速：${JSON.stringify(forA)}`);
        console.log("✓ A 用专属声音：", forA.at(-1).voice, "／", forA.at(-1).text.slice(0, 24));

        await evaluate(send, "window.__spoken = []");
        const forB = await playRole(send, "B");
        assert.equal(forB.at(-1).voice, "e2e-voice-b", `B 应回退到默认声音：${JSON.stringify(forB)}`);
        assert(forB.every(entry => entry.rate === E2E_RATE), `B 的例句没带上设置语速：${JSON.stringify(forB)}`);
        console.log("✓ B 回退默认声音：", forB.at(-1).voice, "／", forB.at(-1).text.slice(0, 24));

        /* ── 3. 截图（在改动 DOM 之前） ────────────────────── */
        const shot = await send("Page.captureScreenshot", {format: "png"});
        await fs.writeFile(SHOT, Buffer.from(shot.data, "base64"));
        console.log("✓ 截图：", SHOT);

        /* ── 4. 布局：人为把例句撑到换行 ───────────────────── */
        const layout = await evaluate(send, `(() => {
            // 只跟这一行紧邻的说明块比；拿页面第一个说明块比会错配到别的例句。
            const row = [...document.querySelectorAll(".jline.has-role")]
                .find(item => item.nextElementSibling?.classList.contains("jline-note"))
                ?? document.querySelector(".jline.has-role");
            if (!row) return null;
            const role = row.querySelector(".jline-role");
            const text = row.querySelector(".jline-text");
            const button = row.querySelector(".icon-button");
            const note = row.nextElementSibling?.classList.contains("jline-note") ? row.nextElementSibling : null;
            text.textContent = "これは非常に長い日本語の例文です。".repeat(12);
            row.scrollIntoView({block: "center"});
            const r = row.getBoundingClientRect();
            const b = button.getBoundingClientRect();
            const c = role.getBoundingClientRect();
            const n = note?.getBoundingClientRect();
            return {
                roleRects: role.getClientRects().length,
                roleWidth: c.width,
                roleScrollWidth: role.scrollWidth,
                roleHeight: c.height,
                roleLineHeight: parseFloat(getComputedStyle(role).lineHeight),
                buttonGap: r.right - b.right,
                noteBelow: n ? n.top >= r.bottom - 1 : null,
                noteInside: !!row.querySelector(".jline-note"),
                wrapped: r.height > c.height * 1.5,
            };
        })()`);
        assert(layout, "找不到可检查的对话行");
        const lineShot = await send("Page.captureScreenshot", {format: "png"});
        await fs.writeFile(LINE_SHOT, Buffer.from(lineShot.data, "base64"));
        console.log("✓ 长句截图：", LINE_SHOT);
        assert(layout.wrapped, "测试文本没能把句子撑到换行，布局断言没有意义");
        assert.equal(layout.roleRects, 1, `长句换行时角色名被折行了：${JSON.stringify(layout)}`);
        assert(layout.roleWidth >= layout.roleScrollWidth - 1, `角色名列被压缩：${JSON.stringify(layout)}`);
        assert(layout.roleHeight <= layout.roleLineHeight * 1.6, `角色名高度异常：${JSON.stringify(layout)}`);
        assert(Math.abs(layout.buttonGap) <= 2, `朗读按钮没贴在行尾：${JSON.stringify(layout)}`);
        assert(!layout.noteInside, `说明块被塞进日语行内部：${JSON.stringify(layout)}`);
        assert.equal(layout.noteBelow, true, `译文块没有挂在日语行下方：${JSON.stringify(layout)}`);
        console.log("✓ 长句布局：", JSON.stringify(layout));

        /* ── 5. 首次播放：不排空白预热样本 ─────────────────── */
        // 一行日文可能由多个 Sentence 拼成，语音层会按句拆成多条 utterance，
        // 所以这里只断言「每条都非空」，不要求只排一条。
        await send("Page.navigate", {url: `${BASE}/?unit=${DIALOGUE_LESSON}&view=dialogues`});
        await waitFor(send, "document.querySelector('.jline.has-role .icon-button')", "对话页渲染");
        const before = await evaluate(send, "window.__spoken");
        console.log("· 加载时引擎调用：", JSON.stringify(before));
        assert.equal(before.filter(entry => entry.text !== undefined).length, 0,
            `页面刚加载就不该有朗读样本：${JSON.stringify(before)}`);
        const button = await evaluate(send, `(() => {
            const b = document.querySelector(".jline.has-role .icon-button");
            return {label: b.getAttribute("aria-label"), parent: b.parentElement.className};
        })()`);
        console.log("· 点击的按钮：", JSON.stringify(button));
        await evaluate(send, `document.querySelector(".jline.has-role .icon-button").click(); true`);
        await sleep(700);
        const first = await evaluate(send, "window.__spoken");
        console.log("· 首次播放调用：", JSON.stringify(first));
        const spoken = first.filter(entry => entry.text !== undefined);
        assert(spoken.length > 0, `首次点击没有朗读任何句子：${JSON.stringify(first)}`);
        assert(spoken.every(entry => entry.text.trim().length > 0),
            `队列里混进了空白预热样本：${JSON.stringify(first)}`);
        assert(spoken.every(entry => entry.rate === E2E_RATE),
            `对话页单行朗读没带上设置语速：${JSON.stringify(spoken)}`);
        console.log("✓ 首次播放：", JSON.stringify(spoken.map(entry => entry.text.slice(0, 20))));

        /* ── 6. 整段连续朗读：play(lines) 的每条都带语速 ───── */
        await evaluate(send, "window.__spoken = []");
        const continuous = await evaluate(send, `(() => {
            const button = document.querySelector(".passage-toolbar .icon-button");
            if (!button) return false;
            button.click();
            return true;
        })()`);
        assert(continuous, "对话页找不到整段连续朗读按钮");
        await sleep(700);
        const all = await evaluate(send, "window.__spoken");
        const lines = all.filter(entry => entry.text !== undefined);
        assert(lines.length > 0, `整段连读没有送出任何句子：${JSON.stringify(all)}`);
        assert(lines.every(entry => entry.rate === E2E_RATE),
            `整段连读有句子漏掉设置语速：${JSON.stringify(lines.map(entry => entry.rate))}`);
        console.log("✓ 整段连读：", lines.length, "句，语速全部", E2E_RATE + "×");

        /* ── 7. 真题页：言語知識 / 読解 / 聴解 三大块切换 ────── */
        // 考试 id 从编译产物里取，加新卷子不用改这里。
        const catalog = JSON.parse(await fs.readFile(path.resolve("public/content/catalog.json"), "utf8"));
        const exam = catalog.exams[0];
        assert(exam, "目录里没有真题，无法检查真题页");
        // Chrome 用固定 profile，上次运行结束时真题页的 pagehide 会把整卷答案写回草稿。
        // 必须在真题页尚未挂载时清掉：否则紧接着的 reload 又会触发 pagehide 把旧状态写回来，
        // 后面的「跳到未答」检查就会看到一份已经答满的卷子。
        await evaluate(send, `(() => {
            for (const key of Object.keys(localStorage))
                if (key.startsWith("akamonkai.assessment-draft.v1:") && key.endsWith(":exam"))
                    localStorage.removeItem(key);
            return true;
        })()`);
        await send("Page.navigate", {url: `${BASE}/?exam=${encodeURIComponent(exam.id)}`});
        await waitFor(send, "document.querySelector('.paged-modules button')", "真题页模块条");

        const examProbe = `(() => {
            const active = document.querySelector(".paged-page[data-active='true']");
            return {
                modules: [...document.querySelectorAll(".paged-modules button")]
                    .map(button => button.textContent.trim().replace(/\\s+/g, " ")),
                current: [...document.querySelectorAll(".paged-modules button")]
                    .findIndex(button => button.getAttribute("aria-current") === "true"),
                page: document.querySelector(".paged-count")?.textContent.trim().replace(/\\s+/g, " "),
                module: active?.querySelector(".exam-section-module")?.textContent.trim(),
            };
        })()`;

        const opening = await evaluate(send, examProbe);
        assert.equal(opening.modules.length, 3, `真题页模块条应有 3 块：${JSON.stringify(opening.modules)}`);
        assert.deepEqual(opening.modules.map(text => text.replace(/\d+$/, "")), ["言語知識", "読解", "聴解"],
            `模块条顺序不对：${JSON.stringify(opening.modules)}`);
        assert.equal(opening.current, 0, `首屏应高亮言語知識：${JSON.stringify(opening)}`);
        assert.equal(opening.module, "言語知識", `首屏小节不属于言語知識：${JSON.stringify(opening)}`);

        // 点「読解」要直接落到読解第一节，页码和高亮一起变。
        await evaluate(send, `document.querySelectorAll(".paged-modules button")[1].click(); true`);
        await sleep(300);
        const jumped = await evaluate(send, examProbe);
        assert.equal(jumped.module, "読解", `点読解后没跳到読解的节：${JSON.stringify(jumped)}`);
        assert.equal(jumped.current, 1, `点読解后高亮没跟上：${JSON.stringify(jumped)}`);
        assert.notEqual(jumped.page, opening.page, `点読解后页码没动：${JSON.stringify(jumped)}`);

        // 翻页时高亮要跟着当前节走，不能钉在第一次点的位置。
        await evaluate(send, `document.querySelectorAll(".paged-row > .paged-step")[1].click(); true`);
        await sleep(300);
        const turned = await evaluate(send, examProbe);
        assert.equal(turned.current, 1, `翻页后高亮跑偏：${JSON.stringify(turned)}`);
        assert.equal(turned.module, "読解", `翻页后仍应在読解：${JSON.stringify(turned)}`);
        console.log("✓ 真题三大块切换：", opening.page, "→", jumped.page, "→", turned.page, "／",
            opening.modules.join(" "));

        /* 同一节：全卷只有一个播放器，常驻翻页条，焦点不抢翻页快捷键。 */
        const audioProbe = `(() => {
            const box = document.querySelector(".exam-audio");
            return {
                count: document.querySelectorAll(".exam-audio audio").length,
                hidden: box ? getComputedStyle(box).display === "none" : null,
                same: box?.dataset.e2e === "kept",
                page: document.querySelector(".paged-count")?.textContent.trim().replace(/\\s+/g, " "),
            };
        })()`;

        // 先回言語知識并给播放器打标记：被卸载重建就会丢。
        await evaluate(send, `document.querySelectorAll(".paged-modules button")[0].click(); true`);
        await sleep(300);
        const marked = await evaluate(send, `(() => {
            const box = document.querySelector(".exam-audio");
            if (!box) return false;
            box.dataset.e2e = "kept";
            return true;
        })()`);
        assert(marked, "真题页没有常驻播放器");
        const inKnowledge = await evaluate(send, audioProbe);
        assert.equal(inKnowledge.count, 1, `全卷应只有一个播放器：${JSON.stringify(inKnowledge)}`);
        assert.equal(inKnowledge.hidden, true, `言語知識页不该显示播放器：${JSON.stringify(inKnowledge)}`);

        // 点「聴解」后显示，且仍是同一个元素。
        await evaluate(send, `document.querySelectorAll(".paged-modules button")[2].click(); true`);
        await sleep(300);
        const inListening = await evaluate(send, audioProbe);
        assert.equal(inListening.hidden, false, `聴解页应显示播放器：${JSON.stringify(inListening)}`);
        assert.equal(inListening.count, 1, `切到聴解后播放器数量不对：${JSON.stringify(inListening)}`);
        assert.equal(inListening.same, true, `切到聴解时播放器被重建：${JSON.stringify(inListening)}`);

        // 翻到聴解的下一节，仍是同一个元素。
        await evaluate(send, `document.querySelectorAll(".paged-row > .paged-step")[1].click(); true`);
        await sleep(300);
        const turnedListening = await evaluate(send, audioProbe);
        assert.notEqual(turnedListening.page, inListening.page, "没翻到聴解的下一节");
        assert.equal(turnedListening.same, true, `翻页时播放器被重建：${JSON.stringify(turnedListening)}`);
        assert.equal(turnedListening.hidden, false, `聴解下一节仍应显示播放器：${JSON.stringify(turnedListening)}`);

        // 焦点在播放器上时，←→ 属于播放器，不该翻页。
        await evaluate(send, `(() => {
            const audio = document.querySelector(".exam-audio audio");
            audio.focus();
            audio.dispatchEvent(new KeyboardEvent("keydown", {
                key: "ArrowRight", bubbles: true, cancelable: true,
            }));
            return true;
        })()`);
        await sleep(300);
        const afterKey = await evaluate(send,
            `document.querySelector(".paged-count").textContent.trim().replace(/\\s+/g, " ")`);
        assert.equal(afterKey, turnedListening.page, "焦点在播放器上时 ArrowRight 不该翻页");
        console.log("✓ 真题听力：", inListening.page, "→", turnedListening.page, "／单个播放器，翻页不重建");

        /* 同一节：作答草稿在刷新后仍在（防抖写入真的落了盘）。 */
        const draftKey = "akamonkai.assessment-draft.v1:" + exam.id + ":exam";
        await evaluate(send, `localStorage.removeItem(${JSON.stringify(draftKey)}); true`);
        await send("Page.reload", {ignoreCache: true});
        await sleep(300);
        await waitFor(send, "document.querySelector('.paged-page[data-active=true] .question input')", "真题题目");
        await evaluate(send, `(() => {
            const radio = document.querySelector('.paged-page[data-active=true] .question input[type="radio"]');
            radio.click();
            return true;
        })()`);
        await sleep(400);
        await send("Page.reload", {ignoreCache: true});
        await sleep(300);
        await waitFor(send, "document.querySelector('.paged-page[data-active=true] .question input')", "刷新后的真题题目");
        const restored = await evaluate(send, `(() => {
            const first = document.querySelector('.paged-page[data-active=true] .question');
            const radios = first ? [...first.querySelectorAll('input[type="radio"]')] : [];
            return {checked: radios.findIndex(input => input.checked)};
        })()`);
        assert.equal(restored.checked, 0, `刷新后第一题的选择没有恢复：${JSON.stringify(restored)}`);
        await evaluate(send, `localStorage.removeItem(${JSON.stringify(draftKey)}); true`);
        console.log("✓ 真题作答草稿：刷新后选中状态仍在");

        /* 同一节：漏答按钮能跳到第一道未答题，答满后消失且可以提交。 */
        const beforeJump = await evaluate(send, `(() => {
            const button = document.querySelector(".paged-jump-unanswered");
            const target = [...document.querySelectorAll(".paged-page .question")].find(node =>
                ![...node.querySelectorAll('input[type="radio"]')].some(input => input.checked));
            return {
                label: button?.textContent.trim() ?? null,
                page: document.querySelector(".paged-count")?.textContent.trim().replace(/\\s+/g, " "),
                target: target?.id ?? null,
            };
        })()`);
        assert(beforeJump.label && /未答|unanswered/i.test(beforeJump.label),
            `未显示跳到未答按钮：${JSON.stringify(beforeJump)}`);
        assert(beforeJump.target, "没有找到第一道未答题");

        await evaluate(send, `document.querySelector(".paged-jump-unanswered").click(); true`);
        await sleep(300);
        const landed = await evaluate(send, `(() => {
            const active = document.querySelector(".paged-page[data-active=true]");
            return {
                hasTarget: [...active.querySelectorAll(".question")]
                    .some(node => node.id === ${JSON.stringify(beforeJump.target)}),
                page: document.querySelector(".paged-count")?.textContent.trim().replace(/\\s+/g, " "),
            };
        })()`);
        assert(landed.hasTarget, `跳转后没有落在第一道未答题所在的一节：${JSON.stringify(landed)}`);

        // 逐题点选，每次让 React 提交一次渲染，避免同一批更新互相覆盖。
        const total = await evaluate(send, `(async () => {
            const radios = [...document.querySelectorAll('.paged-page .question input[type="radio"][value="0"]')];
            for (const radio of radios) {
                if (!radio.checked) {
                    radio.click();
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            return radios.length;
        })()`);
        assert(total > 0, "没有找到可作答的题目");
        await sleep(300);
        const finished = await evaluate(send, `(() => ({
            jump: !!document.querySelector(".paged-jump-unanswered"),
            disabled: document.querySelector(".submit-area .primary-button")?.disabled,
        }))()`);
        assert.equal(finished.jump, false, "答满后跳到未答按钮应消失");
        assert.equal(finished.disabled, false, "答满后提交全部应可用");
        await evaluate(send, `localStorage.removeItem(${JSON.stringify(draftKey)}); true`);
        console.log("✓ 真题漏答：", beforeJump.label, "／", total, "题答满后按钮消失、提交可用");

        console.log("\n全部端到端检查通过。");
    } finally {
        // 让浏览器自己退出，比 kill 干净；失败时 kill 兜底。
        try {
            const version = await waitJson(`http://127.0.0.1:${PORT}/json/version`, "关闭 Chrome", 1500);
            browserSocket = await connect(version.webSocketDebuggerUrl);
            session(browserSocket)("Browser.close").catch(() => {});
            await sleep(200);
        } catch { /* 端口已经没了 */ }
        socket?.close();
        browserSocket?.close();
        chrome.kill();
    }
}

main().catch(error => {
    console.error("\n✗ 端到端检查失败：", error.message);
    process.exitCode = 1;
});
