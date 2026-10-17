export const libraryDisplay = {
    recentResults: 5,
    eyebrow: "少しずつ、毎日。",
    libraryKicker: "LIBRARY",
    recordsKicker: "YOUR LEARNING"
} as const;
export const beginnerBookIds: readonly string[] = ["minna", "katakana-practice", "kanji-daily", "topic"];
export const libraryLevels = [
    {id: "beginner", titleId: "ui.levelBeginner"},
    {id: "intermediate", titleId: "ui.levelIntermediate"},
] as const;
