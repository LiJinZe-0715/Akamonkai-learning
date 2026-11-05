import type {View} from "../public";

/** 查询链接保持相对于部署目录。 */
export const lessonHref = (id: string, view?: View): string => "?unit=" + encodeURIComponent(id) + (view ? "&view=" + view : "");
export const bookHref = (bookId: string, unitId?: string): string => "./?book=" + encodeURIComponent(bookId)
    + (unitId ? "&focus=" + encodeURIComponent(unitId) + "#unit-" + encodeURIComponent(unitId) : "");
