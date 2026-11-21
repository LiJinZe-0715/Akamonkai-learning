import type {Locale, TextId, TranslationCatalog,} from "../../../shared/kernel/text-types";

export function translateId(
    catalog: TranslationCatalog,
    id: TextId,
    locale: Locale,
) {
    const entry = catalog[id];
    if (!entry) throw new Error("Unknown text ID: " + id);
    return entry[locale];
}
