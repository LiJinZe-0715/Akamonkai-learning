import type {UiTextId} from "../../localization/public";
import type {SpeechLine} from "../domain/dialogue";

export type {SpeechLine} from "../domain/dialogue";

export interface SpeechVoice {
    id: string;
    name: string;
    local?: boolean;
    lang?: string;
    /** 引擎是否把这个声音标成日语；没标注的仍保留为候选。 */
    japanese?: boolean;
}

/**
 * 一串文本行以什么形式交给引擎。
 *
 * `join` 用于整篇课文连读：这些行本是同一段文本，逐行拆成一句话，
 * 每句都要完整重启一次引擎——就是两个句号之间听到的那阵长静音。
 * 对话不启用它，因为每一行都可能是不同的说话人。
 */
export interface PlayOptions {
    join?: boolean;
}

/**
 * 读者在朗读设置里能看到的一切。
 *
 * 声音只有一个来源：操作系统里已有的。装了日语语音的手机或电脑会在这里报出来；
 * 页面不启动、不下载任何东西，也不发 HTTP 请求。只有 `deviceStatus`
 * 用来说明这份列表是否已经到位。
 */
export interface SpeechState {
    /** 能读日语的声音：引擎标成其他语言的一律过滤掉。 */
    voices: SpeechVoice[];
    /** 因被标成非日语而丢弃的声音数量。 */
    hiddenVoices: number;
    /**
     * `no-japanese` 表示手机有系统引擎但没有日语语音数据：
     * 声音列表非空，却没有一个能读日语，所以对外是空列表。
     */
    deviceStatus: "loading" | "ready" | "empty" | "no-japanese" | "unsupported";
    selectedVoice: string;
    playing: boolean;
    notice: UiTextId | "";
    rate: number;
    /** 句间额外停顿，毫秒。 */
    pause: number;
}

export interface SpeechUseCases {
    initialize(): () => void;

    subscribe(listener: () => void): () => void;

    snapshot(): SpeechState;

    setRate(rate: number): void;

    setPause(milliseconds: number): void;

    /** 重新读取设备声音列表，给刚改过系统 TTS 的读者用。 */
    refreshVoices(): void;

    selectVoice(id: string): void;

    roleVoice(lessonId: string, role: string): string;

    setRoleVoice(lessonId: string, role: string, id: string): void;

    speak(text: string, onEnd: () => void, context?: Omit<SpeechLine, "text">): boolean;

    play(lines: SpeechLine[], onEnd: () => void, options?: PlayOptions): boolean;

    stop(): void;
}
