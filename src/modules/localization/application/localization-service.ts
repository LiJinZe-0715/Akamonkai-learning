import type {LocalizationUseCases} from "./contracts";
import type {LanguagePreference} from "./ports";
import type {Locale, TranslationCatalog} from "../../../shared/kernel/text-types";
import {translateId} from "../domain/translate";
import type {UiTextId} from "../domain/ui-text-ids";

export class LocalizationService implements LocalizationUseCases {
    constructor(
        private preference: LanguagePreference,
        private uiCatalog: TranslationCatalog,
    ) {
    }

    uiText(id: UiTextId, locale: Locale) {
        return translateId(this.uiCatalog, id, locale);
    }

    current() {
        return this.preference.read();
    }

    select(locale: Locale) {
        this.preference.write(locale);
    }

    text(catalog: TranslationCatalog, id: string, locale: Locale) {
        return translateId(catalog, id, locale);
    }
}
