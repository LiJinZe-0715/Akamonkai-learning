import type {WordFilter} from "../../../learning-progress/public";
import type {UiTextId} from "../../../localization/public";

export const wordFilters: readonly WordFilter[] = ["all", "saved", "mastered"];

/** 每个筛选按钮对应的文案 id。用映射代替字符串拼接，拼错会被类型检查挡住。 */
export const wordFilterLabels: Record<WordFilter, UiTextId> = {
    all: "ui.all", saved: "ui.saved", mastered: "ui.mastered",
};
