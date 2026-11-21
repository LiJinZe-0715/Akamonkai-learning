import type {Lesson} from "../application/contracts";
import type {CurriculumRepository} from "../application/ports";
import type {Catalog} from "../domain/catalog";
import {type JsonReader, readJson} from "../../../shared/infrastructure/http-json";
import {decodeCatalog, decodeLesson} from "./content-decoder";

/** 课 id 是路径式 id：小写英文、数字、-，点号分层；顺带挡掉路径穿越。 */
const lessonIdPattern = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

export class HttpCurriculumRepository implements CurriculumRepository {
    private index?: Promise<Catalog>;
    private lessons = new Map<string, Promise<Lesson>>();

    constructor(private readonly read: JsonReader = readJson) {
    }

    catalog() {
        return this.index ??= this.read("/content/catalog.json").then(decodeCatalog).catch(error => {
            this.index = undefined;
            throw error;
        });
    }

    lesson(id: string) {
        if (!lessonIdPattern.test(id)) return Promise.reject(new Error("Invalid lesson ID"));
        let pending = this.lessons.get(id);
        if (!pending) {
            pending = this.read("/content/units/" + id + ".json")
                .then(value => decodeLesson(value, id))
                .catch(error => {
                    this.lessons.delete(id);
                    throw error;
                });
            this.lessons.set(id, pending);
        }
        return pending;
    }
}
