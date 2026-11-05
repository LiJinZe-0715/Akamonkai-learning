import type {Locale} from "../../../shared/kernel/text-types";

export interface LanguagePreference {
    read(): Locale;

    write(locale: Locale): void;
}
