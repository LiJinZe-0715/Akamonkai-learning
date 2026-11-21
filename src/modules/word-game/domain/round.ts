import {gameConfig} from "./config";
import type {Bubble, Chip, GameWord, Random, RoundResult, RoundState} from "./types";

/** 连击对应的得分倍数。 */
export function comboMultiplier(combo: number): number {
    return Math.min(gameConfig.maxMultiplier, 1 + Math.floor(combo / gameConfig.comboStep));
}

/** 开一局：words 是这一关要爆的词，pool 是假牌候选。 */
export function startRound(words: readonly GameWord[], pool: readonly GameWord[], random: Random): RoundState {
    const queue = words.map(word => word.id);
    // Fisher–Yates，从后往前：每一趟的随机次数固定，同一 random 序列必然得到同一顺序。
    for (let at = queue.length - 1; at > 0; at--) {
        const swap = Math.floor(random() * (at + 1));
        [queue[at], queue[swap]] = [queue[swap], queue[at]];
    }
    return {
        status: words.length ? "playing" : "cleared",
        words,
        pool,
        bubbles: [],
        chips: Array.from({length: gameConfig.chipSlots}, () => null),
        hearts: gameConfig.hearts,
        combo: 0,
        maxCombo: 0,
        score: 0,
        speed: gameConfig.speed.start,
        misses: 0,
        cleared: [],
        missed: [],
        queue,
        returning: [],
        spawnIn: 0,
        nextKey: 1,
    };
}

/** 时间往前走 elapsedMs 毫秒：泡泡上漂、出新泡泡、漏掉的扣心、讲解倒计时。 */
export function tick(state: RoundState, elapsedMs: number, random: Random): RoundState {
    if (state.status === "cleared" || state.status === "failed") return state;
    const elapsed = Number.isFinite(elapsedMs) ? Math.min(Math.max(elapsedMs, 0), gameConfig.maxTickMs) : 0;

    if (state.status === "teaching" && state.teaching) {
        const remaining = state.teaching.remaining - elapsed;
        // 讲解期间泡泡不动、不出新泡泡，spawnIn 也不走。
        if (remaining > 0) return {...state, teaching: {...state.teaching, remaining}};
        const {teaching: _finished, ...rest} = state;
        return settle({...rest, status: "playing"});
    }

    const risen = state.bubbles.map(bubble => ({
        ...bubble,
        height: bubble.height + (elapsed * state.speed) / gameConfig.riseMs,
    }));

    // 一次 tick 最多处理一个漏掉的泡泡；同高取 key 小的。
    let escaped: Bubble | undefined;
    for (const bubble of risen) {
        if (bubble.height < 1) continue;
        if (!escaped || bubble.height > escaped.height || (bubble.height === escaped.height && bubble.key < escaped.key))
            escaped = bubble;
    }
    if (escaped) return miss({...state, bubbles: risen.filter(bubble => bubble !== escaped)}, escaped.wordId, "escaped");

    let bubbles: readonly Bubble[] = risen;
    let queue = state.queue;
    let returning = state.returning;
    let nextKey = state.nextKey;
    let spawnIn = state.spawnIn - elapsed;
    let spawned = false;

    if ((bubbles.length === 0 || spawnIn <= 0) && bubbles.length < gameConfig.maxBubbles) {
        const occupied = new Set(bubbles.map(bubble => bubble.lane));
        const lanes: number[] = [];
        for (let lane = 0; lane < gameConfig.lanes; lane++) if (!occupied.has(lane)) lanes.push(lane);
        const pick = lanes.length ? nextWord(queue, returning) : undefined;
        if (pick) {
            if (pick.from === "queue") queue = queue.slice(1);
            returning = (pick.from === "returning" ? returning.filter((_, at) => at !== pick.at) : returning)
                .map(item => ({...item, wait: item.wait - 1}));
            const lane = lanes[Math.floor(random() * lanes.length)];
            bubbles = [...bubbles, {key: nextKey, wordId: pick.wordId, lane, height: 0}];
            nextKey += 1;
            spawnIn = gameConfig.spawnMs / state.speed;
            spawned = true;
        }
    }
    if (!spawned && spawnIn < 0) spawnIn = 0;

    return settle(refill({...state, bubbles, queue, returning, spawnIn, nextKey}, random));
}

/** 点第 slot 格的释义牌。 */
export function pickChip(state: RoundState, slot: number, random: Random): RoundState {
    if (state.status !== "playing") return state;
    if (!Number.isInteger(slot) || slot < 0 || slot >= gameConfig.chipSlots) return state;
    const chip = state.chips[slot];
    if (!chip) return state;

    const bubble = state.bubbles.find(item => item.wordId === chip.wordId);
    if (!bubble) {
        const chips = state.chips.map((item, at) => (at === slot ? null : item));
        const missed = miss({...state, chips}, chip.wordId, "wrong");
        return missed.status === "failed" ? missed : refill(missed, random);
    }

    const bubbles = state.bubbles.filter(item => item !== bubble);
    const chipSlots = state.chips.map((item, at) => (at === slot ? null : item));
    const combo = state.combo + 1;
    const popped: RoundState = {
        ...state,
        bubbles,
        chips: chipSlots,
        cleared: [...state.cleared, bubble.wordId],
        combo,
        maxCombo: Math.max(state.maxCombo, combo),
        score: state.score + gameConfig.popScore * comboMultiplier(combo),
        speed: Math.min(gameConfig.speed.max, state.speed + gameConfig.speed.popStep),
        hearts: combo % gameConfig.heartEvery === 0 && state.hearts < gameConfig.hearts ? state.hearts + 1 : state.hearts,
        // 场上空了就立刻补一个，不用等满出泡间隔。
        spawnIn: bubbles.length === 0 ? 0 : state.spawnIn,
    };
    return settle(refill(popped, random));
}

/** 结算。任何状态下都能调，没结束时给的是当前的数。 */
export function roundResult(state: RoundState): RoundResult {
    const cleared = state.status === "cleared";
    const stars: RoundResult["stars"] =
        !cleared ? 0 : state.misses === 0 ? 3 : state.misses <= gameConfig.twoStarMisses ? 2 : 1;
    return {
        cleared,
        score: state.score,
        stars,
        maxCombo: state.maxCombo,
        misses: state.misses,
        total: state.words.length,
        clearedCount: state.cleared.length,
        missedWordIds: state.missed,
    };
}

/* ── 内部辅助 ─────────────────────────────────────────────── */

/** 两个词的答案撞在一起：同词义、同写法或同读音都不能一个当泡泡一个当假牌。 */
const conflict = (left: GameWord, right: GameWord): boolean =>
    left.answerKey === right.answerKey || left.word === right.word || left.reading === right.reading;

/** 场上的词用的索引：本关的词优先，池里的词补上。 */
function wordIndex(state: RoundState): Map<string, GameWord> {
    const index = new Map<string, GameWord>();
    for (const word of state.pool) if (!index.has(word.id)) index.set(word.id, word);
    for (const word of state.words) index.set(word.id, word);
    return index;
}

/** 高的在前，并列 key 小的在前。 */
const byHeightThenKey = (left: Bubble, right: Bubble): number => right.height - left.height || left.key - right.key;

function indexes<T>(items: readonly T[], match: (item: T) => boolean): number[] {
    const found: number[] = [];
    for (let at = 0; at < items.length; at++) if (match(items[at])) found.push(at);
    return found;
}

/** 下一个出场的词：等够了的重来词 → 队首 → 还得等最少的重来词。 */
function nextWord(queue: readonly string[], returning: RoundState["returning"]):
    { wordId: string; from: "queue" | "returning"; at: number } | undefined {
    const ready = returning.findIndex(item => item.wait <= 0);
    if (ready >= 0) return {wordId: returning[ready].wordId, from: "returning", at: ready};
    if (queue.length) return {wordId: queue[0], from: "queue", at: 0};
    if (!returning.length) return undefined;
    let best = 0;
    for (let at = 1; at < returning.length; at++) if (returning[at].wait < returning[best].wait) best = at;
    return {wordId: returning[best].wordId, from: "returning", at: best};
}

/** 失败/通关判定：没有待出场、没有重来、场上也没有泡泡。 */
function settle(state: RoundState): RoundState {
    if (state.status === "playing" && !state.queue.length && !state.returning.length && !state.bubbles.length)
        return {...state, status: "cleared"};
    return state;
}

/** 一次失误：扣心、清零连击、减速，并让这个词稍后重来。 */
function miss(state: RoundState, wordId: string, reason: "wrong" | "escaped"): RoundState {
    let cleared = state.cleared;
    let returning = state.returning;
    // 只有这一关的词才需要重来；池里的假牌词只记进 missed。
    if (state.words.some(word => word.id === wordId)) {
        if (reason === "escaped") {
            returning = [...returning, {wordId, wait: gameConfig.returnAfter}];
        } else if (cleared.includes(wordId)) {
            cleared = cleared.filter(id => id !== wordId);
            returning = [...returning, {wordId, wait: gameConfig.returnAfter}];
        }
    }
    const base = {
        ...state,
        hearts: state.hearts - 1,
        misses: state.misses + 1,
        combo: 0,
        speed: Math.max(gameConfig.speed.min, state.speed * gameConfig.speed.missFactor),
        cleared,
        returning,
        missed: state.missed.includes(wordId) ? state.missed : [...state.missed, wordId],
        chips: state.chips.map(chip => (chip && chip.wordId === wordId ? null : chip)),
    };
    if (base.hearts <= 0) return {...base, status: "failed"};
    return {...base, status: "teaching", teaching: {wordId, reason, remaining: gameConfig.teachMs}};
}

/** 补牌：清掉冲突的假牌、保证最高的几个泡泡有牌、剩下的空格补假牌。 */
function refill(state: RoundState, random: Random): RoundState {
    const index = wordIndex(state);
    const field = state.bubbles
        .map(bubble => index.get(bubble.wordId))
        .filter((word): word is GameWord => !!word);
    const fieldIds = new Set(field.map(word => word.id));
    let chips: (Chip | null)[] = state.chips.slice();
    let nextKey = state.nextKey;

    // 1. 指向场外、却与场上某词冲突的假牌必须清掉。
    chips = chips.map(chip => {
        if (!chip || fieldIds.has(chip.wordId)) return chip;
        const word = index.get(chip.wordId);
        return word && field.some(onField => conflict(word, onField)) ? null : chip;
    });

    // 2. 最高的 coveredBubbles 个泡泡，每个都得有一张牌。
    for (const bubble of [...state.bubbles].sort(byHeightThenKey).slice(0, gameConfig.coveredBubbles)) {
        if (chips.some(chip => chip?.wordId === bubble.wordId)) continue;
        const empty = indexes(chips, chip => chip === null);
        const idle = indexes(chips, chip => chip !== null && !fieldIds.has(chip.wordId));
        let slot: number;
        if (empty.length) {
            slot = empty[Math.floor(random() * empty.length)];
        } else if (idle.length) {
            slot = idle[Math.floor(random() * idle.length)];
        } else {
            // 四格全是场上的词，只能顶掉最低那个泡泡的牌。
            const lowest = [...state.bubbles].sort((left, right) => left.height - right.height || left.key - right.key)[0];
            slot = lowest ? chips.findIndex(chip => chip?.wordId === lowest.wordId) : -1;
            if (slot < 0) continue;
        }
        chips[slot] = {key: nextKey, wordId: bubble.wordId};
        nextKey += 1;
    }

    // 3. 剩下的空格补假牌；场上没泡泡就不补。
    if (state.bubbles.length) {
        const tallest = [...state.bubbles].sort(byHeightThenKey)[0];
        const preferred = index.get(tallest.wordId)?.pos;
        for (let slot = 0; slot < chips.length; slot++) {
            if (chips[slot] !== null) continue;
            const taken = new Set(chips.flatMap(chip => (chip ? [chip.wordId] : [])));
            const keys = new Set(chips.flatMap(chip => {
                const word = chip ? index.get(chip.wordId) : undefined;
                return word ? [word.answerKey] : [];
            }));
            const candidates = state.pool.filter(word =>
                !fieldIds.has(word.id) &&
                !taken.has(word.id) &&
                !keys.has(word.answerKey) &&
                !field.some(onField => conflict(word, onField)));
            const family = preferred === undefined ? [] : candidates.filter(word => word.pos === preferred);
            const usable = family.length ? family : candidates;
            if (!usable.length) continue;
            chips[slot] = {key: nextKey, wordId: usable[Math.floor(random() * usable.length)].id};
            nextKey += 1;
        }
    }

    if (nextKey === state.nextKey && chips.every((chip, at) => chip === state.chips[at])) return state;
    return {...state, chips, nextKey};
}
