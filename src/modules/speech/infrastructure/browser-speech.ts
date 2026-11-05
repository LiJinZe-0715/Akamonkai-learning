import type {UiTextId} from "../../localization/public";
import type {PlayOptions, SpeechLine, SpeechState, SpeechUseCases} from "../application/contracts";

import {japaneseVoices, taggedJapanese} from "../domain/device-voices";
import {chunkLines, speechChunks, spokenText} from "../domain/dialogue";
import {clampSpeechPause, clampSpeechRate, speechPause, speechRate} from "../domain/rate";
import {roleVoiceKey} from "../domain/roles";

/** 读者所选声音、语速与逐角色设置的存储键。 */
const storageKey = "akamonkai-speech-v1";

/**
 * 手机把声音列表交出来得很晚。
 *
 * Chrome for Android 按需绑定 TTS 服务：在有人要求引擎开口之前，
 * `getVoices()` 一直返回空列表，即便开口了，列表也可能再过几秒才到。
 * 所以页面先留一小段宽限期，之后才判定列表为空，并继续轮询一段时间；
 * 标签页回到前台或读者点一下页面时，都会重新检查。
 */
const voiceGraceMs = 2500;
const voicePollMs = 800;
const voiceSearchMs = 20000;
/** 静音预热用来唤醒 Android 引擎，不必每次点击都重复。 */
const warmUpIntervalMs = 4000;
/**
 * 一次预热能管多久。
 *
 * 引擎把日语语音数据读进来之后会留着，不用每次播放前都热一遍；但被浏览器拦下的那次
 * 预热什么也没热到，所以这个窗口只用来挡住「同一秒里连点几下」的重复，不当作保质期。
 */
const warmSpanMs = 3000;
/** 预热样本迟迟不回报「读完」（被引擎吞了）时，别让标记赖着不走。 */
const warmLimitMs = 4000;
/* Chrome 会丢掉与 `cancel()` 同一时序入队的语句，给队列留一拍。 */
const cancelSettleMs = 120;
/**
 * 引擎迟迟不开口，就认为这一条的回调丢了。
 *
 * 系统 TTS 引擎（尤其本地神经引擎）偶发整条不回调：speak 返回成功，却既没有 start 也
 * 没有 end。没有超时的话界面会永远停在「播放中」，只能手动停。
 *
 * 浏览器 15 秒足够覆盖模型冷加载。App 里要先把整句合成成文件才开口，VOICEVOX 被系统
 * 冻结过之后，一句实测要 15–25 秒；15 秒的时限会把正在合成的句子当成卡死撤掉，
 * 所以 App 里放宽到 30 秒（appStart）。
 */
/** 导出是为了让用例不必真等这么久。 */
export const watchdogMs = {start: 15000, appStart: 30000, end: 60000};

/**
 * 交替渲染时提前排进引擎几句。
 *
 * 引擎按顺序合成：只提前一句时，短句后面跟着长句就来不及（短句读 2–3 秒，长句合成要
 * 4–6 秒），中间会停。提前两句，长句有两句的播放时间去合成。再多收益很小，停止或换角色
 * 时要扔掉的却更多。
 */
export const speechLookahead = 2;

/** 有些引擎把 `lang` 留空，所以明确指定语言，不能碰运气。 */
const fallbackLang = "ja-JP";

/**
 * Android 壳通过系统 TTS 桥应答，静音预热在那里没有意义：
 * 原生引擎自己会报出声音，而一个多余的空格反而会被真正的引擎念出来。
 */
function deviceOnly(): boolean {
    return typeof window !== "undefined" && "AndroidSpeech" in window;
}

interface Settings {
    voiceURI?: string;
    rate?: number;
    pause?: number;
    roles?: Record<string, string>;
}

/**
 * 用操作系统自带的声音朗读。
 *
 * 不需要启动什么，也不走网络：页面向平台要声音列表，读者挑一个
 * （或按角色各挑一个），剩下的交给浏览器或壳自带的合成器。
 */
export class BrowserSpeech implements SpeechUseCases {
    private state: SpeechState = {
        voices: [], hiddenVoices: 0, deviceStatus: "loading", selectedVoice: "",
        playing: false, notice: "", rate: speechRate.default, pause: speechPause.default,
    };
    private settings: Settings = {};
    /** 设备原始声音列表，与对外列表分开保存，朗读时可以直接用。 */
    private voices: SpeechSynthesisVoice[] = [];
    /** 引擎报出的声音总数，过滤日语之前的数量。 */
    private reported = 0;
    private listeners = new Set<() => void>();
    private generation = 0;
    /** 已经交给引擎、还没读完的句子（正在读的那句和排在它后面的下一句）。 */
    private utterances: SpeechSynthesisUtterance[] = [];
    private completion?: () => void;
    /** 只在页面等待声音列表期间存在的定时器与监听器。 */
    private grace?: ReturnType<typeof setTimeout>;
    private poll?: ReturnType<typeof setInterval>;
    private settle?: ReturnType<typeof setTimeout>;
    /** 浏览器里句间停顿的计时器。 */
    private gap?: ReturnType<typeof setTimeout>;
    /** 队列里现在只有我们自己放的那条静音预热样本。 */
    private warming = false;
    private warmTimer?: ReturnType<typeof setTimeout>;
    private watchers: Array<() => void> = [];
    private startWatch?: ReturnType<typeof setTimeout>;
    private endWatch?: ReturnType<typeof setTimeout>;
    /** 连续几条引擎都没开口；成功开口就清零。 */
    private silentChunks = 0;
    private warmedAt = 0;
    snapshot = () => this.state;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    initialize() {
        if (typeof window === "undefined") return () => {
        };
        try {
            const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
            if (saved && typeof saved === "object" && !Array.isArray(saved)) {
                this.settings = {
                    voiceURI: typeof saved.voiceURI === "string" ? saved.voiceURI : undefined,
                    rate: typeof saved.rate === "number" ? clampSpeechRate(saved.rate) : speechRate.default,
                    pause: typeof saved.pause === "number" ? clampSpeechPause(saved.pause) : speechPause.default,
                    roles: saved.roles && typeof saved.roles === "object" && !Array.isArray(saved.roles) ? saved.roles : {},
                };
            }
        } catch { /* 偏好设置无效或读不到时用默认值。 */
        }
        this.update({rate: this.settings.rate ?? speechRate.default, pause: this.settings.pause ?? speechPause.default});
        const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
        const synthesis = supported ? window.speechSynthesis : undefined;
        const refresh = () => {
            this.syncVoices();
            // 声音一报上来就先热一次：桌面浏览器的第一次 speak() 要绑定系统语音引擎、
            // 把日语语音数据读进内存，这份开销落在页面加载里，比落在第一次点播放上好。
            if (this.reported) this.prewarm();
        };
        if (!synthesis) {
            this.update({deviceStatus: "unsupported"});
        } else {
            synthesis.addEventListener("voiceschanged", refresh);
            refresh();
            // 还没有可用声音：唤醒引擎，继续盯着它的列表。
            if (!this.reported) {
                this.warmUp();
                this.watchVoices();
            }
            // 页面刚起来时还没有用户手势，Chrome 会直接拒绝 speak()——上面那次预热在
            // 桌面上注定落空。等第一个手势（点导航、点播放、敲键盘都算）再热一次，
            // 把冷启动从「点播放之后」挪到「点播放之前」。
            const wake = () => this.prewarm();
            this.watch(window, "pointerdown", wake);
            this.watch(window, "keydown", wake);
        }
        return () => {
            if (synthesis) synthesis.removeEventListener("voiceschanged", refresh);
            this.stopWatching();
            this.stop();
        };
    }

    setPause(milliseconds: number) {
        const clamped = clampSpeechPause(milliseconds);
        if (clamped === this.state.pause) return;
        this.settings.pause = clamped;
        this.update({pause: clamped});
        this.save();
    }

    setRate(rate: number) {
        const clamped = clampSpeechRate(rate);
        if (clamped === this.state.rate) return;
        this.settings.rate = clamped;
        this.update({rate: clamped});
        this.save();
    }

    /**
     * 读者在页面开着的时候换了系统 TTS，或者首次查询返回空列表：
     * 重新向浏览器询问，并像加载时一样等待同样的宽限期。
     */
    refreshVoices() {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        this.update({deviceStatus: "loading", notice: ""});
        this.warmUp();
        this.syncVoices();
        if (!this.reported) this.watchVoices();
    }

    selectVoice(id: string) {
        if (!this.state.voices.some(voice => voice.id === id)) return;
        this.settings.voiceURI = id;
        this.update({selectedVoice: id});
        this.save();
    }

    roleVoice(lessonId: string, role: string) {
        const id = this.settings.roles?.[roleVoiceKey(lessonId, role)];
        return this.state.voices.some(voice => voice.id === id) ? id! : "";
    }

    setRoleVoice(lessonId: string, role: string, id: string) {
        if (id && !this.state.voices.some(voice => voice.id === id)) return;
        this.settings.roles ??= {};
        this.settings.roles[roleVoiceKey(lessonId, role)] = id;
        this.save();
        this.update({});
    }

    speak(text: string, onEnd: () => void, context?: Omit<SpeechLine, "text">) {
        return this.play([{text, ...context}], onEnd);
    }

    play(lines: SpeechLine[], onEnd: () => void, options?: PlayOptions) {
        // 先读再取消：队列还忙着时，紧接着的下一句会被吞掉。
        // 队列里只有我们自己放的那条静音样本时不算忙——取消它等于把刚热好的引擎连同
        // 冷启动一起退回去，第一段又得从头等一遍。空格不占时间，真话紧跟着就开口。
        const warming = this.warming;
        const busy = this.synthesisBusy();
        // 空闲时不要取消：Chrome for Android 会把紧跟 cancel() 同一拍里的 speak()
        // 丢掉，原生 TTS 也常吞掉 stop() 之后立刻发声的那一句——表现就是点了没声。
        const mustCancel = !warming && (busy || this.state.playing);
        if (mustCancel) this.cancelPlayback();
        if (typeof window === "undefined" || !lines.length) return false;
        // 整篇连读（join）先把行拼成一段：行是排版折断的，不是句子边界；对话不能拼，
        // 每行可能换人。再按句切开，一次交给引擎一句；标点原样保留，停顿仍由引擎自己给。
        const chunks: SpeechLine[] = (options?.join ? chunkLines(lines) : lines)
            .flatMap(line => speechChunks(line.text).map(text => ({...line, text})));
        if (!("speechSynthesis" in window) || !this.voices.length) {
            this.update({
                notice: this.state.deviceStatus === "loading" ? "ui.speechLoading"
                    : this.state.deviceStatus === "unsupported" ? "ui.speechUnsupported"
                        : this.state.deviceStatus === "no-japanese" ? "ui.speechNoJapanese"
                            : "ui.speechNoEngine",
            });
            return false;
        }
        this.completion = onEnd;
        this.silentChunks = 0;
        const token = this.generation;
        this.update({playing: true, notice: ""});
        // 交替渲染：第 N 句一开口，就把后面 speechLookahead 句也排进引擎。读这一句的同时
        // 后面的已经在合成，句与句之间不再空等合成。
        // 句间停顿：App 里交给原生播放器，在上一句播完之后等够了再播下一句，提前合成照旧。
        // 浏览器排进队列的句子会紧接着读，没法在中间插停顿，所以设了停顿就不提前排，
        // 上一句读完、等够停顿再送下一句（桌面引擎合成快，不提前排也不怎么等）。
        const pause = this.state.pause;
        const nativePause = deviceOnly();
        const lookahead = pause > 0 && !nativePause ? 0 : speechLookahead;
        const queued = new Map<number, SpeechSynthesisUtterance | null>();
        const started = new Set<number>();
        const enqueue = (index: number): SpeechSynthesisUtterance | null | undefined => {
            if (index >= chunks.length || queued.has(index)) return queued.get(index);
            const utterance = this.queueLine(chunks[index], token, {
                started: () => {
                    started.add(index);
                    for (let ahead = 1; ahead <= lookahead; ahead++) enqueue(index + ahead);
                },
                ended: () => {
                    if (pause > 0 && !nativePause && index + 1 < chunks.length)
                        this.gap = setTimeout(() => {
                            this.gap = undefined;
                            next(index + 1);
                        }, pause);
                    else next(index + 1);
                },
            }, index > 0 && nativePause ? pause : 0);
            if (utterance !== undefined) queued.set(index, utterance);
            return utterance;
        };
        const next = (index: number) => {
            if (token !== this.generation) return;
            if (index === chunks.length) {
                this.cancelPlayback();
                return;
            }
            const utterance = enqueue(index);
            // null：这一句去掉括号引号后什么都不剩，跳过；undefined：没排进去，fail 已经处理。
            if (utterance === null) next(index + 1);
            // 预先排好的那句可能已经开口了（回调先于上一句的 end 到达），这时不用再等它开口。
            // App 里原生播放器会先等完停顿才开口，看门狗要把这段时间让出来。
            else if (utterance && !started.has(index))
                this.watchStart(token, utterance, () => next(index + 1), nativePause ? watchdogMs.appStart + pause : watchdogMs.start);
        };
        if (busy) this.settle = setTimeout(() => {
            this.settle = undefined;
            next(0);
        }, cancelSettleMs);
        else next(0);
        return this.state.playing;
    }

    stop() {
        this.cancelPlayback();
    }

    /**
     * 重新读取浏览器的声音列表。
     *
     * 只对外暴露能读日语的声音：由引擎自己的 `lang` 判定，标成其他语言的
     * 一律丢弃。没标注的保留下来，因为 Android 就是这么报的，而且它们往往是
     * 手机上唯一的日语声音；这类声音标成「未标注」而不是「日语」。
     */
    private syncVoices() {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        const reported = window.speechSynthesis.getVoices();
        this.reported = reported.length;
        this.voices = japaneseVoices(reported);
        const options = this.voices.map(voice => ({
            id: voice.voiceURI,
            name: voice.name,
            lang: voice.lang,
            local: voice.localService,
            japanese: taggedJapanese(voice),
        }));
        const saved = this.voices.find(voice => voice.voiceURI === this.settings.voiceURI);
        // 优先用保存的 URI；否则依次取第一个本地日语声音、任意日语声音，
        // 再取未标注的声音——总比空列表强。
        const selected = saved
            ?? this.voices.find(voice => taggedJapanese(voice) && voice.localService)
            ?? this.voices.find(taggedJapanese)
            ?? this.voices[0];
        // 浏览器还在加载声音列表时，保留已保存的 URI。
        this.update({
            voices: options,
            hiddenVoices: reported.length - options.length,
            selectedVoice: selected?.voiceURI ?? "",
            deviceStatus: options.length ? "ready"
                : reported.length ? "no-japanese"
                    : this.state.deviceStatus === "loading" ? "loading" : "empty",
        });
    }

    /**
     * 继续等待还没送到的声音列表。
     *
     * 手机往往在页面已经打开之后才绑定引擎，一个 `voiceschanged` 监听器
     * 加一个定时器远远不够：会持续轮询一段时间，还会盯着引擎最可能出现的
     * 时刻——从系统设置切回标签页，或读者点一下页面。
     */
    private watchVoices() {
        this.stopWatching();
        this.grace = setTimeout(() => {
            this.grace = undefined;
            this.syncVoices();
            // 只报出非日语声音，说明引擎已经应答过：继续
            // 盯着只会让读者白等完整个搜索窗口。
            if (this.reported) return;
            // 还没有结果：判定空列表之前再唤醒一次引擎。
            this.warmUp();
            this.update({deviceStatus: "empty"});
        }, voiceGraceMs);
        const deadline = Date.now() + voiceSearchMs;
        this.poll = setInterval(() => {
            if (this.reported || Date.now() > deadline) {
                this.stopPolling();
                return;
            }
            this.syncVoices();
            if (this.reported) this.stopPolling();
        }, voicePollMs);
        const wake = () => {
            if (this.reported) return;
            this.syncVoices();
            if (!this.reported) this.warmUp();
        };
        this.watch(window, "focus", wake);
        this.watch(window, "pointerdown", wake);
        if (typeof document !== "undefined") this.watch(document, "visibilitychange", wake);
    }

    private watch(target: EventTarget, name: string, listener: () => void) {
        if (typeof target?.addEventListener !== "function") return;
        target.addEventListener(name, listener, {passive: true});
        this.watchers.push(() => target.removeEventListener(name, listener));
    }

    private stopPolling() {
        if (this.poll === undefined) return;
        clearInterval(this.poll);
        this.poll = undefined;
    }

    private stopWatching() {
        clearTimeout(this.grace);
        this.grace = undefined;
        this.stopPolling();
        this.watchers.splice(0).forEach(detach => detach());
    }

    /**
     * Chrome for Android 只有在引擎被要求开口后才枚举声音，所以遇到空列表时，
     * 用一条音量为零的静音语句催一下。这条语句留在队列里，不当场取消：
     * 队列自己会消化完，而在这里取消，恰恰会触发丢掉读者第一句话的竞态。
     *
     * 壳里不用催：声音是原生报上来的，催也催不出新东西。
     */
    private warmUp() {
        if (deviceOnly()) return;
        if (Date.now() - this.warmedAt < warmUpIntervalMs) return;
        this.nudge();
    }

    /**
     * 赶在用户点播放之前，让引擎把日语语音数据读进来。
     *
     * 第一次 `speak()` 要绑定系统语音引擎、加载语音数据，桌面上几百毫秒、手机上能到
     * 两秒；第二次全免。这就是「第一次播放特别卡、第二次很顺」的全部来源——不是页面
     * 慢，是引擎冷。先送一条 `volume = 0` 的空格，这段等待就挪到用户还在读课文的时候。
     *
     * 壳里也要热：原生 TTS 的日语语音包同样是在第一次合成时才加载的。
     */
    private prewarm() {
        if (Date.now() - this.warmedAt < warmSpanMs) return;
        this.nudge();
    }

    /** 送一条读不出声的样本，让引擎开始干活。 */
    private nudge() {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        if (this.state.playing) return;
        this.warmedAt = Date.now();
        this.warming = true;
        clearTimeout(this.warmTimer);
        this.warmTimer = setTimeout(() => {
            this.warmTimer = undefined;
            this.warming = false;
        }, warmLimitMs);
        try {
            const utterance = new window.SpeechSynthesisUtterance(" ");
            utterance.volume = 0;
            utterance.lang = fallbackLang;
            const settle = () => {
                this.warming = false;
            };
            utterance.onend = settle;
            utterance.onerror = () => {
                settle();
                // 被浏览器按「没有用户手势」挡下了：这次什么也没热到，别让窗口挡住
                // 紧接着的那个真手势。
                this.warmedAt = 0;
            };
            window.speechSynthesis.speak(utterance);
        } catch {
            this.warming = false;
            this.warmedAt = 0;
        }
    }

    /** 浏览器是否还在处理一条我们正准备取消的队列。 */
    private synthesisBusy() {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
        const synthesis = window.speechSynthesis;
        return Boolean(synthesis.speaking || synthesis.pending);
    }

    private update(patch: Partial<SpeechState>) {
        this.state = {...this.state, ...patch};
        this.listeners.forEach(listener => listener());
    }

    private save() {
        try {
            if (typeof window !== "undefined") window.localStorage.setItem(storageKey, JSON.stringify(this.settings));
        } catch {
            this.update({notice: "ui.speechStorageError"});
        }
    }

    /**
     * 把一句交给引擎排队，返回排进去的 utterance。
     * null：去掉振假名标记和括号引号后什么都不剩，不必送；undefined：没送出去，已经 fail。
     */
    private queueLine(line: SpeechLine, token: number, events: { started: () => void; ended: () => void }, pauseBefore = 0) {
        const text = spokenText(line.text);
        // 一段只剩括号引号时，去掉之后什么都不剩：跳过，别把空串塞给引擎。
        if (!text.trim()) return null;
        const roleId = line.role ? this.roleVoice(line.lessonId ?? "", line.role) : "";
        const voice = this.voices.find(candidate => candidate.voiceURI === (roleId || this.state.selectedVoice));
        if (!voice) {
            this.fail(token, "ui.speechFailed");
            return undefined;
        }
        try {
            const synthesis = window.speechSynthesis;
            const utterance = new window.SpeechSynthesisUtterance(text);
            this.utterances.push(utterance);
            utterance.voice = voice;
            utterance.lang = voice.lang || fallbackLang;
            utterance.rate = this.state.rate;
            // 非标准字段，只有 App 的桥接层认：开口前先停这么久。浏览器会忽略它。
            if (pauseBefore) Object.assign(utterance, {pauseBefore});
            utterance.onstart = () => {
                if (token !== this.generation) return;
                this.silentChunks = 0;
                clearTimeout(this.startWatch);
                this.startWatch = undefined;
                clearTimeout(this.endWatch);
                this.endWatch = setTimeout(() => this.fail(token, "ui.speechFailed"), watchdogMs.end);
                events.started();
            };
            utterance.onend = () => {
                this.utterances = this.utterances.filter(item => item !== utterance);
                this.clearWatches();
                if (token === this.generation) events.ended();
            };
            utterance.onerror = event => {
                this.clearWatches();
                // 被别人取消的（App 切到后台时壳会调 cancel，浏览器换页也会）不是故障：
                // 安静地结束，不弹「朗读失败」。我们自己取消时回调早已摘掉，到不了这里。
                if (["canceled", "interrupted"].includes((event as { error?: string } | undefined)?.error ?? "")) {
                    if (token === this.generation) this.cancelPlayback();
                    return;
                }
                this.fail(token, "ui.speechFailed");
            };
            // 被中断的朗读会让合成器停在暂停状态，恢复之前一直是暂停。
            if (typeof synthesis.resume === "function") synthesis.resume();
            synthesis.speak(utterance);
            return utterance;
        } catch {
            this.fail(token, "ui.speechFailed");
            return undefined;
        }
    }

    /** 这一句该开口了：等它开口，太久不开口就交给 onSilent。 */
    private watchStart(token: number, utterance: SpeechSynthesisUtterance, onEnd: () => void, limitMs: number) {
        clearTimeout(this.startWatch);
        this.startWatch = setTimeout(() => this.onSilent(token, utterance, onEnd), limitMs);
    }

    /**
     * 这条 utterance 一直没开口：丢掉它继续下一条。连续两条都不开口，说明引擎卡死了，
     * 继续下去只会一条条等超时，所以整段停下并提示。
     */
    private onSilent(token: number, stuck: SpeechSynthesisUtterance, onEnd: () => void) {
        if (token !== this.generation) return;
        this.startWatch = undefined;
        this.silentChunks++;
        if (this.silentChunks >= 2) {
            this.fail(token, "ui.speechFailed");
            return;
        }
        this.update({notice: "ui.speechFailed"});
        // 卡住的那句还占着引擎队首（App 里是一直合成不出来的那个文件），不撤掉的话后面的
        // 句子永远排在它后面，「跳过」就成了空话。它还没开口，后面也没有提前排好的句子，
        // 所以清空引擎队列只会扔掉它。摘掉回调，免得 cancel 发来的 error 把整段停掉。
        stuck.onstart = null;
        stuck.onend = null;
        stuck.onerror = null;
        this.utterances = this.utterances.filter(item => item !== stuck);
        if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
        // Chrome 会丢掉和 cancel() 同一拍里的 speak()，隔一下再送下一句。
        this.settle = setTimeout(() => {
            this.settle = undefined;
            if (token === this.generation) onEnd();
        }, cancelSettleMs);
    }

    private clearWatches() {
        clearTimeout(this.startWatch);
        this.startWatch = undefined;
        clearTimeout(this.endWatch);
        this.endWatch = undefined;
    }

    private fail(token: number, notice: UiTextId) {
        if (token !== this.generation) return;
        this.cancelPlayback();
        this.update({notice});
    }

    private cancelPlayback() {
        this.generation++;
        this.clearWatches();
        clearTimeout(this.settle);
        this.settle = undefined;
        clearTimeout(this.gap);
        this.gap = undefined;
        clearTimeout(this.warmTimer);
        this.warmTimer = undefined;
        this.warming = false;
        // 正在读的和预先排好的都要摘掉回调：cancel() 会给它们各发一次 error。
        for (const utterance of this.utterances.splice(0)) {
            utterance.onstart = null;
            utterance.onend = null;
            utterance.onerror = null;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
        const completion = this.completion;
        this.completion = undefined;
        this.update({playing: false});
        completion?.();
    }
}
