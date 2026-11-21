import {useSyncExternalStore} from "react";
import type {UiTextId} from "../../modules/localization/public";
import type {SpeechState} from "../../modules/speech/public";
import {useServices} from "../StudyContext";

/**
 * 朗读设置的 React 订阅：声音列表、当前声音、播放状态都从用例层读。
 * subscribe / snapshot 是实例上的箭头函数属性，引用本来就稳定；再 bind 一次会让
 * React 每次渲染都退订重订（播放时状态每段刷新一次）。
 */
export function useSpeechState(): SpeechState {
    const services = useServices();
    return useSyncExternalStore(services.speech.subscribe, services.speech.snapshot, services.speech.snapshot);
}

/** 无法开始播放的原因（如果有）；尝试失败的优先级高于声音状态。 */
export function speechStatusText(state: SpeechState): UiTextId | "" {
    if (state.notice) return state.notice;
    if (state.deviceStatus === "loading") return "ui.speechLoading";
    if (state.deviceStatus === "empty") return "ui.speechNoEngine";
    // 引擎在，但它报出来的声音全都不是日语。
    if (state.deviceStatus === "no-japanese") return "ui.speechNoJapanese";
    return "";
}
