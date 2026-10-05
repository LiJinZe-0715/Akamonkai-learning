import type { View } from "../../domain/catalog";
export const viewTitles: Record<View, string> = {
  words: "単語帳", "word-test": "単語テスト", grammar: "文法・例文",
  "grammar-test": "文法テスト", kanji: "漢字・例文", "reading-test": "漢字の読み方", katakana: "カタカナテスト",
};
export const viewText: Record<View, string> = {
  words: "ui.viewWords", "word-test": "ui.viewWordTest", grammar: "ui.viewGrammar",
  "grammar-test": "ui.viewGrammarTest", kanji: "ui.viewKanji",
  "reading-test": "ui.viewReadingTest", katakana: "ui.viewKatakana",
};
