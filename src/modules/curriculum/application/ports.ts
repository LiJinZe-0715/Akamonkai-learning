import type {Catalog} from "../domain/catalog";
import type {Lesson} from "./contracts";

/** 出站端口：内容来自构建期生成的 JSON 包。 */
export interface CurriculumRepository {
    catalog(): Promise<Catalog>;

    lesson(id: string): Promise<Lesson>;
}
