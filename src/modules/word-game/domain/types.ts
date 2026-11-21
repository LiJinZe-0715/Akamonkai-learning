import type {TextId} from "../../../shared/kernel/text-types";

/**
 * 出题只需要的字段：不直接依赖 vocabulary 模块的 Word，传进来的对象结构兼容即可。
 */
export interface GameWordSource {
    readonly id: string;
    readonly word: string;
    readonly reading: string;
    readonly meaningId: TextId;
    readonly pos?: string;
}

/** 进了游戏的词：多一个归一化的词义，用来判断两个词的答案是不是同一个。 */
export interface GameWord extends GameWordSource {
    /** 词义文本去掉首尾空白并转小写。两个词 answerKey 相同，就不能一个当泡泡一个当假牌。 */
    readonly answerKey: string;
}

/** 场上的一个泡泡。 */
export interface Bubble {
    /** 本局内唯一，渲染时当 key 用。 */
    readonly key: number;
    readonly wordId: string;
    /** 第几列，从 0 开始。 */
    readonly lane: number;
    /** 0 是刚从底部出现，1 是到达顶线。 */
    readonly height: number;
}

/** 一张释义牌。牌上的词在场上有泡泡就是正确的牌，没有就是假牌。 */
export interface Chip {
    /** 本局内唯一，渲染时当 key 用。 */
    readonly key: number;
    readonly wordId: string;
}

/** 失误后的讲解：停住泡泡，告诉玩家这个词是什么。 */
export interface Teaching {
    readonly wordId: string;
    /** wrong 是点了假牌，escaped 是泡泡漂到了顶线。 */
    readonly reason: "wrong" | "escaped";
    /** 还要停多少毫秒。 */
    readonly remaining: number;
}

export type RoundStatus = "playing" | "teaching" | "cleared" | "failed";

/** 一局的完整状态。不可变：每次操作都返回新对象。 */
export interface RoundState {
    readonly status: RoundStatus;
    /** 这一关要爆掉的词，教材顺序。 */
    readonly words: readonly GameWord[];
    /** 假牌的候选，通常是整课的词，包含这一关的词。 */
    readonly pool: readonly GameWord[];
    readonly bubbles: readonly Bubble[];
    /** 长度恒为 gameConfig.chipSlots，下标就是格子；没有候选时是 null。 */
    readonly chips: readonly (Chip | null)[];
    readonly hearts: number;
    readonly combo: number;
    readonly maxCombo: number;
    readonly score: number;
    readonly speed: number;
    /** 失误总数：点假牌 + 漏掉泡泡。 */
    readonly misses: number;
    /** 已经干净爆掉的词 id。 */
    readonly cleared: readonly string[];
    /** 这局失误过的词 id，按第一次失误的顺序，不重复。 */
    readonly missed: readonly string[];
    /** 还没出场的词 id，队首先出。 */
    readonly queue: readonly string[];
    /** 失误后等着重新出场的词；wait 是还要等几个别的泡泡。 */
    readonly returning: readonly { readonly wordId: string; readonly wait: number }[];
    /** 距离下一个泡泡出现还有多少毫秒。 */
    readonly spawnIn: number;
    readonly teaching?: Teaching;
    /** 下一个泡泡或牌用的 key。 */
    readonly nextKey: number;
}

/** 一局的结算。 */
export interface RoundResult {
    readonly cleared: boolean;
    readonly score: number;
    /** 没通关是 0；通关按失误数给 1–3。 */
    readonly stars: 0 | 1 | 2 | 3;
    readonly maxCombo: number;
    readonly misses: number;
    /** 这一关的词数。 */
    readonly total: number;
    /** 干净爆掉的词数。 */
    readonly clearedCount: number;
    readonly missedWordIds: readonly string[];
}

/** 随机源，返回 [0, 1)；测试里注入固定序列。 */
export type Random = () => number;
