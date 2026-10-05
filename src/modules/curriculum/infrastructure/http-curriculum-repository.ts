import type { CurriculumRepository, LessonBundle } from "../application/contracts";
import type { Catalog } from "../domain/catalog";
import { readJson, type JsonReader } from "../../../shared/infrastructure/http-json";
import { decodeCatalog, decodeLesson } from "./content-mapper";
export class HttpCurriculumRepository implements CurriculumRepository {
  private index?: Promise<Catalog>;
  private lessons = new Map<string, Promise<LessonBundle>>();
  constructor(private readonly read: JsonReader = readJson) {}
  catalog() {
    return this.index ??= this.read("/content/catalog.json").then(decodeCatalog).catch(error => {
      this.index = undefined;
      throw error;
    });
  }
  lesson(id: string) {
    if (!/^[a-z0-9-]+$/.test(id)) return Promise.reject(new Error("Invalid lesson ID"));
    let pending = this.lessons.get(id);
    if (!pending) {
      pending = this.read("/content/units/" + id + ".json").then(value => decodeLesson(value, id)).catch(error => {
        this.lessons.delete(id);
        throw error;
      });
      this.lessons.set(id, pending);
    }
    return pending;
  }
}
