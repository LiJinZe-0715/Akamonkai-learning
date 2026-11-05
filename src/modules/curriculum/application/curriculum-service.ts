import type {Book, Catalog, View} from "../domain/catalog";
import {Curriculum} from "../domain/curriculum";
import type {CurriculumDiscovery, CurriculumQueries, Lesson, LessonSelection} from "./contracts";
import type {CurriculumRepository} from "./ports";
import {adjacentLessons, catalogLessons, filterCatalog, type AdjacentLesson, type CatalogLesson} from "../domain/catalog-queries";

/**
 * 目录与课的读取用例。
 *
 * 汉字分课、单字链接重定向都在迁移时做进源数据了，运行时只按 id 取一课，
 * 不再拼装条目，也不再把旧链接改写到分组。
 */
export class CurriculumService implements CurriculumQueries, CurriculumDiscovery {
    constructor(private readonly repository: CurriculumRepository) {
    }

    catalog() {
        return this.repository.catalog();
    }

    lesson(id: string): Promise<Lesson> {
        return this.repository.lesson(id);
    }

    select(catalog: Catalog, lessonId: string | null, view: string | null): LessonSelection | null {
        if (!lessonId) return null;
        return new Curriculum(catalog).select(lessonId, view);
    }

    lessons(catalog: Catalog): CatalogLesson[] {
        return catalogLessons(catalog);
    }

    search(catalog: Catalog, level: string, query: string): Book[] {
        return filterCatalog(catalog, level, query);
    }

    adjacent(catalog: Catalog, lessonId: string, view: View): AdjacentLesson[] {
        return adjacentLessons(catalog, lessonId, view);
    }
}
