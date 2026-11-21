import type {Theme} from "../kernel/theme";

export class BrowserThemePreference {
    /**
     * 读的是已经落到 DOM 上的主题，不是存储里的值：index.html 的内联脚本负责首屏防闪烁，
     * 之后 `dataset.theme` 就是「实际生效」的那份。`select()` 只写存储，
     * 切换主题的调用方必须同时改 `dataset.theme`，否则这里读到的还是旧值。
     */
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
