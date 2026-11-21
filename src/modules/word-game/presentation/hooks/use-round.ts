import {useCallback, useEffect, useRef, useState} from "react";
import type {GameWord, RoundState} from "../../public";
import {gameConfig, pickChip, startRound, tick} from "../../public";

/**
 * 一局的游戏循环：requestAnimationFrame 驱动 tick，键盘 1–4 出牌、空格 / Esc 暂停。
 * 暂停、切后台、已结束的局都不推进时间，恢复时从当前时刻重新计拍。
 */
export function useRound(words: readonly GameWord[], pool: readonly GameWord[]) {
    const [state, setState] = useState<RoundState>(() => startRound(words, pool, Math.random));
    const [paused, setPaused] = useState(false);
    const stateRef = useRef(state);
    const pausedRef = useRef(paused);
    stateRef.current = state;
    pausedRef.current = paused;

    const pick = useCallback((slot: number) => {
        const current = stateRef.current;
        if (pausedRef.current || current.status !== "playing") return;
        const next = pickChip(current, slot, Math.random);
        if (next !== current) {
            stateRef.current = next;
            setState(next);
        }
    }, []);

    const togglePause = useCallback(() => {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
    }, []);

    const restart = useCallback(() => {
        const next = startRound(words, pool, Math.random);
        stateRef.current = next;
        setState(next);
        pausedRef.current = false;
        setPaused(false);
    }, [words, pool]);

    useEffect(() => {
        let frame = 0;
        let last = performance.now();
        const step = (now: number) => {
            frame = requestAnimationFrame(step);
            const current = stateRef.current;
            if (pausedRef.current || document.visibilityState === "hidden"
                || current.status === "cleared" || current.status === "failed") {
                // 停顿期间不补时间：每一拍都把基准挪到当前时刻。
                last = now;
                return;
            }
            const next = tick(current, now - last, Math.random);
            last = now;
            if (next !== current) {
                stateRef.current = next;
                setState(next);
            }
        };
        frame = requestAnimationFrame(step);
        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                pausedRef.current = true;
                setPaused(true);
            }
            last = performance.now();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"
                || target.tagName === "SELECT" || target.isContentEditable)) return;
            const slot = Number(event.key) - 1;
            if (Number.isInteger(slot) && slot >= 0 && slot < gameConfig.chipSlots) {
                pick(slot);
            } else if (event.key === " " || event.key === "Escape") {
                event.preventDefault();
                togglePause();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [pick, togglePause]);

    return {state, paused, pick, togglePause, restart};
}