import assert from "node:assert/strict";
import {test} from "../harness.mjs";

/**
 * 语音朗读。
 *
 * 每个用例装一套自己的假 speechSynthesis，互不干扰。
 * 重点是三种「语音不在预期状态」的情形：还没加载完、一个日语声音都没有、浏览器压根不支持。
 */

const LOCAL = {voiceURI: "local-ja", name: "Local Japanese", lang: "ja-JP", localService: true};
const REMOTE = {voiceURI: "remote-ja", name: "Remote Japanese", lang: "ja", localService: false};

/** 装一套可控的语音环境。`instantWarmUp` 为假时，静音预热样本一直挂着不读完。 */
function speechEnvironment(context, {voices = [], settings = {}, instantWarmUp = true} = {}) {
    const spoken = [];
    const saved = new Map();
    const listeners = new Map();
    let current = voices;
    let cancellations = 0;

    class Utterance {
        constructor(text) {
            this.text = text;
        }
    }

    const synthesis = {
        getVoices: () => current,
        speak: utterance => {
            spoken.push(utterance);
            // 静音预热样本没有可听的音，引擎一开口就读完了。同步收个尾，别让它挂在
            // 队列里冒充「正在播放」。真句子仍然由用例自己决定什么时候读完。
            if (instantWarmUp && utterance.volume === 0) utterance.onend?.();
        },
        cancel: () => cancellations++,
        addEventListener: (name, listener) => {
            const set = listeners.get(name) ?? new Set();
            set.add(listener);
            listeners.set(name, set);
        },
        removeEventListener: (name, listener) => listeners.get(name)?.delete(listener),
    };

    saved.set("akamonkai-speech-v1", JSON.stringify(settings));
    context.globals({
        window: {
            SpeechSynthesisUtterance: Utterance,
            localStorage: {getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value)},
            speechSynthesis: synthesis,
        },
    });

    const {BrowserSpeech} = context.load("src/modules/speech/infrastructure/browser-speech.ts");
    const speech = new BrowserSpeech();
    // initialize 会起一个「宽限期到了还没声音」的定时器，必须登记释放。
    context.cleanup(speech.initialize());
    return {
        speech,
        spoken,
        saved,
        synthesis,
        setVoices(next) {
            current = next;
        },
        refresh() {
            listeners.get("voiceschanged")?.forEach(listener => listener());
        },
        get cancellations() {
            return cancellations;
        },
        settings() {
            return JSON.parse(saved.get("akamonkai-speech-v1"));
        },
    };
}

test("设备语音尚未加载时进入 loading，加载完成后就绪", ["speech:loading", "speech:ready"], context => {
    const env = speechEnvironment(context, {voices: []});
    assert.equal(env.speech.snapshot().deviceStatus, "loading", "刚打开时语音列表可能还没到");

    env.setVoices([{...LOCAL, lang: "en-US"}, REMOTE, LOCAL]);
    env.refresh();
    assert.equal(env.speech.snapshot().deviceStatus, "ready");
    assert.equal(env.speech.snapshot().voices.length, 2, "非日语声音不得进入列表");
    assert.equal(env.speech.snapshot().hiddenVoices, 1, "隐藏了几个声音要报出来");
    assert.deepEqual(env.speech.snapshot().voices.map(voice => voice.id), [REMOTE.voiceURI, LOCAL.voiceURI],
        "留下的声音按浏览器给出的顺序排列");
    assert.deepEqual(env.speech.snapshot().voices.map(voice => voice.japanese), [true, true],
        "留下的声音都标注为日语");
});

test("设备上一个声音都没有时报告 empty，并阻止朗读", ["speech:empty"], async context => {
    const env = speechEnvironment(context, {voices: []});
    // 浏览器的宽限期结束后才认定「真的没有」。
    await new Promise(resolve => setTimeout(resolve, 2600));
    assert.equal(env.speech.snapshot().deviceStatus, "empty");
    assert.equal(env.speech.play([{text: "無音"}], () => {
    }), false, "一个引擎都没报出来时不得开始播放");
    assert.equal(env.speech.snapshot().notice, "ui.speechNoEngine", "要说清是「没有引擎」而不是「没有日语」");

    // 之后声音出现了，必须继续监听而不是永久放弃。
    env.setVoices([REMOTE]);
    env.refresh();
    assert.equal(env.speech.snapshot().deviceStatus, "ready", "迟到的语音列表仍然要接受");
    assert.equal(env.speech.snapshot().selectedVoice, REMOTE.voiceURI);
});

test("只报中文引擎时全部隐藏，报告 no-japanese 并阻止朗读", ["speech:no-japanese"], context => {
    // 系统默认 TTS 是中文引擎的常见情形：声音都在，但没有一个能读日语。
    const chinese = {voiceURI: "zh-tts", name: "Chinese TTS", lang: "zh-CN", localService: true};
    const env = speechEnvironment(context, {voices: [chinese]});
    assert.equal(env.speech.snapshot().deviceStatus, "no-japanese", "有引擎但缺日语声音要单独报告");
    assert.deepEqual(env.speech.snapshot().voices, [], "非日语声音一律不列出");
    assert.equal(env.speech.snapshot().hiddenVoices, 1, "隐藏了几个声音要报出来");

    assert.equal(env.speech.play([{text: "こんにちは"}], () => {
    }), false, "没有日语声音不得开始朗读");
    assert.equal(env.speech.snapshot().notice, "ui.speechNoJapanese", "提示要指向「缺日语语音包」");

    // 装好日语语音包再回来重新检测：声音立刻出现，被隐藏的仍然只有那一个。
    env.setVoices([chinese, REMOTE]);
    env.speech.refreshVoices();
    assert.equal(env.speech.snapshot().deviceStatus, "ready");
    assert.equal(env.speech.snapshot().selectedVoice, REMOTE.voiceURI);
    assert.equal(env.speech.snapshot().hiddenVoices, 1);
});

test("浏览器不支持语音合成时报告 unsupported", ["speech:unsupported"], context => {
    context.globals({window: {localStorage: {getItem: () => null, setItem() {
    }}}});
    const {BrowserSpeech} = context.load("src/modules/speech/infrastructure/browser-speech.ts");
    const speech = new BrowserSpeech();
    context.cleanup(speech.initialize());
    assert.equal(speech.snapshot().deviceStatus, "unsupported");
    assert.equal(speech.speak("日本語", () => {
    }), false);
    speech.stop();
});

test("优先选择本地日语语音，并恢复上次选中的声音", ["speech:offline-preference"], context => {
    const env = speechEnvironment(context, {settings: {voiceURI: REMOTE.voiceURI}});
    env.setVoices([{...LOCAL, lang: "en-US"}, REMOTE, LOCAL]);
    env.refresh();
    assert.equal(env.speech.snapshot().selectedVoice, REMOTE.voiceURI, "延迟加载后要恢复上次的声音");

    // 保存的声音在这台设备上不存在时，回退到本地日语声音。
    const fallback = speechEnvironment(context, {settings: {voiceURI: "missing-on-this-device"}});
    fallback.setVoices([{...LOCAL, lang: "en-US"}, REMOTE, LOCAL]);
    fallback.refresh();
    assert.equal(fallback.speech.snapshot().selectedVoice, LOCAL.voiceURI, "应优先回退到本地日语");

    fallback.speech.selectVoice(LOCAL.voiceURI);
    assert.equal(fallback.settings().voiceURI, LOCAL.voiceURI, "选择必须持久化");
});

test("按角色配音，角色缺失时回退到当前声音", ["speech:role-fallback"], context => {
    const env = speechEnvironment(context);
    env.setVoices([LOCAL, REMOTE]);
    env.refresh();
    env.speech.setRoleVoice("lesson1", "A", REMOTE.voiceURI);
    env.speech.setRoleVoice("lesson1", "我", REMOTE.voiceURI);
    assert.equal(env.speech.roleVoice("lesson2", "我"), REMOTE.voiceURI, "同一角色跨课次复用");
    assert.equal(env.speech.roleVoice("lesson2", "A"), "", "没配过的角色没有专属声音");

    env.speech.speak("回退", () => {
    }, {role: "我", lessonId: "lesson2"});
    assert.equal(env.spoken.at(-1).voice, REMOTE);

    env.setVoices([LOCAL]);
    env.refresh();
    assert.equal(env.speech.roleVoice("lesson2", "我"), "", "声音消失后角色配置失效");
    env.speech.speak("回退", () => {
    }, {role: "我", lessonId: "lesson2"});
    assert.equal(env.spoken.at(-1).voice, LOCAL, "角色缺失时用当前选中的声音");
});

test("连续朗读按队列推进，中途改配置立即生效", ["speech:ready"], context => {
    const env = speechEnvironment(context);
    env.setVoices([LOCAL, REMOTE]);
    env.refresh();
    env.speech.setRoleVoice("lesson1", "A", REMOTE.voiceURI);
    let completed = 0;
    assert(env.speech.play([
        {text: "[日本:にほん]。", role: "A", lessonId: "lesson1"},
        {text: "次。", role: "A", lessonId: "lesson1"},
    ], () => completed++));
    assert.equal(env.spoken.at(-1).text, "にほん。", "振假名剥掉，标点留给引擎");
    assert.equal(env.spoken.at(-1).voice, REMOTE);
    assert.equal(env.spoken.at(-1).lang, "ja");

    const first = env.spoken.at(-1);
    const before = env.spoken.length;
    env.speech.setRoleVoice("lesson1", "A", LOCAL.voiceURI);
    first.onend();
    assert.equal(env.spoken.length, before + 1, "一行读完立刻读下一行");
    assert.equal(env.spoken.at(-1).voice, LOCAL, "每行朗读前重新读取角色配置");
    env.spoken.at(-1).onend();
    assert.equal(completed, 1);
    assert.equal(env.speech.snapshot().playing, false);
});

test("停止只回调一次，朗读失败给出提示", ["speech:ready"], context => {
    const env = speechEnvironment(context);
    env.setVoices([LOCAL]);
    env.refresh();
    let completed = 0;
    env.speech.speak("停止", () => completed++);
    const stale = env.spoken.at(-1).onend;
    env.speech.stop();
    stale();
    assert.equal(completed, 1, "停止后旧回调不得再次触发");
    assert(env.cancellations > 0, "停止必须真的取消浏览器朗读");

    env.speech.speak("失敗", () => completed++);
    env.spoken.at(-1).onerror();
    assert.equal(env.speech.snapshot().notice, "ui.speechFailed");
});

test("语速越界被夹紧，并持久化", ["speech:rate-clamp"], context => {
    const env = speechEnvironment(context, {settings: {rate: 1.3}});
    env.setVoices([LOCAL]);
    env.refresh();
    assert.equal(env.speech.snapshot().rate, 1.3, "保存的语速必须恢复");
    env.speech.speak("速さ", () => {
    });
    assert.equal(env.spoken.at(-1).rate, 1.3, "朗读必须使用保存的语速");

    env.speech.setRate(9);
    assert.equal(env.speech.snapshot().rate, 1.5, "上限夹紧");
    env.speech.setRate(0.1);
    assert.equal(env.speech.snapshot().rate, 0.5, "下限夹紧");
    env.speech.setRate(1);
    assert.equal(env.settings().rate, 1, "语速必须持久化");

    const fresh = speechEnvironment(context);
    assert.equal(fresh.speech.snapshot().rate, 1, "全新安装用正常语速");
});

test("服务端渲染环境没有 window 时不崩溃", ["speech:ssr"], context => {
    context.removeGlobal("window");
    const {BrowserSpeech} = context.load("src/modules/speech/infrastructure/browser-speech.ts");
    const {dialogueLines} = context.load("src/modules/speech/domain/dialogue.ts");
    const speech = new BrowserSpeech();
    context.cleanup(speech.initialize());
    assert.equal(speech.speak("日本語", () => {
    }), false);
    speech.stop();
    // 台词已经结构化，朗读直接读 lines，不再用正则从原文里猜角色。
    assert.deepEqual(dialogueLines({
        kind: "dialogue", id: "l.dialogue.0", questions: [],
        lines: [
            {role: "A", sentences: [{kind: "sentence", text: "一。"}]},
            {role: "B", sentences: [{kind: "sentence", text: "二。"}, {kind: "sentence", text: "三。"}]},
        ],
    }, "l"), [
        {text: "一。", role: "A", lessonId: "l"},
        {text: "二。三。", role: "B", lessonId: "l"},
    ]);
});

/* ── 安卓壳与持久化 ───────────────────────────────────────── */

function memoryStorage(settings) {
    const saved = new Map();
    if (settings) saved.set("akamonkai-speech-v1", JSON.stringify(settings));
    return {
        getItem: key => saved.has(key) ? saved.get(key) : null,
        setItem: (key, value) => saved.set(key, String(value)),
        dump: () => JSON.parse(saved.get("akamonkai-speech-v1") ?? "{}"),
    };
}

test("安卓壳只用系统语音，不发起任何网络请求", ["speech:android-device"], context => {
    const storage = memoryStorage({voiceURI: "local-ja"});
    let requests = 0;
    context.globals({
        window: {
            AndroidSpeech: {},
            localStorage: storage,
            SpeechSynthesisUtterance: class {
                constructor(text) {
                    this.text = text;
                }
            },
            speechSynthesis: {
                getVoices: () => [LOCAL], speak() {
                }, cancel() {
                }, addEventListener() {
                }, removeEventListener() {
                },
            },
        },
        fetch: () => {
            requests++;
            throw new Error("壳里没有要连的服务器");
        },
    });
    const {BrowserSpeech} = context.load("src/modules/speech/infrastructure/browser-speech.ts");
    const speech = new BrowserSpeech();
    context.cleanup(speech.initialize());
    assert.equal(speech.snapshot().voices.length, 1, "设备声音要照常列出");
    assert.equal(speech.snapshot().selectedVoice, "local-ja", "上次选中的声音要恢复");
    assert.equal(requests, 0, "朗读只走系统语音，不得发起网络请求");
});

/* ── 手机浏览器：Chrome for Android 的语音列表来得晚、也不一定标注语言 ── */

/** 安卓引擎常把语音报成 `lang: ""`：没有语言标签，但它就是设备上唯一的声音。 */
const UNTAGGED = {voiceURI: "android-tts", name: "Japanese TTS", lang: "", localService: false};

test("引擎不标注语言时仍当作日语候选，朗读时补上 ja-JP", ["speech:ready"], context => {
    const env = speechEnvironment(context, {voices: [UNTAGGED]});
    assert.equal(env.speech.snapshot().deviceStatus, "ready", "没有语言标签不等于没有声音");
    assert.equal(env.speech.snapshot().voices.length, 1);
    assert.equal(env.speech.snapshot().voices[0].japanese, false, "没有标签就不算「标注为日语」");

    assert(env.speech.speak("こんにちは", () => {
    }));
    assert.equal(env.spoken.at(-1).voice, UNTAGGED);
    assert.equal(env.spoken.at(-1).lang, "ja-JP", "引擎没说语言，就明确要求日语");
});

test("标注了语言的日语声音排在未标注的前面", ["speech:offline-preference"], context => {
    const env = speechEnvironment(context);
    env.setVoices([UNTAGGED, REMOTE]);
    env.refresh();
    assert.deepEqual(env.speech.snapshot().voices.map(voice => voice.id), [REMOTE.voiceURI, UNTAGGED.voiceURI],
        "有标签的优先，但未标注的也要留下");
});

test("空列表先用静音样本唤醒安卓引擎，之后仍能接受迟到的声音", ["speech:loading", "speech:ready"], context => {
    const env = speechEnvironment(context, {voices: []});
    assert.equal(env.speech.snapshot().deviceStatus, "loading");
    assert.equal(env.spoken.length, 1, "空列表必须触发一次唤醒朗读");
    assert.equal(env.spoken[0].volume, 0, "唤醒样本必须静音");
    assert.equal(env.spoken[0].lang, "ja-JP", "唤醒时顺手要求日语");

    env.setVoices([LOCAL]);
    env.refresh();
    assert.equal(env.speech.snapshot().deviceStatus, "ready", "唤醒之后到达的列表照常接受");
    assert.equal(env.speech.snapshot().selectedVoice, LOCAL.voiceURI);
});

test("手动重新检测能拿到刚装好的引擎声音", ["speech:loading", "speech:ready", "speech:empty"], async context => {
    const env = speechEnvironment(context, {voices: []});
    await new Promise(resolve => setTimeout(resolve, 2600));
    assert.equal(env.speech.snapshot().deviceStatus, "empty", "宽限期结束才认定为空");

    // 用户去系统设置装了引擎又回到本页：重新检测要立刻拿到声音。
    env.setVoices([UNTAGGED]);
    env.speech.refreshVoices();
    assert.equal(env.speech.snapshot().deviceStatus, "ready", "重新检测必须重读列表");
    assert.equal(env.speech.snapshot().selectedVoice, UNTAGGED.voiceURI);

    // 引擎又消失了：重新检测要把状态退回「等待」，而不是继续显示旧的列表。
    env.setVoices([]);
    env.speech.refreshVoices();
    assert.equal(env.speech.snapshot().deviceStatus, "loading");
    assert.deepEqual(env.speech.snapshot().voices, []);
});

test("队列还在忙时先等一拍再朗读，避免被 cancel 吞掉", ["speech:ready"], async context => {
    const env = speechEnvironment(context, {voices: [LOCAL]});
    env.refresh();
    const before = env.spoken.length;
    // Chrome 在 cancel 之后同一拍提交的朗读会被丢弃，所以先确认合成器处于忙态。
    env.synthesis.speaking = true;
    env.speech.speak("一拍", () => {
    });
    assert.equal(env.spoken.length, before, "忙态下不得立刻提交");
    assert.equal(env.speech.snapshot().playing, true, "但要立刻进入播放态");

    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(env.spoken.length, before + 1, "队列安静之后再提交");
    assert.equal(env.spoken.at(-1).text, "一拍");
});

test("停止会取消尚未提交的那一拍", ["speech:ready"], async context => {
    const env = speechEnvironment(context, {voices: [LOCAL]});
    env.refresh();
    const before = env.spoken.length;
    env.synthesis.speaking = true;
    env.speech.speak("取消", () => {
    });
    env.speech.stop();
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(env.spoken.length, before, "停止之后不得再补发朗读");
    assert.equal(env.speech.snapshot().playing, false);
});

/* ── 安卓壳：声音列表由原生 TTS 提供，不该走「唤醒」这条路 ── */

test("安卓壳空列表时不发静音样本，靠原生 voiceschanged 补齐", ["speech:android-device", "speech:loading", "speech:ready"], context => {
    const spoken = [];
    const listeners = new Map();
    let current = [];
    context.globals({
        window: {
            AndroidSpeech: {},
            localStorage: {getItem: () => null, setItem() {
            }},
            SpeechSynthesisUtterance: class {
                constructor(text) {
                    this.text = text;
                }
            },
            speechSynthesis: {
                getVoices: () => current,
                speak: utterance => spoken.push(utterance),
                cancel() {
                },
                resume() {
                },
                addEventListener: (name, listener) => {
                    const set = listeners.get(name) ?? new Set();
                    set.add(listener);
                    listeners.set(name, set);
                },
                removeEventListener: (name, listener) => listeners.get(name)?.delete(listener),
            },
        },
    });
    const {BrowserSpeech} = context.load("src/modules/speech/infrastructure/browser-speech.ts");
    const speech = new BrowserSpeech();
    context.cleanup(speech.initialize());
    assert.equal(speech.snapshot().deviceStatus, "loading");
    assert.deepEqual(spoken, [], "壳里不得把静音样本送进原生 TTS");

    // NativeSpeech 初始化完成后自己派发 voiceschanged。
    current = [{voiceURI: "ja-voice", name: "Japanese", lang: "ja-JP", localService: true}];
    listeners.get("voiceschanged")?.forEach(listener => listener());
    assert.equal(speech.snapshot().deviceStatus, "ready", "原生报来的声音必须接受");
    assert.equal(speech.snapshot().selectedVoice, "ja-voice");
});

test("声音一报上来就先热引擎，冷启动不落在第一次播放上", ["speech:ready", "speech:prewarm"], context => {
    const env = speechEnvironment(context, {voices: [LOCAL]});
    const warm = env.spoken[0];
    assert.equal(warm.text, " ", "预热样本不能有可听内容");
    assert.equal(warm.volume, 0, "预热样本必须静音");
    assert.equal(warm.lang, "ja-JP", "顺手把日语语音数据叫进来");

    // 引擎已经热了，第一段立刻开口，不再等 cancel 之后那一拍。
    const before = env.spoken.length;
    assert(env.speech.play([{text: "一行。", lessonId: "l1"}], () => {
    }));
    assert.equal(env.spoken.length, before + 1, "预热之后立刻开口");
    assert.equal(env.spoken.at(-1).text, "一行。", "标点原样交给引擎");
});

test("预热样本还没读完时，既不取消它也不等那一拍", ["speech:ready", "speech:prewarm"], context => {
    // 用户把一个页面加载后的第一个手势落在了播放键上：预热刚发出去，播放就到了。
    const env = speechEnvironment(context, {voices: [LOCAL], instantWarmUp: false});
    assert.equal(env.spoken[0].volume, 0, "队列里躺着的是预热样本");
    const before = env.spoken.length;
    assert(env.speech.play([{text: "一行。", lessonId: "l1"}], () => {
    }));
    assert.equal(env.spoken.length, before + 1, "不能等那一拍才开口");
    assert.equal(env.cancellations, 0, "更不得把刚热好的引擎取消掉——取消等于把冷启动退回去");
});

test("整篇连读一次一句，读这一句时后面两句已经排进引擎", ["speech:continuous", "speech:ready"], context => {
    const env = speechEnvironment(context);
    env.setVoices([LOCAL]);
    env.refresh();
    const {speechLookahead} = context.load("src/modules/speech/infrastructure/browser-speech.ts");
    assert.equal(speechLookahead, 2, "提前两句");
    let completed = 0;
    // 初始化时可能已经送过一条静音唤醒样本，只数这次朗读新增的。
    const before = env.spoken.length;
    const sent = () => env.spoken.slice(before).map(item => item.text);
    const at = index => env.spoken[before + index];
    // 第二句跨了两行：行是排版折断的，要先拼回整句再切。
    assert(env.speech.play([
        {text: "第一句。第二", lessonId: "lesson1"},
        {text: "句。第三句。第四句。", lessonId: "lesson1"},
    ], () => completed++, {join: true}));
    assert.deepEqual(sent(), ["第一句。"], "一次只送一句，标点保留");

    at(0).onstart();
    assert.deepEqual(sent(), ["第一句。", "第二句。", "第三句。"], "第一句开口时，后面两句已经排进去合成");
    at(0).onend();
    assert.equal(sent().length, 3, "排好的句子不会再送一遍");

    at(1).onstart();
    assert.deepEqual(sent(), ["第一句。", "第二句。", "第三句。", "第四句。"], "始终保持往前看两句");
    for (const index of [1, 2, 3]) {
        if (index > 1) at(index).onstart();
        at(index).onend();
    }
    assert.equal(sent().length, 4);
    assert.equal(completed, 1, "读完回调一次");
    assert.equal(env.speech.snapshot().playing, false);
});

test("按句切分：引号里的句号不切，只有标点的片段并进相邻的句子", ["speech:continuous"], context => {
    const {splitSentences, speechChunks} = context.load("src/modules/speech/domain/dialogue.ts");
    assert.deepEqual(splitSentences("今日は晴れです。明日は雨でしょう！本当？"), ["今日は晴れです。", "明日は雨でしょう！", "本当？"]);
    assert.deepEqual(splitSentences("「行きます。」と言った。そうですか？"), ["「行きます。」と言った。", "そうですか？"], "引号里的句号不算句末");
    assert.deepEqual(splitSentences("本当？！ええ。"), ["本当？！", "ええ。"], "连续的句末标点跟着前一句");
    assert.deepEqual(splitSentences("今日は。。明日。"), ["今日は。。", "明日。"], "只有标点的片段并进前一句");
    assert.deepEqual(splitSentences("。。始まり"), ["。。始まり"], "开头的标点并进后一句");
    assert.deepEqual(splitSentences("句点なし"), ["句点なし"]);
    assert.deepEqual(splitSentences("  "), []);
    assert.deepEqual(speechChunks("あ".repeat(150) + "。短い。").map(chunk => chunk.length), [100, 51, 3], "太长的一句仍按 100 字切");
});

test("朗读文本只把振假名换成假名，标点与括号原样保留", ["speech:punctuation-pause"], context => {
    const {spokenText} = context.load("src/modules/speech/domain/dialogue.ts");
    assert.equal(spokenText("[日本:にほん]へ行く。"), "にほんへ行く。", "振假名只读假名");
    assert.equal(spokenText("「行く。」と言った。"), "「行く。」と言った。", "引号括号交给引擎");
    assert.equal(spokenText("  空白  "), "空白", "两端空白去掉");
});

test("长文本按 100 字切条，切点落在标点上", ["speech:continuous"], context => {
    const {splitLongText, utteranceCharLimit} = context.load("src/modules/speech/domain/dialogue.ts");
    assert.equal(utteranceCharLimit, 100, "上限就是 100 字");
    const s1 = "あ".repeat(40) + "。", s2 = "い".repeat(40) + "。", s3 = "う".repeat(40) + "。";
    assert.deepEqual(splitLongText(s1 + s2 + s3), [s1 + s2, s3], "按句号切，标点保留");
    assert.deepEqual(splitLongText("短い。"), ["短い。"], "短文本不动");
    assert.equal(splitLongText("か".repeat(250)).length, 3, "没有标点时硬切");
    const clause = splitLongText("き".repeat(60) + "、" + "く".repeat(60) + "。");
    assert.equal(clause[0].endsWith("、"), true, "没有句号时退到顿号");
});

test("引擎迟迟不开口：跳过一条，连续两条就停下", ["speech:ready"], async context => {
    const env = speechEnvironment(context);
    env.setVoices([LOCAL]);
    env.refresh();
    const {watchdogMs} = context.load("src/modules/speech/infrastructure/browser-speech.ts");
    const saved = {...watchdogMs};
    watchdogMs.start = 20;
    try {
        assert(env.speech.play([
            {text: "一。", lessonId: "l1"},
            {text: "二。", lessonId: "l1"},
        ], () => {
        }), "开口前不会同步失败");
        const before = env.cancellations;
        await new Promise(resolve => setTimeout(resolve, 60));
        assert.equal(env.cancellations, before + 1, "跳过时把卡住的那句从引擎队列里撤掉，否则后面的句子出不来");
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(env.spoken.at(-1).text, "二。", "撤掉之后接着送下一句");
        assert.equal(env.speech.snapshot().playing, false, "连续两条不开口就停下，不再一条条等超时");
        assert.equal(env.speech.snapshot().notice, "ui.speechFailed");
    } finally {
        Object.assign(watchdogMs, saved);
    }
});

test("并段在角色、教材与长度处断开，折断的行直接相接", ["speech:continuous"], context => {
    const {chunkLines} = context.load("src/modules/speech/domain/dialogue.ts");
    const texts = lines => chunkLines(lines).map(chunk => chunk.text);

    assert.deepEqual(texts([{text: "一。", role: "A", lessonId: "l1"}, {text: "二。", role: "A", lessonId: "l1"}]),
        ["一。二。"], "同角色同教材就该并成一段");
    // 换角色必须断开：一段只能用一把声音，并了就换不了人。
    assert.deepEqual(texts([{text: "一。", role: "A", lessonId: "l1"}, {text: "二。", role: "B", lessonId: "l1"}]),
        ["一。", "二。"], "角色变化处必须断开");
    assert.deepEqual(texts([{text: "一。", lessonId: "l1"}, {text: "二。", lessonId: "l2"}]),
        ["一。", "二。"], "教材变化处必须断开");
    // 原文的行是排版折断的，不是句子边界。补一个句号，读出来就是凭空多一句的
    // 停顿——「挤成两行时两行之间卡一下」正是这么来的。
    assert.deepEqual(texts([{text: "前半", lessonId: "l1"}, {text: "後半。", lessonId: "l1"}]),
        ["前半後半。"], "折断的行要直接接上，不补标点");
    // 预算：超过上限就另起一段，免得撞上引擎的单条长度上限。
    const long = chunkLines([{text: "あ".repeat(60) + "。", lessonId: "l1"}, {text: "い".repeat(60) + "。", lessonId: "l1"}], 100);
    assert.equal(long.length, 2, "超出字数预算要断开");
    assert.equal(long[0].text.length <= 100 && long[1].text.length <= 100, true);
    assert.deepEqual(chunkLines([{text: "   ", lessonId: "l1"}, {text: "本文。", lessonId: "l1"}]).map(c => c.text),
        ["本文。"], "空行直接跳过");
});

test("句间停顿：0–5000 毫秒，50 一格，保存后恢复", [], context => {
    const env = speechEnvironment(context, {settings: {pause: 333}});
    assert.equal(env.speech.snapshot().pause, 350, "保存的值对齐到 50 一格");
    env.speech.setPause(9999);
    assert.equal(env.speech.snapshot().pause, 5000, "上限夹紧");
    env.speech.setPause(-10);
    assert.equal(env.speech.snapshot().pause, 0, "下限夹紧");
    env.speech.setPause(1225);
    assert.equal(env.speech.snapshot().pause, 1250);
    assert.equal(env.settings().pause, 1250, "停顿必须持久化");
    assert.equal(speechEnvironment(context).speech.snapshot().pause, 0, "全新安装不加停顿");
});

test("浏览器里设了句间停顿：上一句读完等够了才送下一句", [], async context => {
    const env = speechEnvironment(context);
    env.setVoices([LOCAL]);
    env.refresh();
    env.speech.setPause(50);
    const before = env.spoken.length;
    const sent = () => env.spoken.slice(before).map(item => item.text);
    env.speech.play([{text: "一。二。", lessonId: "l1"}], () => {}, {join: true});
    env.spoken[before].onstart();
    assert.deepEqual(sent(), ["一。"], "排进浏览器队列的句子会紧接着读，所以设了停顿就不提前排");
    env.spoken[before].onend();
    assert.deepEqual(sent(), ["一。"], "停顿期间不送下一句");
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.deepEqual(sent(), ["一。", "二。"], "等够停顿再送");
    env.speech.stop();
});

test("App 里的句间停顿交给原生播放器，提前合成照旧", [], context => {
    const env = speechEnvironment(context);
    // 有 AndroidSpeech 就是在 App 壳里。
    globalThis.window.AndroidSpeech = {};
    env.setVoices([LOCAL]);
    env.refresh();
    env.speech.setPause(800);
    const before = env.spoken.length;
    env.speech.play([{text: "一。二。三。", lessonId: "l1"}], () => {}, {join: true});
    env.spoken[before].onstart();
    const [first, second, third] = env.spoken.slice(before);
    assert.deepEqual([first, second, third].map(item => item.text), ["一。", "二。", "三。"], "后面两句照样提前排进去合成");
    assert.equal(first.pauseBefore, undefined, "第一句不用等");
    assert.equal(second.pauseBefore, 800);
    assert.equal(third.pauseBefore, 800);
    env.speech.stop();
});

test("朗读被外部取消（App 切到后台）时安静结束，不报「朗读失败」", [], context => {
    const env = speechEnvironment(context);
    env.setVoices([LOCAL]);
    env.refresh();
    let completed = 0;
    const before = env.spoken.length;
    env.speech.play([{text: "一。二。", lessonId: "l1"}], () => completed++, {join: true});
    env.spoken[before].onstart();
    // 壳在 onPause 里调 speechSynthesis.cancel()，桥接层给每一句发一个 canceled。
    env.spoken[before].onerror({error: "canceled"});
    assert.equal(env.speech.snapshot().playing, false, "播放结束");
    assert.equal(env.speech.snapshot().notice, "", "不弹朗读失败");
    assert.equal(completed, 1, "读完回调照样走一次，按钮能复位");

    // 真正的合成错误仍然要报。
    const again = env.spoken.length;
    env.speech.play([{text: "三。", lessonId: "l1"}], () => {}, {join: true});
    env.spoken[again].onerror({error: "synthesis-failed"});
    assert.equal(env.speech.snapshot().notice, "ui.speechFailed");
});

test("App 里开口时限更长：合成慢的句子不会被当成卡死撤掉", [], async context => {
    const env = speechEnvironment(context);
    // 有 AndroidSpeech 就是在 App 壳里。
    globalThis.window.AndroidSpeech = {};
    env.setVoices([LOCAL]);
    env.refresh();
    const {watchdogMs} = context.load("src/modules/speech/infrastructure/browser-speech.ts");
    assert.equal(watchdogMs.appStart, 30000, "App 里等 30 秒");
    assert.equal(watchdogMs.start, 15000, "浏览器仍是 15 秒");
    const saved = {...watchdogMs};
    Object.assign(watchdogMs, {start: 20, appStart: 120});
    try {
        const before = env.cancellations;
        env.speech.play([{text: "一。", lessonId: "l1"}], () => {});
        await new Promise(resolve => setTimeout(resolve, 60));
        assert.equal(env.cancellations, before, "超过浏览器的时限、没超过 App 的时限：不撤");
        assert.equal(env.speech.snapshot().notice, "", "也不提示朗读失败");
        await new Promise(resolve => setTimeout(resolve, 120));
        assert.equal(env.cancellations, before + 1, "超过 App 的时限才当成卡死");
        env.speech.stop();
    } finally {
        Object.assign(watchdogMs, saved);
    }
});
