import type {View} from "../../domain/catalog";

export const viewTitles: Record<View, string> = {
    words: "単語帳", "word-test": "単語テスト", grammar: "文法・例文",
    "grammar-test": "文法テスト", kanji: "漢字・語彙", "reading-test": "テスト", katakana: "カタカナテスト",
};
export const viewText: Record<View, string> = {
    words: "ui.viewWords", "word-test": "ui.viewWordTest", grammar: "ui.viewGrammar",
    "grammar-test": "ui.viewGrammarTest", kanji: "ui.viewKanji",
    "reading-test": "ui.viewReadingTest", katakana: "ui.viewKatakana",
};

// A vocabulary book carries the textbook's 練習 problems rather than grammar notes,
// so its test view needs its own wording without renaming the view for every book.
const viewOverrides: Record<string, Partial<Record<View, { title: string; text: string }>>> = {
    "soumatome-n2-vocab": {
        "grammar-test": {title: "練習テスト", text: "ui.viewPracticeTest"},
    },
};

export function viewTitle(bookId: string, view: View): string {
    return viewOverrides[bookId]?.[view]?.title ?? viewTitles[view];
}

export function viewTextId(bookId: string, view: View): string {
    return viewOverrides[bookId]?.[view]?.text ?? viewText[view];
}
