import {useEffect, useState} from "react";
import type {Theme} from "../../shared/kernel/theme";
import {useServices} from "../StudyContext";

function applyTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0a0a0a" : "#ffffff");
}

export function useTheme() {
    const services = useServices();
    const [theme, setTheme] = useState<Theme>(() => services.appearance.current());
    const [custom, setCustom] = useState(() => services.appearance.hasPreference());
    useEffect(() => applyTheme(theme), [theme]);
    // 没手动选过时跟随系统：浏览器里系统主题改了，页面要跟着变而不必刷新。
    useEffect(() => {
        if (custom || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const follow = () => setTheme(media.matches ? "dark" : "light");
        media.addEventListener("change", follow);
        return () => media.removeEventListener("change", follow);
    }, [custom]);
    const selectTheme = (next: Theme) => {
        setCustom(true);
        setTheme(next);
        applyTheme(next);
        services.appearance.select(next);
    };
    return {theme, selectTheme};
}
