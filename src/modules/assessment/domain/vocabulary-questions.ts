import type {Segment} from "../../../shared/kernel/text-types";
import type {Question} from "./question";

/**
 * 只取生成题目需要的字段：assessment 不直接依赖 vocabulary 模块，
 * 否则 vocabulary -> assessment/public -> assessment/application 会成环。
 */
export interface VocabularyQuestionSource {
    readonly id: string;
    readonly word: string;
    readonly reading: string;
    readonly meaningId: string;
}

/**
 * 单词测验题在打开测验页时现场生成，不落盘。
 *
 * 教材里的固定题按原顺序出、不打乱；这一类是练习用的，干扰项和正确答案的
 * 位置都要打乱，否则「全选 A 就满分」。随机源可注入，测试里能固定种子。
 */
export function buildVocabularyQuestions(
    words: readonly VocabularyQuestionSource[],
    meaning: (id: string) => string,
    random: () => number = Math.random,
    alternativeMeaning?: (id: string) => string,
): Question[] {
    const normalize = (text: string) => text.trim().toLowerCase();
    const shuffled = <T,>(items: readonly T[]): T[] => {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index--) {
            const other = Math.floor(random() * (index + 1));
            [result[index], result[other]] = [result[other], result[index]];
        }
        return result;
    };
    return words.flatMap((word) => {
        const answerText = normalize(meaning(word.meaningId));
        const alternatives = new Set(alternativeMeaning ? [normalize(alternativeMeaning(word.meaningId))] : []);
        const seen = new Set([answerText]);
        const distractors = words.filter((candidate) => {
            const text = normalize(meaning(candidate.meaningId));
            const alternative = alternativeMeaning ? normalize(alternativeMeaning(candidate.meaningId)) : undefined;
            if (candidate.word === word.word || candidate.reading === word.reading || seen.has(text)
                || (alternative !== undefined && alternatives.has(alternative))) return false;
            seen.add(text);
            if (alternative !== undefined) alternatives.add(alternative);
            return true;
        });
        const chosen = shuffled(distractors).slice(0, 3);
        if (!chosen.length) return [];
        const options = [word, ...chosen];
        // order[newIndex] = 原下标；正确项原来在 0。
        const order = shuffled(options.map((_, index) => index));
        const segments: readonly (readonly Segment[])[] = order.map((original) =>
            [{textId: options[original].meaningId}]);
        return [{
            kind: "choice",
            id: "vocabulary-quiz." + word.id,
            prompt: [{japanese: word.word + "（" + word.reading + "）"}],
            options: segments,
            correctOptionIndexes: [order.indexOf(0)],
        } as Question];
    });
}
