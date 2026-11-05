import type {View} from "../../public";
import type {UiTextId} from "../../../localization/public";

/** 页签的日语标题，页签本身由课里的模块推导。 */
const viewTitles: Record<View, string> = {
    kanji: "漢字",
    words: "単語",
    articles: "本文",
    dialogues: "会話",
    grammar: "文法",
    quiz: "テスト",
};

const viewText: Record<View, UiTextId> = {
    kanji: "ui.viewKanji",
    words: "ui.viewWords",
    articles: "ui.viewArticles",
    dialogues: "ui.viewDialogues",
    grammar: "ui.viewGrammar",
    quiz: "ui.viewQuiz",
};

export function viewTitle(_bookId: string, view: View): string {
    return viewTitles[view];
}

export function viewTextId(_bookId: string, view: View): UiTextId {
    return viewText[view];
}
