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

/** 生成题的 id 前缀；测验页靠它把题归回来源模块。 */
export const vocabularyQuizIdPrefix = "vocabulary-quiz.";

/**
 * 由字符串派生确定性随机源（FNV-1a 播种 + mulberry32）。
 *
 * 现场词题必须「同一课每次生成同一套题」：草稿签名记着每题的正确答案下标，
 * 每次打开都换一套选项顺序会让签名失配，已答答案被静默丢弃。
 * 种子用课 id，所以刷新、切页签、重进都还原成同一套题。
 */
export function seededRandom(seed: string): () => number {
    let state = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        state ^= seed.charCodeAt(index);
        state = Math.imul(state, 16777619);
    }
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
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
    // 释义只规范化一次。按词逐个重算全部候选是 O(n²) 次查表 + 正则，
    // 词表上千时打开测验页会明显卡顿。
    const meanings = words.map(word => normalize(meaning(word.meaningId)));
    const alternativeMeanings = alternativeMeaning
        ? words.map(word => normalize(alternativeMeaning(word.meaningId)))
        : undefined;
    return words.flatMap((word, index): Question[] => {
        const answerText = meanings[index];
        const answerAlternative = alternativeMeanings?.[index];
        const seen = new Set([answerText]);
        const seenAlternatives = new Set(answerAlternative === undefined ? [] : [answerAlternative]);
        const distractors = words.filter((candidate, candidateIndex) => {
            if (candidateIndex === index) return false;
            const text = meanings[candidateIndex];
            const alternative = alternativeMeanings?.[candidateIndex];
            if (candidate.word === word.word || candidate.reading === word.reading || seen.has(text)
                || (alternative !== undefined && seenAlternatives.has(alternative))) return false;
            seen.add(text);
            if (alternative !== undefined) seenAlternatives.add(alternative);
            return true;
        });
        const chosen = shuffled(distractors).slice(0, 3);
        if (!chosen.length) return [];
        const options = [word, ...chosen];
        // order[newIndex] = 原下标；正确项原来在 0。
        const order = shuffled(options.map((_, position) => position));
        const segments: readonly (readonly Segment[])[] = order.map((original) =>
            [{textId: options[original].meaningId}]);
        return [{
            kind: "choice",
            id: vocabularyQuizIdPrefix + word.id,
            prompt: [{japanese: word.word + "（" + word.reading + "）"}],
            options: segments,
            answer: [order.indexOf(0)],
        }];
    });
}
