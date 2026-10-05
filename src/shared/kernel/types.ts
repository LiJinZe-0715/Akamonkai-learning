export type Locale = "zh" | "en";
export type TextId = string;
export type Segment =
  | { ja: string; textId?: never }
  | { textId: TextId; ja?: never };
export type TranslationCatalog = Record<TextId, { zh: string; en: string }>;
