import type { LanguagePreference } from "../application/ports";
import type { Locale } from "../../../shared/kernel/types";
export class BrowserLanguagePreference implements LanguagePreference {
  read(): Locale {
    try {
      return localStorage.getItem("akamonkai.language") === "en" ? "en" : "zh";
    } catch {
      return "zh";
    }
  }
  write(locale: Locale) {
    try {
      localStorage.setItem("akamonkai.language", locale);
    } catch {
      /* Session language still works. */
    }
  }
}
