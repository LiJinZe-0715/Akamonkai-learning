import type {IconName} from "../../components/Icon";
import type {UiTextId} from "../../../modules/localization/public";

/** 应用的几个页面，用 ?page= 区分；首页不带参数。 */
export type PageId = "home" | "library" | "search" | "settings";

/** 底部 / 顶部标签栏：首页、教材库、搜索。设置走右上角齿轮。 */
export const navItems: { id: PageId; text: UiTextId; icon: IconName }[] = [
    {id: "home", text: "ui.today", icon: "home"},
    {id: "library", text: "ui.library", icon: "books"},
    {id: "search", text: "ui.searchNav", icon: "search"},
];

export const pageHref = (id: PageId): string => id === "home" ? "./" : "./?page=" + id;

/** 当前页对应哪个标签。教材页、课次页都算在教材库下。 */
export function currentPage(search: string): PageId | "other" {
    const params = new URLSearchParams(search);
    const page = params.get("page");
    if (page === "library" || page === "search" || page === "settings") return page;
    if (page === "speech") return "settings";
    if (params.has("unit") || params.has("book")) return "library";
    return page ? "other" : "home";
}
