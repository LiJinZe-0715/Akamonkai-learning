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

/**
 * 没调过倍率时的默认值：直接问样式表算出来的 --font-scale。
 * 分档规则只写在 theme.css 一处（900px 起 150%），这里不再抄一遍断点和数字。
 */
function browserDefault() {
    if (typeof window === "undefined" || typeof document === "undefined") return 1;
    const computed = window.getComputedStyle?.(document.documentElement);
    const value = Number.parseFloat(computed?.getPropertyValue("--font-scale") ?? "");
    return Number.isFinite(value) && value > 0 ? value : 1;
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
        /* 先摘掉内联值，否则下面读到的是用户自己设的那个数。 */
        apply(null);
        setState({value: browserDefault(), custom: false});
    }, [services]);

    return {value: state.value, custom: state.custom, change, reset};
}
