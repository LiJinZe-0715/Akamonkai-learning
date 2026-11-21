import assert from "../assertions.mjs";
import {createRequire} from "node:module";
import {test} from "../harness.mjs";

/**
 * 单词游戏界面：关卡列表、路由入口、游戏画面与结算。
 *
 * 画面用例手工构造 RoundState，不依赖引擎函数的实现进度；
 * 只有连击断言在 comboMultiplier 还是空壳时按任务书约定跳过。
 */

const require = createRequire(import.meta.url);
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");

/** 建一套独立服务与渲染器（与 render.mjs 的 setup 相同）。 */
function setup({load, fixture}) {
    const ui = fixture.ui();
    const services = load("src/bootstrap/create-study-services.ts").createStudyServices(ui);
    const {StudyProvider} = load("src/presentation/StudyContext.tsx");
    const originalLoad = services.progress.load;
    const render = (component, props, locale = "zh", progress) => {
        services.localization.current = () => locale;
        services.progress.load = progress ? () => progress : originalLoad;
        return renderToStaticMarkup(React.createElement(StudyProvider, {services}, React.createElement(component, props)));
    };
    return {ui, services, render};
}

const escaped = href => href.replaceAll("&", "&amp;");
const countOf = (html, pattern) => (html.match(pattern) || []).length;

/* ── 关卡列表 ─────────────────────────────────────────────── */

test("单词游戏界面：关卡列表按关数渲染，记录显示星级与最高分", ["page:game:zh", "page:game:en"], context => {
    const {load, fixture} = context;
    const {ui, services, render} = setup(context);
    const {GameLobby, gameHref, gameLessonHref} = load("src/modules/word-game/presentation/index.ts");
    const {toGameWords, splitStages} = load("src/modules/word-game/public.ts");
    const catalog = fixture.catalog();
    const lessonId = "minna-no-nihongo-shokyu.1";
    const lesson = fixture.lesson(lessonId);
    assert(lesson && (lesson.modules.words?.items.length ?? 0) > 0, `夹具缺少单词课：${lessonId}`);
    const summary = catalog.lessons.find(item => item.id === lessonId);
    const book = catalog.books.find(item => item.id === summary.bookId);
    assert(summary && book, "目录里找不到这一课");

    const linksByLocale = {};
    for (const locale of ["zh", "en"]) {
        const gameWords = toGameWords(lesson.modules.words.items,
            id => services.localization.text(lesson.texts, id, locale));
        const stages = splitStages(gameWords);
        assert(stages.length >= 2, `这一课应能切出至少两关：${locale}`);
        const records = stages.map(() => undefined);
        records[1] = {best: 1200, stars: 2, at: "2026-11-10T00:00:00.000Z"};
        const html = render(GameLobby, {
            bookTitle: book.title, lessonTitle: summary.title, lessonId, stages, records,
        }, locale);
        assert(!html.includes("Unknown text ID"), `关卡列表缺文案：${locale}`);
        const cards = [...html.matchAll(/<a class="game-stage" href="([^"]+)">([\s\S]*?)<\/a>/g)];
        assert.equal(cards.length, stages.length, `关卡链接数不对：${locale}`);
        cards.forEach((card, index) =>
            assert.equal(card[1], escaped(gameHref(lessonId, index + 1)), `第 ${index + 1} 关链接不对：${locale}`));
        assert(html.includes(`href="${escaped(gameLessonHref(lessonId))}"`), `缺少返回单词的链接：${locale}`);
        assert(html.includes(ui["ui.gameBackToWords"][locale]), `返回文案不对：${locale}`);
        assert(html.includes(`<h1 lang="ja" translate="no">${summary.title}</h1>`), `课标题缺失：${locale}`);
        for (const rule of ["ui.gameRule1", "ui.gameRule2", "ui.gameRule3"])
            assert(html.includes(ui[rule][locale]), `玩法说明缺 ${rule}：${locale}`);
        stages.forEach((words, index) => {
            const card = cards[index][2];
            assert(card.includes(words[0].word) && card.includes(words[words.length - 1].word),
                `第 ${index + 1} 关缺首尾词：${locale}`);
            assert(card.includes(ui["ui.wordCount"][locale].replace("{count}", String(words.length))),
                `第 ${index + 1} 关词数不对：${locale}`);
            assert(card.includes(ui["ui.gameStage"][locale].replace("{n}", String(index + 1))),
                `第 ${index + 1} 关标题不对：${locale}`);
        });
        // 第 2 关有记录：2 颗实心星、1 颗空心星、最高分文案。
        const recorded = cards[1][2];
        assert.equal(countOf(recorded, /★/g), 2, `第 2 关实心星数不对：${locale}`);
        assert.equal(countOf(recorded, /☆/g), 1, `第 2 关空心星数不对：${locale}`);
        assert(recorded.includes(ui["ui.gameBest"][locale].replace("{score}", "1200")), `第 2 关最高分不对：${locale}`);
        assert(recorded.includes(ui["ui.gameStars"][locale].replace("{count}", "2")), `星级 aria-label 不对：${locale}`);
        cards.forEach((card, index) => {
            if (index === 1) return;
            assert(card[2].includes(ui["ui.gameNotPlayed"][locale]), `第 ${index + 1} 关应显示还没玩过：${locale}`);
            assert(!card[2].includes("★"), `没玩过的关不该有实心星：${locale}`);
            assert.equal(countOf(card[2], /☆/g), 3, `没玩过的关应是三颗空心星：${locale}`);
        });
        linksByLocale[locale] = cards.map(card => card[1]);
    }
    assert.deepEqual(linksByLocale.zh, linksByLocale.en, "两种语言的关卡链接必须一致");

    // 一课没有词：显示空态，不出关卡卡片。
    const empty = render(GameLobby, {
        bookTitle: book.title, lessonTitle: summary.title, lessonId, stages: [], records: [],
    }, "zh");
    assert(empty.includes(ui["ui.empty"].zh), "空词表应显示空态文案");
    assert(!empty.includes('class="game-stage"'), "空词表不该有关卡卡片");
});

/* ── 路由与入口 ───────────────────────────────────────────── */

test("单词游戏界面：游戏路由编码正确，课页单词页签有入口", ["game:route"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {gameHref, gameLessonHref} = load("src/modules/word-game/presentation/routes.ts");
    const {currentPage} = load("src/presentation/shell/data/navigation.ts");
    const {LessonScreen} = load("src/modules/curriculum/presentation/index.ts");

    assert.equal(gameHref("minna-no-nihongo-shokyu.1"), "./?game=minna-no-nihongo-shokyu.1");
    assert.equal(gameHref("minna-no-nihongo-shokyu.1", 3), "./?game=minna-no-nihongo-shokyu.1&stage=3");
    assert.equal(gameLessonHref("minna-no-nihongo-shokyu.1"), "./?unit=minna-no-nihongo-shokyu.1&view=words");
    const tricky = "a b&c=d/漢字";
    assert.equal(gameHref(tricky), "./?game=" + encodeURIComponent(tricky), "特殊字符必须编码");
    assert.equal(gameHref(tricky, 2), "./?game=" + encodeURIComponent(tricky) + "&stage=2");
    assert.equal(gameLessonHref(tricky), "./?unit=" + encodeURIComponent(tricky) + "&view=words");
    assert.equal(currentPage("?game=x"), "words", "游戏页应高亮单词标签");
    assert.equal(currentPage("?game=x&stage=2"), "words");

    const catalog = fixture.catalog();
    const summary = catalog.lessons.find(item => item.views.includes("words") && item.wordCount > 0);
    assert(summary, "目录里要有含单词的课");
    const book = catalog.books.find(item => item.id === summary.bookId);
    const entryHref = escaped(gameHref(summary.id));
    const words = render(LessonScreen, {book, lesson: summary, view: "words", catalog}, "zh");
    assert(words.includes('class="game-entry"'), "单词页签缺少游戏入口");
    assert(words.includes(`href="${entryHref}"`), "游戏入口链接不对");
    const otherView = summary.views.find(view => view !== "words");
    assert(otherView, "这一课应有其他页签可对照");
    const other = render(LessonScreen, {book, lesson: summary, view: otherView, catalog}, "zh");
    assert(!other.includes('class="game-entry"'), `其他页签不该有游戏入口：${otherView}`);
    assert(!other.includes(`href="${entryHref}"`), `其他页签不该链到游戏：${otherView}`);
});

/* ── 游戏画面与结算（手工构造状态，不调引擎） ─────────────── */

const boardWords = [
    {id: "w1", word: "わたし", reading: "わたし", meaningId: "m1", answerKey: "我"},
    {id: "w2", word: "先生", reading: "せんせい", meaningId: "m2", answerKey: "老师"},
    {id: "w3", word: "学生", reading: "がくせい", meaningId: "m3", answerKey: "学生"},
    {id: "w4", word: "学校", reading: "がっこう", meaningId: "m4", answerKey: "学校"},
];
const boardTexts = {
    m1: {zh: "我", en: "I"},
    m2: {zh: "老师", en: "teacher"},
    m3: {zh: "学生", en: "student"},
    m4: {zh: "学校", en: "school"},
};
const boardLookup = new Map(boardWords.map(word => [word.id, word]));
const playingState = {
    status: "playing",
    words: boardWords.slice(0, 3),
    pool: boardWords,
    bubbles: [
        {key: 1, wordId: "w1", lane: 0, height: 0.25},
        {key: 2, wordId: "w2", lane: 2, height: 0.6},
    ],
    chips: [{key: 3, wordId: "w1"}, null, {key: 4, wordId: "w2"}, {key: 5, wordId: "w4"}],
    hearts: 2,
    combo: 0,
    maxCombo: 4,
    score: 300,
    speed: 1,
    misses: 1,
    cleared: ["w3"],
    missed: ["w2"],
    queue: [],
    returning: [],
    spawnIn: 900,
    nextKey: 6,
};
const boardProps = state => ({
    state, words: boardLookup, texts: boardTexts, paused: false, onPick() {}, onTogglePause() {},
});
const chipButtons = html => [...html.matchAll(/<button type="button" class="game-chip"([^>]*)>/g)];

test("单词游戏界面：画面按状态渲染泡泡、释义牌、讲解与暂停", ["game:board"], context => {
    const {load} = context;
    const {ui, render} = setup(context);
    const {GameBoard, GameSession} = load("src/modules/word-game/presentation/index.ts");
    const {gameConfig, comboMultiplier} = load("src/modules/word-game/public.ts");

    const html = render(GameBoard, boardProps(playingState), "zh");
    assert(!html.includes("Unknown text ID"), "画面缺文案");
    assert.equal(countOf(html, /class="game-bubble[ "]/g), playingState.bubbles.length, "泡泡数与状态不一致");
    for (const bubble of playingState.bubbles)
        assert(html.includes(boardLookup.get(bubble.wordId).word), `泡泡缺词：${bubble.wordId}`);
    // 泡泡里的词必须完整显示：不允许省略号相关的类名或内联样式。
    assert(!html.includes("text-overflow") && !html.includes("ellipsis"), "画面里不许出现省略号相关样式或类名");
    const chips = chipButtons(html);
    assert.equal(chips.length, gameConfig.chipSlots, "释义牌必须恒为 chipSlots 个");
    assert.equal(chips.filter(chip => chip[1].includes("disabled")).length, 1, "playing 时只有 null 格禁用");
    assert.equal(countOf(html, /♥/g), playingState.hearts, "实心心数不对");
    assert.equal(countOf(html, /♡/g), gameConfig.hearts - playingState.hearts, "空心心数不对");
    assert(html.includes(ui["ui.gameHearts"].zh.replace("{count}", String(playingState.hearts))), "心的 aria-label 不对");
    assert(html.includes(`${playingState.cleared.length} / ${playingState.words.length}`), "进度不对");
    assert(html.includes(ui["ui.gameScore"].zh.replace("{score}", String(playingState.score))), "分数不对");
    assert(html.includes(ui["ui.gamePause"].zh), "暂停按钮不对");

    // 连击倍数是引擎函数：还是空壳时按任务书约定只跳过连击断言。
    let comboReady = true;
    try {
        comboMultiplier(0);
    } catch (error) {
        if (/Not implemented/.test(String(error?.message))) {
            comboReady = false;
            console.warn("单词游戏界面：引擎 comboMultiplier 仍是空壳，跳过连击相关断言（其余断言照常）");
        } else throw error;
    }
    if (comboReady) {
        assert(!html.includes('class="game-combo"'), "连击不足以加倍时不该渲染连击元素");
        const boosted = Array.from({length: 40}, (_, index) => index + 1)
            .find(combo => comboMultiplier(combo) > 1);
        assert(boosted !== undefined, "应存在能加倍的连击数");
        const comboHtml = render(GameBoard, boardProps({...playingState, combo: boosted}), "zh");
        assert(comboHtml.includes('class="game-combo"'), "连击加倍时应渲染连击元素");
        assert(comboHtml.includes("×" + comboMultiplier(boosted)), "连击倍数不对");
    }

    // 讲解卡：原因、词、读音、词义；牌全部禁用。
    for (const [reason, key] of [["wrong", "ui.gameWrong"], ["escaped", "ui.gameEscaped"]]) {
        const teaching = render(GameBoard, boardProps({
            ...playingState, status: "teaching", teaching: {wordId: "w2", reason, remaining: 1200},
        }), "zh");
        assert(teaching.includes('class="game-teaching" role="status"'), `讲解卡缺失：${reason}`);
        assert(teaching.includes(ui[key].zh), `讲解原因不对：${reason}`);
        assert(teaching.includes("先生") && teaching.includes("せんせい") && teaching.includes("老师"), "讲解卡缺词、读音或词义");
        assert(chipButtons(teaching).every(chip => chip[1].includes("disabled")), "讲解时牌必须全部禁用");
    }

    // 暂停遮罩：提示 + 继续按钮，牌全部禁用。
    const paused = render(GameBoard, {...boardProps(playingState), paused: true}, "zh");
    assert(paused.includes('class="game-paused"'), "缺少暂停遮罩");
    assert(paused.includes(ui["ui.gamePaused"].zh), "暂停文案不对");
    assert(paused.includes(ui["ui.gameResume"].zh), "暂停遮罩要有继续按钮");
    assert(chipButtons(paused).every(chip => chip[1].includes("disabled")), "暂停时牌必须全部禁用");

    // 英文界面同样可渲染。
    const en = render(GameBoard, boardProps(playingState), "en");
    assert(!en.includes("Unknown text ID"), "英文画面缺文案");
    assert(en.includes("teacher"), "英文画面词义没切换");

    // 进行中的整页：根元素锁高（is-playing），顶栏一行紧凑，不再用大标题。
    const session = render(GameSession, {
        lessonId: "minna-no-nihongo-shokyu.1", lessonTitle: "第1課", stage: 1, stageCount: 2,
        words: boardWords.slice(0, 3), pool: boardWords, texts: boardTexts,
    }, "zh");
    assert(session.includes('class="game-session is-playing"'), "进行中的根元素应带 is-playing 类");
    assert(session.includes('class="game-topbar"'), "缺少紧凑顶栏 game-topbar");
    assert(!session.includes("lesson-heading"), "进行中不该再用大标题 lesson-heading");
    assert(!session.includes("Unknown text ID"), "整页缺文案");
});

test("单词游戏界面：结算按结果显示星级、新纪录、复习词与出口", ["game:board"], context => {
    const {load} = context;
    const {ui, render} = setup(context);
    const {GameResult, gameHref} = load("src/modules/word-game/presentation/index.ts");
    const lessonId = "minna-no-nihongo-shokyu.1";
    const cleared = {
        cleared: true, score: 2400, stars: 3, maxCombo: 9, misses: 0,
        total: 3, clearedCount: 3, missedWordIds: [],
    };
    const resultProps = (result, extra = {}) => ({
        result, words: boardLookup, texts: boardTexts, previousBest: 1200,
        lessonId, stage: 1, stageCount: 3, onRetry() {}, ...extra,
    });

    const win = render(GameResult, resultProps(cleared), "zh");
    assert(!win.includes("Unknown text ID"), "结算缺文案");
    assert(win.includes(ui["ui.gameCleared"].zh), "通关标题不对");
    assert.equal(countOf(win, /★/g), 3, "通关三星应全实心");
    assert(win.includes(ui["ui.gameScore"].zh.replace("{score}", "2400")), "分数不对");
    assert(win.includes(ui["ui.gameBest"].zh.replace("{score}", "2400")), "最高分应取两者较大值");
    assert(win.includes(ui["ui.gameNewBest"].zh), "分数高于 previousBest 应有新纪录");
    assert(win.includes(ui["ui.gameMaxCombo"].zh.replace("{count}", "9")), "最大连击不对");
    assert(win.includes(ui["ui.gameMisses"].zh.replace("{count}", "0")), "失误数不对");
    assert(win.includes("3 / 3"), "爆掉数 / 总数不对");
    assert(win.includes(ui["ui.gameRetry"].zh), "缺少再来一局按钮");
    assert(win.includes(`href="${escaped(gameHref(lessonId, 2))}"`), "通关且不是最后一关应有下一关链接");
    assert(win.includes(`href="${escaped(gameHref(lessonId))}"`), "缺少全部关卡链接");

    // 最后一关：没有下一关。
    const last = render(GameResult, resultProps(cleared, {stage: 3}), "zh");
    assert(!last.includes(`href="${escaped(gameHref(lessonId, 4))}"`), "最后一关不该有下一关");
    assert(last.includes(`href="${escaped(gameHref(lessonId))}"`), "最后一关仍要有全部关卡链接");

    // 不高于最高分：没有新纪录徽标，最高分保持旧值。
    const tied = render(GameResult, resultProps(cleared, {previousBest: 2400}), "zh");
    assert(!tied.includes(ui["ui.gameNewBest"].zh), "平纪录不该显示新纪录");
    const lower = render(GameResult, resultProps(cleared, {previousBest: 3000}), "zh");
    assert(!lower.includes(ui["ui.gameNewBest"].zh), "低于纪录不该显示新纪录");
    assert(lower.includes(ui["ui.gameBest"].zh.replace("{score}", "3000")), "最高分应保持旧纪录");
    // 之前没有记录且分数 > 0：算新纪录；分数为 0 则不算。
    const first = render(GameResult, resultProps(cleared, {previousBest: undefined}), "zh");
    assert(first.includes(ui["ui.gameNewBest"].zh), "首次游玩得分应算新纪录");
    const zero = render(GameResult, resultProps({...cleared, score: 0}, {previousBest: undefined}), "zh");
    assert(!zero.includes(ui["ui.gameNewBest"].zh), "首次游玩零分不该算新纪录");

    // 失败：标题换掉，没有下一关；失误过的词逐个列出，查不到的 id 跳过。
    const failed = {
        cleared: false, score: 600, stars: 0, maxCombo: 3, misses: 3,
        total: 3, clearedCount: 1, missedWordIds: ["w2", "w3", "ghost"],
    };
    const lose = render(GameResult, resultProps(failed), "zh");
    assert(lose.includes(ui["ui.gameFailed"].zh), "失败标题不对");
    assert(!lose.includes(ui["ui.gameCleared"].zh), "失败不该显示通关");
    assert(!lose.includes(`href="${escaped(gameHref(lessonId, 2))}"`), "失败不该有下一关");
    assert.equal(countOf(lose, /★/g), 0, "失败零星不该有实心星");
    assert(lose.includes(ui["ui.gameMissedWords"].zh), "缺少复习词标题");
    assert(lose.includes("先生") && lose.includes("せんせい") && lose.includes("老师"), "复习词缺第一个词");
    assert(lose.includes("学生") && lose.includes("がくせい"), "复习词缺第二个词");
    assert.equal(countOf(lose, /class="game-missed-word"/g), 2, "查不到的词 id 应跳过");
    assert.equal(countOf(lose, /class="icon-button"/g), 2, "每个复习词都要有朗读按钮");

    // 英文结算同样可渲染。
    const en = render(GameResult, resultProps(cleared), "en");
    assert(!en.includes("Unknown text ID"), "英文结算缺文案");
    assert(en.includes(ui["ui.gameCleared"].en), "英文通关标题不对");
});