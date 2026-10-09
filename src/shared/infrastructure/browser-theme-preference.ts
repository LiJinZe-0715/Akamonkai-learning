import type { Theme } from "../../application/study-services";

export class BrowserThemePreference {
  current(): Theme {
    return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
  select(theme: Theme) {
    try { localStorage.setItem("akamonkai.theme", theme); } catch { /* Appearance remains usable without storage. */ }
  }
}
