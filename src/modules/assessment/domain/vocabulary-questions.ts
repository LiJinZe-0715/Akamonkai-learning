import type { Segment } from "../../../shared/kernel/types";
import type { Question } from "./assessment";
export interface VocabularyQuestionSource {
  id: string;
  wordJa: string;
  readingJa: string;
  meaningId: string;
}
export function buildVocabularyQuestions(
    words: readonly VocabularyQuestionSource[],
    meaning: (id: string) => string,
    alternativeMeaning?: (id: string) => string,
  ): Question[] {
    return words.flatMap((word, index) => {
      const normalize = (text: string) => text.trim().toLowerCase();
      const correct = normalize(meaning(word.meaningId));
      const seen = new Set([correct]);
      const alternatives = new Set(alternativeMeaning ? [normalize(alternativeMeaning(word.meaningId))] : []);
      const distractors = words.filter((w) => {
        const text = normalize(meaning(w.meaningId));
        const alternative = alternativeMeaning ? normalize(alternativeMeaning(w.meaningId)) : undefined;
        if (
          w.wordJa === word.wordJa ||
          w.readingJa === word.readingJa ||
          seen.has(text) || (alternative !== undefined && alternatives.has(alternative))
        )
          return false;
        seen.add(text);
        if (alternative !== undefined) alternatives.add(alternative);
        return true;
      });
      const chosen = distractors
        .slice(index % distractors.length)
        .concat(distractors.slice(0, index % distractors.length))
        .slice(0, 3);
      if (chosen.length < 1) return [];
      const options: Segment[][] = [word, ...chosen].map((w) => [
        { textId: w.meaningId },
      ]);
      return [
        {
          id: "vocabulary-test." + word.id,
          prompt: [{ ja: word.wordJa + "（" + word.readingJa + "）" }],
          options,
          accepted: [0],
          explanationId: word.meaningId,
        },
      ];
    });
  }
