import {gameConfig} from "./config";
import type {GameWord, GameWordSource} from "./types";

/** 把词表里的词变成游戏用的词：answerKey 取 meaning(meaningId) 去首尾空白并转小写。 */
export function toGameWords(words: readonly GameWordSource[], meaning: (id: string) => string): GameWord[] {
    return words.map(source => ({
        id: source.id,
        word: source.word,
        reading: source.reading,
        meaningId: source.meaningId,
        ...(source.pos === undefined ? {} : {pos: source.pos}),
        answerKey: meaning(source.meaningId).trim().toLowerCase(),
    }));
}

/** 按教材顺序均分成若干关：关数是 ceil(n / size)，各关词数最多相差 1，前面的关不比后面的少。空词表返回 []。 */
export function splitStages<T>(words: readonly T[], size: number = gameConfig.stageSize): T[][] {
    if (words.length === 0) return [];
    // 关数由「每关最多 size 个」推出，再均分总数：余数从第一关起每关补一个。
    const count = Math.ceil(words.length / size);
    const base = Math.floor(words.length / count);
    const remainder = words.length - base * count;
    const stages: T[][] = [];
    let start = 0;
    for (let index = 0; index < count; index++) {
        const length = base + (index < remainder ? 1 : 0);
        stages.push(words.slice(start, start + length));
        start += length;
    }
    return stages;
}
