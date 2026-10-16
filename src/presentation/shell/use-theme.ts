import {useEffect, useState} from "react";
import type {Theme} from "../../application/study-services";
import {useServices} from "../StudyContext";

export function applyTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101827" : "#f5f7fb");
}

export function useTheme() {
    const services = useServices();
    const [theme, setTheme] = useState<Theme>(() => services.appearance.current());
    useEffect(() => applyTheme(theme), [theme]);
    const selectTheme = (next: Theme) => {
        setTheme(next);
        applyTheme(next);
        services.appearance.select(next);
    };
    return {theme, selectTheme};
}
