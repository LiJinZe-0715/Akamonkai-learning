import type { Locale } from "../../../shared/kernel/types";
export interface LanguagePreference {
  read(): Locale;
  write(locale: Locale): void;
}
