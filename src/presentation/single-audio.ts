import {useEffect} from "react";
import {useServices} from "./StudyContext";

/**
 * 同一时刻只让一条声音在响。
 *
 * 页面里能发声的有两类：TTS（`services.speech`）和原生 `<audio>`（教材本文录音、真题听力）。
 * 前者只在自己的引擎里互斥，管不到播放器；后者连互斥都没有——分页阅读把每一页都留在
 * DOM 里，翻页不卸载，上一页的音轨还在响，再点下一段就是两条声音叠在一起。
 *
 * 仲裁只能放在外壳：只有这里同时看得见朗读服务和 DOM 里的播放器。策略是「谁最后起播谁
 * 独占」，被抢占的播放器暂停而不复位，切回去按播放还能接着听。
 */

function isMedia(node: unknown): node is HTMLMediaElement {
    return typeof HTMLMediaElement !== "undefined" && node instanceof HTMLMediaElement;
}

/** 正在响的播放器。原生播放器改不了它的内部状态，但可以暂停它。 */
function playingMedia(): HTMLMediaElement[] {
    if (typeof document === "undefined") return [];
    return Array.from(document.querySelectorAll<HTMLMediaElement>("audio, video")).filter(node => !node.paused);
}

/**
 * 暂停所有正在响的播放器，保留播放进度。
 *
 * 朗读起播前同步调用：TTS 是由读者手势触发的，等 React 那边察觉到状态变化再暂停，
 * mp3 已经多响了一拍，所以这里不经过状态。
 */
export function pauseMediaOutput(): void {
    for (const node of playingMedia()) node.pause();
}

/**
 * 挂上排斥策略，返回卸载函数。
 *
 * `play` 事件不冒泡，只能在捕获阶段拦到；但正因为不冒泡，捕获阶段能拿到页面上任何
 * 播放器的起播，不必逐个播放器去接线。`stopSpeech` 由调用方注入，这里不认朗读服务。
 */
export function watchSingleAudio(stopSpeech: () => void): () => void {
    if (typeof document === "undefined") return () => {
    };
    const onPlay = (event: Event) => {
        const player = event.target;
        if (!isMedia(player)) return;
        for (const node of playingMedia()) if (node !== player) node.pause();
        stopSpeech();
    };
    document.addEventListener("play", onPlay, true);
    return () => document.removeEventListener("play", onPlay, true);
}

/** 应用启动时挂一次，覆盖所有页面的所有播放器。 */
export function useSingleAudio(): void {
    const services = useServices();
    useEffect(() => watchSingleAudio(() => services.speech.stop()), [services]);
}
