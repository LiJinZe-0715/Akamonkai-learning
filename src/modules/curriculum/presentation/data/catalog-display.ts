export const libraryDisplay = {
    recentResults: 5,
    eyebrow: "少しずつ、毎日。",
    libraryKicker: "LIBRARY",
    recordsKicker: "YOUR LEARNING"
} as const;
export const libraryLevels = [
    {id: "beginner", titleId: "ui.levelBeginner", bookIds: ["minna", "katakana-practice", "kanji-daily", "topic"]},
    {id: "jlpt-grammar", titleId: "ui.levelJlptGrammar", bookIds: ["n2"]},
    {id: "intermediate", titleId: "ui.levelIntermediate", bookIds: ["chukyu", "kanji-700", "try-n2", "soumatome-n2-vocab"]},
] as const;
