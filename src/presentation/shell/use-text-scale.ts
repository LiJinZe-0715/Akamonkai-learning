import {useCallback, useEffect, useState} from "react";
import {clampTextScale} from "../../shared/kernel/text-scale";
import {useServices} from "../StudyContext";

/**
 * 文字倍率的读写。
 *
 * 基准字号全站一致，差的是这个倍率：桌面默认 150%（屏幕远、字显得小），
 * 手机默认 100%。用户没调过时不设内联值，让 CSS 的媒体查询说了算；一旦调过，
 * 内联值就压过样式表，窗口怎么缩放都按用户选的走。
 */

/** 与 theme.css 的媒体查询保持一致。 */
function browserDefault() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 1;
    return window.matchMedia("(min-width: 900px)").matches ? 1.5 : 1;
}

function apply(scale: number | null) {
    if (typeof document === "undefined") return;
    const style = document.documentElement.style;
    if (scale === null) style.removeProperty("--font-scale");
    else style.setProperty("--font-scale", String(scale));
}

export function useTextScale() {
    const services = useServices();
    const [state, setState] = useState(() => {
        const saved = services.textScale.current();
        return {value: saved ?? browserDefault(), custom: saved !== null};
    });

    useEffect(() => apply(state.custom ? state.value : null), [state]);

    const change = useCallback((next: number) => {
        const value = clampTextScale(next);
        services.textScale.select(value);
        setState({value, custom: true});
    }, [services]);

    const reset = useCallback(() => {
        services.textScale.select(null);
        setState({value: browserDefault(), custom: false});
    }, [services]);

    return {value: state.value, custom: state.custom, change, reset};
}
