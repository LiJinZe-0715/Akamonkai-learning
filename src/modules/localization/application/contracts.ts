import type {Locale, TranslationCatalog} from "../../../shared/kernel/text-types";
import type {UiTextId} from "../domain/ui-text-ids";

export interface LocalizationUseCases {
    uiText(id: UiTextId, locale: Locale): string;

    current(): Locale;

    select(locale: Locale): void;

    text(catalog: TranslationCatalog, id: string, locale: Locale): string;
}
