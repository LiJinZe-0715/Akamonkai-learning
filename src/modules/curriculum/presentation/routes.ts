import type {View} from "../public";

/** 查询链接保持相对于部署目录。track 表示「从某个模块入口进来」，只在 view === track 时有意义。 */
export const lessonHref = (id: string, view?: View, track?: View): string => "?unit=" + encodeURIComponent(id)
    + (view ? "&view=" + view : "") + (track ? "&track=" + track : "");
export const examHref = (id: string): string => "?exam=" + encodeURIComponent(id);
export const bookHref = (bookId: string, unitId?: string): string => "./?book=" + encodeURIComponent(bookId)
    + (unitId ? "&focus=" + encodeURIComponent(unitId) + "#unit-" + encodeURIComponent(unitId) : "");
/** 单词学习页；传 bookId 时锚到该书区块，传 unitId 时定位并高亮该课。 */
export const wordsHref = (bookId?: string, unitId?: string): string => "./?page=words"
    + (unitId ? "&focus=" + encodeURIComponent(unitId) + "#words-unit-" + encodeURIComponent(unitId)
        : bookId ? "#words-" + encodeURIComponent(bookId) : "");
