import type { TranslationCatalog } from "../../../shared/kernel/types";
import { readJson, type JsonReader } from "../../../shared/infrastructure/http-json";
import { requiredUiTextIds } from "../domain/ui-text-ids";
export function decodeTranslations(value: unknown): TranslationCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid translations");
  if (requiredUiTextIds.some(id => !Object.hasOwn(value, id))) throw new Error("Missing required UI translation");
  for (const entry of Object.values(value)) {
    if (!entry || typeof entry !== "object" || typeof entry.zh !== "string" || !entry.zh.trim() || typeof entry.en !== "string" || !entry.en.trim())
      throw new Error("Invalid translation entry");
  }
  return value as TranslationCatalog;
}
export class HttpUiCatalog {
  constructor(private readonly read: JsonReader = readJson) {}
  async load() { return decodeTranslations(await this.read("/content/ui.json")); }
}
