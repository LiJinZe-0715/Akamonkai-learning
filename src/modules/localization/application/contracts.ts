import type { Locale, TranslationCatalog } from "../../../shared/kernel/types";
export interface LocalizationUseCases {
 ui(id: string, locale: Locale): string;
 current(): Locale;
 select(locale: Locale): void;
 text(catalog: TranslationCatalog, id: string, locale: Locale): string;
}
