import type {Theme} from "../kernel/theme";

export class BrowserThemePreference {
    current(): Theme {
        return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    }

    hasPreference(): boolean {
        try {
            const saved = localStorage.getItem("akamonkai.theme");
            return saved === "light" || saved === "dark";
        } catch {
            return false;
        }
    }

    select(theme: Theme) {
        try {
            localStorage.setItem("akamonkai.theme", theme);
        } catch { /* 存储不可用时外观仍然可用。 */
        }
    }
}
