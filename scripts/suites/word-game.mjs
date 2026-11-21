import assert from "../assertions.mjs";
import {test} from "../harness.mjs";

/**
 * 单词游戏规则引擎。
 *
 * 全部是纯函数，所以这里不用夹具：自己造词、自己给随机序列。
 * 随机源用线性同余（固定种子 → 固定序列），失败能原样复现。
 */

/** 造一个 GameWord；meaning 就是归一化后的 answerKey。 */
function makeWord(id, form, reading, meaning, pos) {
    const word = {id, word: form, reading, meaningId: `${id}.meaning`, answerKey: meaning};
    if (pos !== undefined) word.pos = pos;
    return word;
}

/** 一批互不冲突的词，词性交替，用来跑整局。 */
function lesson(count, prefix = "w") {
    return Array.from({length: count}, (_, index) => makeWord(
        `${prefix}${index}`,
        `${prefix}形${index}`,
        `${prefix}よ${index}`,
        `${prefix}義${index}`,
        index % 2 ? "noun" : "verb",
    ));
}

function engine(load) {
    return {
        ...load("src/modules/word-game/domain/stages.ts"),
        ...load("src/modules/word-game/domain/round.ts"),
        gameConfig: load("src/modules/word-game/domain/config.ts").gameConfig,
    };
}

/** 线性同余随机源：同一个种子给出同一串数。 */
function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, `${message}：${actual} ≠ ${expected}`);

/** 场上最高的、且确实有牌可点的泡泡在哪一格。没有就返回 -1。 */
function correctSlot(state) {
    const playable = state.bubbles
        .filter(bubble => state.chips.some(chip => chip && chip.wordId === bubble.wordId))
        .sort((left, right) => right.height - left.height || left.key - right.key);
    if (!playable.length) return -1;
    return state.chips.findIndex(chip => chip && chip.wordId === playable[0].wordId);
}

/** 「词的位置」不变量：每个词恰好在队列、场上、重来表、已爆列表之一。 */
function assertPlacement(g, state, label = "") {
    assert.equal(state.chips.length, g.gameConfig.chipSlots, `${label}牌的格数必须固定`);
    const field = new Set(state.bubbles.map(bubble => bubble.wordId));
    const queue = new Set(state.queue);
    const returning = new Set(state.returning.map(item => item.wordId));
    const cleared = new Set(state.cleared);
    assert.equal(field.size, state.bubbles.length, `${label}一个词不能同时有两个泡泡`);
    assert.equal(queue.size, state.queue.length, `${label}队列有重复`);
    assert.equal(returning.size, state.returning.length, `${label}重来表有重复`);
    assert.equal(cleared.size, state.cleared.length, `${label}已爆列表有重复`);
    for (const word of state.words) {
        const places = [queue.has(word.id), field.has(word.id), returning.has(word.id), cleared.has(word.id)]
            .filter(Boolean).length;
        assert.equal(places, 1, `${label}词 ${word.id} 同时处在 ${places} 个位置`);
    }
    const index = new Map([...state.pool, ...state.words].map(word => [word.id, word]));
    const conflict = (left, right) => left.answerKey === right.answerKey || left.word === right.word || left.reading === right.reading;
    for (const chip of state.chips) {
        if (!chip) continue;
        const word = index.get(chip.wordId);
        assert(word, `${label}牌必须指向池里的词：${chip.wordId}`);
        if (field.has(chip.wordId)) continue;
        for (const onFieldId of field) {
            const onField = index.get(onFieldId);
            assert(onField && !conflict(word, onField), `${label}假牌 ${chip.wordId} 与场上词 ${onFieldId} 冲突`);
        }
    }
}

/** 点最该点的牌；没牌可点就等时间。 */
function popBest(g, state, random) {
    const slot = correctSlot(state);
    assert(slot >= 0, "场上应当有可点的牌");
    return g.pickChip(state, slot, random);
}

/** 永远点正确的牌，直到通关或失败。 */
function autoplay(g, state, random, onStep) {
    let current = state;
    for (let guard = 0; guard < 20000 && (current.status === "playing" || current.status === "teaching"); guard++) {
        if (current.status === "teaching") {
            current = g.tick(current, g.gameConfig.maxTickMs, random);
        } else {
            const slot = correctSlot(current);
            current = slot >= 0
                ? g.pickChip(current, slot, random)
                : g.tick(current, g.gameConfig.maxTickMs, random);
        }
        onStep?.(current);
    }
    return current;
}

/** 连点 times 次正确的牌。 */
function popCorrect(g, state, random, times) {
    let current = state;
    for (let index = 0; index < times; index++) {
        while (current.status === "teaching") current = g.tick(current, g.gameConfig.maxTickMs, random);
        if (!current.bubbles.length) current = g.tick(current, g.gameConfig.maxTickMs, random);
        current = popBest(g, current, random);
    }
    return current;
}

/** 点一张假牌（牌上的词不在场上）。 */
function clickFake(g, state, random) {
    let current = state;
    while (current.status === "teaching") current = g.tick(current, g.gameConfig.maxTickMs, random);
    const slot = current.chips.findIndex(chip => chip && !current.bubbles.some(bubble => bubble.wordId === chip.wordId));
    assert(slot >= 0, "场上必须存在假牌");
    return g.pickChip(current, slot, random);
}

/** 把讲解时间走完。tick 每次最多走 maxTickMs，所以不能一步跳完。 */
function finishTeaching(g, state, random) {
    let current = state;
    for (let guard = 0; guard < 500 && current.status === "teaching"; guard++)
        current = g.tick(current, g.gameConfig.maxTickMs, random);
    return current;
}

/* ── 关卡切分 ─────────────────────────────────────────────── */

test("游戏规则：按教材顺序均分关卡，词义归一化", ["game:stages"], ({load}) => {
    const g = engine(load);
    const range = count => Array.from({length: count}, (_, index) => index);

    assert.deepEqual(g.splitStages([]), [], "空词表没有关卡");
    assert.deepEqual(g.splitStages(range(1)), [[0]]);
    assert.deepEqual(g.splitStages(range(20)).map(stage => stage.length), [20]);
    assert.deepEqual(g.splitStages(range(21)).map(stage => stage.length), [11, 10]);
    assert.deepEqual(g.splitStages(range(41)).map(stage => stage.length), [14, 14, 13]);
    assert.deepEqual(g.splitStages(range(45)).map(stage => stage.length), [15, 15, 15]);
    assert.deepEqual(g.splitStages(range(10), 4).map(stage => stage.length), [4, 3, 3], "自定义每关上限");

    const items = range(45).map(index => ({index}));
    const stages = g.splitStages(items);
    assert.deepEqual(stages.flat(), items, "切分必须连续且保持原顺序");
    assert(stages.every(stage => stage.every((item, at) => at === 0 || item.index === stage[at - 1].index + 1)));
    for (let at = 1; at < stages.length; at++) {
        assert(stages[at - 1].length >= stages[at].length, "前面的关不比后面的少");
        assert(stages[at - 1].length - stages[at].length <= 1, "各关最多差一个词");
    }

    const meanings = {"m.book": "  Book ", "m.cat": "ねこ", "m.door": "Doorway  "};
    const sources = [
        {id: "a", word: "本", reading: "ほん", meaningId: "m.book"},
        {id: "b", word: "猫", reading: "ねこ", meaningId: "m.cat", pos: "noun"},
        {id: "a", word: "本", reading: "ほん", meaningId: "m.book"},
        {id: "c", word: "扉", reading: "とびら", meaningId: "m.door", pos: "noun"},
    ];
    const words = g.toGameWords(sources, id => meanings[id]);
    assert.deepEqual(words.map(word => word.answerKey), ["book", "ねこ", "book", "doorway"], "词义去空白转小写");
    assert.deepEqual(words.map(word => word.id), ["a", "b", "a", "c"], "保持顺序且不去重");
    assert(!Object.hasOwn(words[0], "pos"), "没有词性就不写这个键");
    assert.equal(words[1].pos, "noun");
    assert.equal(words[0].meaningId, "m.book");
    assert.equal(words[0].word, "本");
});

/* ── 释义牌 ───────────────────────────────────────────────── */

test("游戏规则：释义牌覆盖最高的泡泡，假牌不与场上词同义同音", ["game:chips"], ({load}) => {
    const g = engine(load);
    const config = g.gameConfig;
    const random = seeded(7);

    const target = makeWord("target", "猫", "ねこ", "cat", "noun");
    const nouns = ["dog", "bird", "fish"].map((meaning, index) =>
        makeWord(`noun-${index}`, `名${index}`, `めい${index}`, meaning, "noun"));
    const verbs = ["run", "eat"].map((meaning, index) =>
        makeWord(`verb-${index}`, `動${index}`, `どう${index}`, meaning, "verb"));
    const pool = [target, ...nouns, ...verbs];

    let state = g.startRound([target], pool, random);
    assert.equal(state.bubbles.length, 0, "开局不直接出泡泡");
    state = g.tick(state, config.maxTickMs, random);
    assert.equal(state.bubbles.length, 1, "第一次 tick 出一个泡泡");

    const top = state.bubbles[0];
    assert(state.chips.length === config.chipSlots, "牌的格数恒定");
    assert(state.chips.some(chip => chip && chip.wordId === top.wordId), "最高的泡泡必须在牌里");

    const fakes = state.chips.filter(chip => chip && chip.wordId !== top.wordId);
    assert.equal(fakes.length, config.chipSlots - 1, "剩下的格都补了假牌");
    for (const chip of fakes) {
        const word = pool.find(item => item.id === chip.wordId);
        assert.equal(word.pos, "noun", "优先用与最高泡泡同词性的假牌");
        assert.notEqual(word.answerKey, target.answerKey);
        assert.notEqual(word.word, target.word);
        assert.notEqual(word.reading, target.reading);
    }
    assertPlacement(g, state, "开局");

    // 同义、同写法、同读音的陷阱都不能进牌。
    const traps = [
        makeWord("trap-meaning", "猫科", "ねこか", "cat"),
        makeWord("trap-word", "猫", "にゃん", "kitty"),
        makeWord("trap-reading", "ねこちゃん", "ねこ", "kitty"),
    ];
    const decoys = ["spring", "summer", "autumn", "winter", "morning", "evening"]
        .map((meaning, index) => makeWord(`decoy-${index}`, `語${index}`, `ご${index}`, meaning, "noun"));
    let trapped = g.startRound([target], [target, ...traps, ...decoys], random);
    trapped = g.tick(trapped, config.maxTickMs, random);
    const trapIds = new Set(traps.map(word => word.id));
    assert(trapped.chips.every(chip => !chip || !trapIds.has(chip.wordId)), "冲突的候选不能当假牌");
    assert(trapped.chips.filter(chip => chip).length > 1, "剩余格必须有牌可补");
    assertPlacement(g, trapped, "陷阱");

    // 新泡泡出场后，旧假牌与它冲突就要被清掉。
    const autumn = makeWord("autumn", "秋", "あき", "autumn", "noun");
    const bored = makeWord("bored", "飽き", "あきる", "boredom", "noun");
    const stale = makeWord("stale", "空き", "あきる", "vacancy", "noun");
    const base = g.startRound([autumn, bored], [autumn, bored, stale], random);
    const crafted = {
        ...base,
        queue: ["bored"],
        bubbles: [{key: 50, wordId: "autumn", lane: 0, height: 0.2}],
        chips: [{key: 40, wordId: "stale"}, null, null, null],
        nextKey: 60,
        spawnIn: 0,
    };
    const spawned = g.tick(crafted, config.maxTickMs, random);
    assert(spawned.bubbles.some(bubble => bubble.wordId === "bored"), "队列里的下一个词应当出场");
    assert(!spawned.chips.some(chip => chip && chip.wordId === "stale"), "与场上词同音的假牌必须清掉");
    assertPlacement(g, spawned, "清冲突");

    // 池子太小：留空格而不是报错。
    const lonely = makeWord("only", "本", "ほん", "book", "noun");
    let tiny = g.startRound([lonely], [lonely], random);
    tiny = g.tick(tiny, config.maxTickMs, random);
    assert.equal(tiny.chips.length, config.chipSlots, "空格也要占位");
    assert(tiny.chips.some(chip => chip === null), "没有候选时留 null");
    assert.equal(tiny.chips.filter(chip => chip).length, 1, "只有场上的词有牌");
    assertPlacement(g, tiny, "小池");
});

/* ── 爆泡泡 ───────────────────────────────────────────────── */

test("游戏规则：点对爆泡泡，连击加倍、加速、回心", ["game:pop"], ({load}) => {
    const g = engine(load);
    const config = g.gameConfig;
    const random = seeded(11);
    const words = lesson(60);

    let state = g.startRound(words, words, random);
    state = g.tick(state, config.maxTickMs, random);
    const firstWord = state.bubbles[0].wordId;

    state = popBest(g, state, random);
    assert.equal(state.bubbles.length, 0, "唯一的泡泡被点掉了");
    assert.deepEqual(state.cleared, [firstWord], "爆掉的词进已爆列表");
    assert.equal(state.combo, 1);
    assert.equal(state.score, config.popScore * 1, "第一击按一倍");
    near(state.speed, config.speed.start + config.speed.popStep, "每爆一个加速");

    state = popCorrect(g, state, random, 1);
    assert.equal(state.combo, 2);
    assert.equal(state.score, config.popScore * 2, "二连击仍是一倍");

    state = popCorrect(g, state, random, 1);
    assert.equal(state.combo, 3);
    assert.equal(g.comboMultiplier(3), 2, "三连击倍数变成 2");
    assert.equal(state.score, config.popScore * 4, "100 + 100 + 200");
    near(state.speed, config.speed.start + config.speed.popStep * 3, "速度随爆数上升");

    // 一路点到速度上限，不能超过。
    let capped = g.startRound(words, words, random);
    let guard = 0;
    while (capped.speed < config.speed.max) {
        assert(capped.status === "playing", "打到速度上限前不能通关");
        assert(guard++ < 100, "速度必须能到上限");
        if (!capped.bubbles.length) capped = g.tick(capped, config.maxTickMs, random);
        capped = popBest(g, capped, random);
        assert(capped.speed <= config.speed.max, "速度不得超过上限");
    }
    assert.equal(capped.speed, config.speed.max);

    // 先丢一颗心，再连爆 8 个回心；回满后不再增加。
    let beaten = g.startRound(words, words, random);
    beaten = g.tick(beaten, config.maxTickMs, random);
    beaten = clickFake(g, beaten, random);
    assert.equal(beaten.hearts, config.hearts - 1, "点假牌扣一颗心");
    assert(beaten.status === "teaching");
    beaten = finishTeaching(g, beaten, random);
    assert.equal(beaten.status, "playing");
    assert.equal(beaten.teaching, undefined);
    beaten = popCorrect(g, beaten, random, config.heartEvery);
    assert.equal(beaten.combo, config.heartEvery);
    assert.equal(beaten.hearts, config.hearts, "连击满 heartEvery 回一颗心");
    beaten = popCorrect(g, beaten, random, config.heartEvery);
    assert.equal(beaten.hearts, config.hearts, "回心不超过上限");
});

/* ── 失误与讲解 ───────────────────────────────────────────── */

test("游戏规则：点错或漏掉扣心讲解，该词稍后重来", ["game:miss"], ({load}) => {
    const g = engine(load);
    const config = g.gameConfig;
    const random = seeded(17);
    const words = lesson(20);

    let state = g.startRound(words, words, random);
    state = g.tick(state, config.maxTickMs, random);
    state = popBest(g, state, random);
    assert.equal(state.combo, 1, "先攒一次连击");
    state = g.tick(state, config.maxTickMs, random);
    const fieldWord = state.bubbles[0].wordId;

    // 点假牌
    const fakeSlot = state.chips.findIndex(chip => chip && chip.wordId !== fieldWord);
    assert(fakeSlot >= 0);
    const fakeWord = state.chips[fakeSlot].wordId;
    const wrong = g.pickChip(state, fakeSlot, random);
    assert.equal(wrong.status, "teaching");
    assert.equal(wrong.hearts, config.hearts - 1);
    assert.equal(wrong.misses, 1);
    assert.equal(wrong.combo, 0, "失误清零连击");
    assert(wrong.missed.includes(fakeWord), "失误的词记进 missed");
    assert.deepEqual(wrong.teaching, {wordId: fakeWord, reason: "wrong", remaining: config.teachMs});
    near(wrong.speed, (config.speed.start + config.speed.popStep) * config.speed.missFactor, "失误按 missFactor 减速");
    assertPlacement(g, wrong, "点错");

    // 讲解期间：泡泡不动、不出新泡泡、spawnIn 不减少、点牌无效
    const frozen = g.tick(wrong, config.maxTickMs, random);
    assert.equal(frozen.status, "teaching");
    assert.equal(frozen.teaching.remaining, config.teachMs - config.maxTickMs);
    assert.deepEqual(frozen.bubbles, wrong.bubbles, "讲解期间泡泡不动");
    assert.equal(frozen.spawnIn, wrong.spawnIn, "讲解期间不走出泡计时");
    assert.equal(g.tick(wrong, Number.POSITIVE_INFINITY, random).teaching.remaining, config.teachMs, "非有限时间当 0");
    assert(g.pickChip(wrong, 0, random) === wrong, "讲解期间点牌原样返回");
    assert(g.tick(wrong, -50, random).teaching.remaining === config.teachMs, "负数时间当 0");

    const resumed = finishTeaching(g, wrong, random);
    assert.equal(resumed.status, "playing", "讲解走完回到游戏");
    assert(!("teaching" in resumed), "讲解字段必须去掉");
    assert.deepEqual(resumed.bubbles, wrong.bubbles, "讲解结束后泡泡从原地继续");

    // 再错一次：速度乘 missFactor 后会碰到下限
    const doubled = clickFake(g, resumed, random);
    assert.equal(doubled.hearts, config.hearts - 2);
    near(doubled.speed, config.speed.min, "速度不得低于下限");

    // 漏掉：泡泡漂到顶线
    const riseRandom = seeded(23);
    let escaped = g.startRound(words, words, riseRandom);
    let guard = 0;
    while (escaped.status === "playing" && guard++ < 2000) escaped = g.tick(escaped, config.maxTickMs, riseRandom);
    assert.equal(escaped.status, "teaching", "泡泡漂到顶线必须进入讲解");
    assert.equal(escaped.teaching.reason, "escaped");
    const escapedWord = escaped.teaching.wordId;
    assert.equal(escaped.hearts, config.hearts - 1);
    assert.equal(escaped.misses, 1);
    assert.equal(escaped.combo, 0);
    assert(escaped.missed.includes(escapedWord));
    assert(!escaped.bubbles.some(bubble => bubble.wordId === escapedWord), "漏掉的泡泡离开场上");
    assert(!escaped.chips.some(chip => chip && chip.wordId === escapedWord), "指向它的牌一并清掉");
    // 速度 1 → 0.8，高于下限
    near(escaped.speed, Math.max(config.speed.min, config.speed.start * config.speed.missFactor), "漏掉后减速");
    assertPlacement(g, escaped, "漏掉");

    // returnAfter 个别的泡泡之后才重新出场
    const returningWords = ["a", "b", "c", "d", "e", "f"]
        .map(id => makeWord(id, `word-${id}`, `reading-${id}`, `meaning-${id}`));
    const base = g.startRound(returningWords, returningWords, seeded(29));
    const waiting = {
        ...base,
        queue: ["b", "c", "d", "e", "f"],
        returning: [{wordId: "a", wait: config.returnAfter}],
        bubbles: [],
        chips: [null, null, null, null],
        spawnIn: 0,
    };
    const order = [];
    const seen = new Set();
    let ordered = waiting;
    for (let step = 0; step < 300 && order.length < 4; step++) {
        ordered = g.tick(ordered, config.maxTickMs, random);
        for (const bubble of ordered.bubbles) {
            if (!seen.has(bubble.key)) {
                seen.add(bubble.key);
                order.push(bubble.wordId);
            }
        }
    }
    assert.deepEqual(order.slice(0, 4), ["b", "c", "d", "a"], "重来的词要等 returnAfter 个别的泡泡");

    // 点假牌指向一个已爆掉的本关词：它回到重来表
    const fresh = lesson(10, "r");
    let clearedRound = g.startRound(fresh, fresh, random);
    clearedRound = g.tick(clearedRound, config.maxTickMs, random);
    const clearedWord = clearedRound.bubbles[0].wordId;
    clearedRound = popBest(g, clearedRound, random);
    assert.deepEqual(clearedRound.cleared, [clearedWord]);
    const relocated = g.pickChip(
        {...clearedRound, chips: [{key: 900, wordId: clearedWord}, null, null, null]},
        0,
        random,
    );
    assert.equal(relocated.status, "teaching");
    assert.equal(relocated.teaching.reason, "wrong");
    assert(!relocated.cleared.includes(clearedWord), "已爆的词不再算爆掉");
    assert(
        relocated.returning.some(item => item.wordId === clearedWord && item.wait === config.returnAfter),
        "点错已爆的词，它要重新来",
    );
    assertPlacement(g, relocated, "点错已爆词");
});

/* ── 通关 ─────────────────────────────────────────────────── */

test("游戏规则：全部干净爆过即通关，按失误数给星", ["game:clear"], ({load}) => {
    const g = engine(load);
    const config = g.gameConfig;
    const random = seeded(31);

    const perfectWords = lesson(20);
    const perfect = autoplay(g, g.startRound(perfectWords, perfectWords, random), random,
        state => assertPlacement(g, state, "满星"));
    assert.equal(perfect.status, "cleared");
    assert.equal(perfect.misses, 0);
    assert.deepEqual([...perfect.cleared].sort(), perfectWords.map(word => word.id).sort(), "每个词都爆过");
    assert.equal(perfect.queue.length, 0);
    assert.equal(perfect.returning.length, 0);
    assert.equal(perfect.chips.length, config.chipSlots);
    assert.deepEqual(g.roundResult(perfect), {
        cleared: true,
        score: perfect.score,
        stars: 3,
        maxCombo: perfect.maxCombo,
        misses: 0,
        total: 20,
        clearedCount: 20,
        missedWordIds: [],
    });

    // 失误一次 → 两星
    let oneMiss = g.startRound(perfectWords, perfectWords, random);
    oneMiss = g.tick(oneMiss, config.maxTickMs, random);
    oneMiss = clickFake(g, oneMiss, random);
    assert.equal(oneMiss.misses, 1);
    const twoStar = autoplay(g, oneMiss, random, state => assertPlacement(g, state, "两星"));
    assert.equal(twoStar.status, "cleared");
    assert.equal(twoStar.misses, 1);
    assert.equal(g.roundResult(twoStar).stars, 2);

    // 失误三次但靠连击回心活下来 → 一星
    let durable = g.startRound(lesson(40, "d"), lesson(40, "d"), random);
    durable = g.tick(durable, config.maxTickMs, random);
    for (let miss = 0; miss < 3; miss++) {
        durable = clickFake(g, durable, random);
        assert.equal(durable.hearts, 2, "每次失误扣一颗心");
        if (miss === 2) break;
        durable = popCorrect(g, durable, random, config.heartEvery);
        assert.equal(durable.hearts, config.hearts, "连击把心补回来");
    }
    assert.equal(durable.misses, 3);
    assert.equal(durable.status, "teaching");
    const surviving = autoplay(g, durable, random, state => assertPlacement(g, state, "一星"));
    assert.equal(surviving.status, "cleared", "失误三次也不能死");
    assert.equal(surviving.misses, 3);
    assert.equal(g.roundResult(surviving).stars, 1);
});

/* ── 失败 ─────────────────────────────────────────────────── */

test("游戏规则：心掉光即失败，之后状态不再变化", ["game:fail"], ({load}) => {
    const g = engine(load);
    const config = g.gameConfig;
    const random = seeded(37);
    const words = lesson(20, "f");

    let state = g.startRound(words, words, random);
    state = g.tick(state, config.maxTickMs, random);
    for (let miss = 0; miss < config.hearts; miss++) {
        state = clickFake(g, state, random);
        assert.equal(state.misses, miss + 1);
        assert.equal(state.hearts, config.hearts - miss - 1);
        if (miss < config.hearts - 1) assert.equal(state.status, "teaching");
    }
    assert.equal(state.status, "failed");
    assert.equal(state.hearts, 0);
    assert(!("teaching" in state), "失败不再讲解");

    assert(g.tick(state, config.maxTickMs, random) === state, "失败后 tick 原样返回");
    assert(g.pickChip(state, 0, random) === state, "失败后点牌原样返回");
    assert.equal(g.roundResult(state).stars, 0, "没通关没有星");
    assert.equal(g.roundResult(state).cleared, false);
    assert.equal(g.roundResult(state).clearedCount, state.cleared.length);
    assert.equal(g.roundResult(state).total, words.length);
});

/* ── 确定性 ───────────────────────────────────────────────── */

test("游戏规则：同一输入与随机序列得到同一局，入参不被修改", ["game:deterministic"], ({load}) => {
    const g = engine(load);
    const config = g.gameConfig;

    const words = lesson(24).map(word => Object.freeze(word));
    const pool = Object.freeze([...words]);
    const frozenWords = Object.freeze(words);
    const snapshot = structuredClone(words);

    const runOnce = () => {
        const random = seeded(4321);
        const states = [];
        let state = g.startRound(frozenWords, pool, random);
        states.push(state);
        for (let step = 0; step < 60; step++) {
            state = g.tick(state, config.maxTickMs, random);
            states.push(state);
            const slot = correctSlot(state);
            if (slot >= 0) {
                state = g.pickChip(state, slot, random);
                states.push(state);
            }
        }
        return states;
    };

    const left = runOnce();
    const right = runOnce();
    assert.equal(left.length, right.length);
    for (let step = 0; step < left.length; step++)
        assert.deepEqual(left[step], right[step], `第 ${step} 步的状态必须一致`);
    assert(left.length > 60);

    assert.deepEqual(words, snapshot, "入参词表不能被改写");
    assert.equal(words.length, 24);
    // 冻结的入参照样能跑完整局：说明没有偷偷写回。
    const final = autoplay(g, g.startRound(frozenWords, pool, seeded(99)), seeded(99));
    assert.equal(final.status, "cleared");

    assert.equal(g.comboMultiplier(0), 1);
    assert.equal(g.comboMultiplier(2), 1);
    assert.equal(g.comboMultiplier(3), 2);
    assert.equal(g.comboMultiplier(1000), config.maxMultiplier, "倍数有上限");
});
