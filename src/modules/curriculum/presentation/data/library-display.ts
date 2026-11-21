import {libraryLevels, type LibraryLevel} from "../../public";
import type {UiTextId} from "../../../localization/public";

/** Fixed library copy that never goes through the translation catalog. */
export const libraryDisplay = {
    recentLimit: 5,
} as const;
// Books carry their own level in the catalog, so adding a textbook never needs a code change.
export const libraryLevelTitles: Record<LibraryLevel, UiTextId> = {
    beginner: "ui.levelBeginner",
    "mid-intermediate": "ui.levelMidIntermediate",
    intermediate: "ui.levelIntermediate",
    "jlpt-grammar": "ui.levelJlptGrammar",
    "jlpt-shiken": "ui.levelJlptShiken",
};
export const libraryLevelOrder: readonly LibraryLevel[] = libraryLevels;
