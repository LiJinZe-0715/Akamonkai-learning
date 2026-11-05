import {buildCatalog, compileLessons} from "./content-compiler.mjs";
import {buildSearchIndex} from "./search-index.mjs";
import {readJson, deepFreeze} from "./loader.mjs";

/**
 * 夹具层。
 *
 * 内容编译一次、深冻结，之后每次取用都是独立副本。
 * 这样「顺手改一下共享数据」既不可能（冻结会抛错），也传不出去（副本隔离）。
 * 新模型里每课一个文件，页签、题目、单词都挂在 modules 下面。
 */
export function createFixtures({load}) {
    const lessons = deepFreeze(compileLessons());
    const catalog = deepFreeze(buildCatalog(lessons));
    const ui = deepFreeze(readJson("data/content/localization/ui.json"));
    const learningTexts = deepFreeze(readJson("data/content/localization/learning.json"));
    const index = deepFreeze(buildSearchIndex(lessons, catalog));
    void load;

    /** 每个用例一份，内部按需克隆并记忆化。 */
    return function fixture() {
        const cache = new Map();
        const once = (key, build) => {
            if (!cache.has(key)) cache.set(key, build());
            return cache.get(key);
        };

        const api = {
            /** 可变副本：用例可以随意改，改不到别人。 */
            units: () => once("units", () => structuredClone(lessons)),
            lessons: () => api.units(),
            catalog: () => once("catalog", () => structuredClone(catalog)),
            /** 运行时汉字分组已经删除，目录本身就是最终形态。 */
            grouped: () => api.catalog(),
            /** 保留旧名的摊平入口：新模型里一课就是一项，不需要摊平。 */
            flat: () => api.units(),
            ui: () => once("ui", () => structuredClone(ui)),
            learningTexts: () => once("learningTexts", () => structuredClone(learningTexts)),
            searchIndex: () => once("index", () => structuredClone(index)),
            lesson: id => once("lesson:" + id, () => structuredClone(lessons.find(item => item.id === id))),
            /** 动词参考资料现在是 jlpt-n5 教材里的一课。 */
            verbs: () => api.lesson("jlpt-n5-doshi-no-katsuyo.verbs"),
            /** 只读原始源：只做遍历、不需要副本的用例直接用，省一次深拷贝。 */
            source: {units: lessons, catalog, ui, learningTexts, index},
        };
        return api;
    };
}
