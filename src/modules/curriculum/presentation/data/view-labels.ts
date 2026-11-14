import type {View} from "../../public";
import type {UiTextId} from "../../../localization/public";

/** 页签的日语标题，页签本身由课里的模块推导。 */
const viewTitles: Record<View, string> = {
    articles: "本文",
    dialogues: "会話",
    grammar: "文法",
    words: "単語",
    kanji: "漢字",
    quiz: "テスト",
};

const viewText: Record<View, UiTextId> = {
    articles: "ui.viewArticles",
    dialogues: "ui.viewDialogues",
    grammar: "ui.viewGrammar",
    words: "ui.viewWords",
    kanji: "ui.viewKanji",
    quiz: "ui.viewQuiz",
};

export function viewTitle(_bookId: string, view: View): string {
    return viewTitles[view];
}

export function viewTextId(_bookId: string, view: View): UiTextId {
    return viewText[view];
}
