import type {CurriculumRepository, LessonBundle} from "../application/contracts";
import type {Catalog} from "../domain/catalog";
import {type JsonReader, readJson} from "../../../shared/infrastructure/http-json";
import {decodeCatalog, decodeKanji, decodeLesson} from "./curriculum-content-decoder";

export class HttpCurriculumRepository implements CurriculumRepository {
    private index?: Promise<Catalog>;
    private lessons = new Map<string, Promise<LessonBundle>>();
    private kanji = new Map<string, Promise<Map<string, LessonBundle>>>();

    constructor(private readonly read: JsonReader = readJson) {
    }

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
            const bookId = /^kanji-intermediate-\d+$/.test(id) ? "kanji-daily"
                : /^kanji-new-\d+$/.test(id) ? "kanji-700" : undefined;
            let content: Promise<LessonBundle>;
            if (bookId) {
                let bundle = this.kanji.get(bookId);
                if (!bundle) {
                    bundle = this.read("/content/" + bookId + ".json").then(value => decodeKanji(value, bookId)).catch(error => {
                        this.kanji.delete(bookId);
                        throw error;
                    });
                    this.kanji.set(bookId, bundle);
                }
                content = bundle.then(lessons => {
                    const lesson = lessons.get(id);
                    if (!lesson) throw new Error("Unavailable kanji unit");
                    return lesson;
                });
            } else content = this.read("/content/units/" + id + ".json").then(value => decodeLesson(value, id));
            pending = content.catch(error => {
                this.lessons.delete(id);
                throw error;
            });
            this.lessons.set(id, pending);
        }
        return pending;
    }
}
