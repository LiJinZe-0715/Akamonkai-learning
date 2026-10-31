import {libraryLevels, type LibraryLevel} from "../../domain/catalog";

export const libraryDisplay = {
    recentResults: 5,
    eyebrow: "少しずつ、毎日。",
    libraryKicker: "LIBRARY",
    recordsKicker: "YOUR LEARNING"
} as const;
// Books carry their own level in the catalog, so adding a textbook never needs a code change.
export const libraryLevelTitles: Record<LibraryLevel, string> = {
    beginner: "ui.levelBeginner",
    "jlpt-grammar": "ui.levelJlptGrammar",
    intermediate: "ui.levelIntermediate",
};
export const libraryLevelOrder: readonly LibraryLevel[] = libraryLevels;
