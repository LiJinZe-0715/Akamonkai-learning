import { readJson, type JsonReader } from "../../../shared/infrastructure/http-json";
export class HttpWordAliases {
  constructor(private readonly read: JsonReader = readJson) {}
  async load(): Promise<Record<string, string>> {
    const value = await this.read("/content/word-aliases.json");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid word aliases");
    for (const [id, canonical] of Object.entries(value)) {
      if (!/^[a-z0-9.-]+$/.test(id) || typeof canonical !== "string" || !/^[a-z0-9.-]+$/.test(canonical) || id === canonical || Object.hasOwn(value, canonical)) throw new Error("Invalid word alias");
    }
    return { ...value } as Record<string, string>;
  }
}
