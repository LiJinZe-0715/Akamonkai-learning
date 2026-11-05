import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {test} from "../harness.mjs";

/**
 * 页面与路由渲染（新模型）。
 *
 * 每个用例自己建服务、自己渲染，不复用任何跨用例对象。
 * 页签用例按「页签 × 语言」切分，页签本身由课里的模块推导。
 */

const require = createRequire(import.meta.url);
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");

const links = html => [...html.matchAll(/href="(\?unit=[^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"));
const bookLinks = html => [...html.matchAll(/class="textbook textbook-cover" href="([^"]+)"/g)].map(match => match[1]);
const countOf = (html, className) => (html.match(new RegExp(`class="${className}"`, "g")) || []).length;

/** 建一套独立服务与渲染器。 */
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

const summariesOf = catalog => new Map(catalog.lessons.map(lesson => [lesson.id, lesson]));

/* ── 页面 ─────────────────────────────────────────────────── */

test("教材库按等级分组，每本书只出现在一个等级下", ["page:catalog:zh", "page:catalog:en", "level:beginner", "level:mid-intermediate", "level:intermediate", "level:jlpt-grammar"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {CatalogScreen} = load("src/modules/curriculum/presentation/index.ts");
    const {libraryLevels} = load("src/modules/curriculum/domain/catalog.ts");
    const catalog = fixture.catalog();
    const zh = render(CatalogScreen, {catalog}, "zh");
    const en = render(CatalogScreen, {catalog}, "en");

    for (const [locale, html] of [["zh", zh], ["en", en]]) {
        const groups = [...html.matchAll(/<section class="library-level" aria-labelledby="level-([^"]+)">([\s\S]*?)<\/section>/g)];
        assert.deepEqual(groups.map(match => match[1]), libraryLevels, `等级分组顺序不对：${locale}`);
        for (const book of catalog.books) {
            const position = libraryLevels.indexOf(book.level);
            assert(position >= 0, `教材没有等级：${book.id}`);
            const href = book.lessonIds.length === 1 ? `?unit=${book.lessonIds[0]}` : `./?book=${book.id}`;
            assert(groups[position][2].includes(`href="${href}"`), `教材归错了等级：${book.id}`);
            libraryLevels.forEach((_, other) =>
                other !== position && assert(!groups[other][2].includes(`href="${href}"`), `教材跨等级重复：${book.id}`));
        }
    }
    assert.deepEqual(links(zh), links(en), "两种语言的课链接必须一致");
    assert.deepEqual(bookLinks(zh), bookLinks(en));
    assert.deepEqual([...bookLinks(zh)].sort(),
        catalog.books.map(book => book.lessonIds.length === 1 ? `?unit=${book.lessonIds[0]}` : `./?book=${book.id}`).sort());
    assert(!zh.includes("<details") && !zh.includes('class="unit-list"'), "教材条目应当跳转而不是展开");
    assert(zh.includes('<h3 id="level-mid-intermediate">中级（N2）</h3>'), "中级分组标题必须标出 N2");
    assert(en.includes('<h3 id="level-mid-intermediate">Intermediate (N2)</h3>'), "英文标题同样标出 N2");
});

test("教材页直接列出全部课，不折叠不隐藏", ["page:book:zh", "page:book:en"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {BookScreen} = load("src/modules/curriculum/presentation/pages/BookScreen.tsx");
    const catalog = fixture.catalog();
    const expected = catalog.books.flatMap(book => book.lessonIds.map(id => `?unit=${id}`));

    for (const locale of ["zh", "en"]) {
        const routes = catalog.books.flatMap(book => {
            const html = render(BookScreen, {book, catalog}, locale);
            assert(html.includes(`<h1 lang="ja" translate="no">${book.title}</h1>`), `教材标题缺失：${book.id}`);
            assert(html.includes('href="./?page=library"'), `教材页必须能回到教材库：${book.id}`);
            assert(!html.includes("<details") && !html.includes('hidden=""'), `课必须直接可见：${book.id}`);
            return links(html);
        });
        assert.deepEqual(routes.sort(), [...expected].sort(), `课不可达：${locale}`);
        assert(expected.length >= 200, "课数量骤减，可能误删");
    }
});

test("课次页保留上下文返回，页签覆盖该课全部模块", ["page:lesson:zh", "page:lesson:en"], context => {
    const {load, fixture} = context;
    const {ui, render} = setup(context);
    const {LessonScreen} = load("src/modules/curriculum/presentation/index.ts");
    const {bookHref, lessonHref} = load("src/modules/curriculum/presentation/routes.ts");
    const {defaultView} = load("src/modules/curriculum/domain/catalog.ts");
    const catalog = fixture.catalog();
    const byId = summariesOf(catalog);

    // 每本教材抽查前后各一课：页签组合在整本里是稳定的，全量渲染代价过高。
    for (const locale of ["zh", "en"])
        for (const book of catalog.books)
            for (const id of [book.lessonIds[0], book.lessonIds.at(-1)]) {
                const summary = byId.get(id);
                for (const view of summary.views) {
                    const html = render(LessonScreen, {book, lesson: summary, view, catalog}, locale);
                    assert(html.includes(`href="${bookHref(book.id, id).replaceAll("&", "&amp;")}"`),
                        `[${locale}] 缺少回到教材的链接：${id}`);
                    assert(html.includes('href="./?page=library"'), `[${locale}] 缺少直接回教材库的链接：${id}`);
                    const picker = html.match(/<select[^>]*>([\s\S]*?)<\/select>/)?.[1];
                    assert(picker, `[${locale}] 缺少课选择器：${id}`);
                    for (const target of book.lessonIds) {
                        const targetSummary = byId.get(target);
                        const targetView = targetSummary.views.includes(view) ? view : defaultView(targetSummary.views);
                        assert(picker.includes(`value="${lessonHref(target, targetView).replaceAll("&", "&amp;")}"`),
                            `[${locale}] 选择器目的地错误：${target}`);
                    }
                    const tabs = html.match(/<nav class="lesson-modes"[^>]*>([\s\S]*?)<\/nav>/)[1];
                    assert.equal(links(tabs).length, summary.views.length, `[${locale}] 页签数不对：${id}`);
                    if (view === "quiz") {
                        // 目录里的 questionCount 只算固定题；单词题要等课加载完才生成，
                        // 所以加载前不能先显示一个和测验页对不上的题数。
                        const subline = html.match(/<div class="lesson-subline">([\s\S]*?)<\/div>/)[1].replace(/<[^>]+>/g, "");
                        assert(!/\d/.test(subline), `[${locale}] 课还没加载时，测验页签不能先显示固定题数：${id}`);
                    }
                    assert(ui, "文案必须可用");
                }
            }
});

/* ── 页签 ─────────────────────────────────────────────────── */

const viewModules = {
    kanji: ["src/modules/curriculum/presentation/pages/KanjiScreen.tsx", "KanjiScreen"],
    words: ["src/modules/vocabulary/presentation/index.ts", "VocabularyScreen"],
    articles: ["src/modules/reading/presentation/index.ts", "ReadingScreen"],
    dialogues: ["src/modules/reading/presentation/index.ts", "DialogueScreen"],
    grammar: ["src/modules/grammar/presentation/index.ts", "GrammarScreen"],
    quiz: ["src/modules/assessment/presentation/index.ts", "AssessmentScreen"],
};

function propsFor(services, lesson, view) {
    const modules = lesson.modules;
    switch (view) {
        case "kanji": return {items: modules.kanji?.items ?? [], texts: lesson.texts, lessonId: lesson.id};
        case "words": return {words: modules.words?.items ?? [], texts: lesson.texts};
        case "articles": return {articles: modules.articles?.items ?? [], texts: lesson.texts, lessonId: lesson.id};
        case "dialogues": return {dialogues: modules.dialogues?.items ?? [], texts: lesson.texts, lessonId: lesson.id};
        case "grammar": return {grammars: modules.grammar?.items ?? [], texts: lesson.texts, lessonId: lesson.id};
        default: return {
            source: services.studySession.source(lesson), texts: lesson.texts,
            lessonId: lesson.id, view: "quiz",
        };
    }
}

for (const view of ["kanji", "words", "articles", "dialogues", "grammar", "quiz"]) {
    test(`页签 ${view} 在两种语言下可渲染`, [`view:${view}:zh`, `view:${view}:en`], context => {
        const {load, fixture} = context;
        const {services, render} = setup(context);
        const [file, name] = viewModules[view];
        const Component = load(file)[name];
        assert(Component, `找不到页签组件：${name}`);
        const catalog = fixture.catalog();
        const lessons = fixture.units();
        const byId = new Map(lessons.map(lesson => [lesson.id, lesson]));
        const candidates = catalog.lessons.filter(summary => summary.views.includes(view)).slice(0, 12);
        assert(candidates.length > 0, `没有任何课开放 ${view} 页签，场景清单与内容已脱节`);
        for (const summary of candidates) {
            const lesson = byId.get(summary.id);
            for (const locale of ["zh", "en"]) {
                const html = render(Component, propsFor(services, lesson, view), locale);
                assert(!html.includes("Unknown text ID"), `缺少文案：${lesson.id} / ${view} / ${locale}`);
                assert(html.length > 0, `空白页面：${lesson.id} / ${view}`);
            }
        }
    });
}

/* ── 课的模块组合 ─────────────────────────────────────────── */

const shapeOf = summary => summary.views.includes("kanji")
    ? summary.views.includes("words") ? "absorbed-kanji" : "kanji-group"
    : "plain";

test("普通课渲染词表、文法与测试，词条数量与数据一致", ["unit:plain"], context => {
    const {load, fixture} = context;
    const {services, render} = setup(context);
    const {VocabularyScreen} = load("src/modules/vocabulary/presentation/index.ts");
    const {GrammarScreen} = load("src/modules/grammar/presentation/index.ts");
    const {AssessmentScreen} = load("src/modules/assessment/presentation/index.ts");
    const catalog = fixture.catalog();
    const lessons = new Map(fixture.units().map(lesson => [lesson.id, lesson]));
    const plain = catalog.lessons.filter(summary => shapeOf(summary) === "plain" && summary.views.includes("words")).slice(0, 12);
    assert(plain.length > 0, "没有普通课");
    for (const summary of plain) {
        const lesson = lessons.get(summary.id);
        const words = lesson.modules.words.items;
        for (const locale of ["zh", "en"]) {
            const html = render(VocabularyScreen, {words, texts: lesson.texts}, locale);
            assert.equal(countOf(html, "word-headword"), words.length, `词条数量不符：${lesson.id}`);
            assert.equal(countOf(html, "word-note"), words.filter(word => word.noteId && lesson.texts[word.noteId][locale].trim()).length,
                `空注释不应显示用法：${lesson.id}`);
            assert(!html.includes("<details"), `单词用法直接展开，不折叠：${lesson.id}`);
            // 恢复旧套件里的文法页与测验页渲染，不再只查词表。
            if (lesson.modules.grammar) {
                const grammarHtml = render(GrammarScreen, {
                    grammars: lesson.modules.grammar.items, texts: lesson.texts, lessonId: lesson.id,
                }, locale);
                assert(grammarHtml.includes('class="grammar-article"'), `文法页缺条目：${lesson.id}`);
                assert(!grammarHtml.includes("Unknown text ID"), `文法页缺译文：${lesson.id}`);
            }
            if (summary.views.includes("quiz")) {
                const quizHtml = render(AssessmentScreen, {
                    source: services.studySession.source(lesson).slice(0, 24),
                    texts: lesson.texts, lessonId: lesson.id, view: "quiz",
                }, locale);
                assert(quizHtml.includes('class="question"') || quizHtml.includes('class="empty-state"'),
                    `测验页没有题目：${lesson.id}`);
                assert(!quizHtml.includes("Unknown text ID"), `测验页缺译文：${lesson.id}`);
            }
        }
    }
});

test("纯汉字课只有汉字与测验两个页签", ["unit:kanji-group"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {LessonScreen} = load("src/modules/curriculum/presentation/index.ts");
    const catalog = fixture.catalog();
    const byId = summariesOf(catalog);
    const groups = catalog.lessons.filter(summary => shapeOf(summary) === "kanji-group").slice(0, 6);
    assert(groups.length > 0, "没有纯汉字课");
    for (const summary of groups) {
        const book = catalog.books.find(item => item.id === summary.bookId);
        const html = render(LessonScreen, {book, lesson: summary, view: "kanji", catalog}, "zh");
        const tabs = html.match(/<nav class="lesson-modes"[^>]*>([\s\S]*?)<\/nav>/)[1];
        assert.equal(links(tabs).length, 2, `纯汉字课必须恰好两个页签：${summary.id}`);
        assert(tabs.includes("漢字") && tabs.includes("テスト"));
        assert(!tabs.includes("view=words"), "汉字与词汇不能混在一个模块里");
        assert(byId.has(summary.id));
    }
});

test("汉字与词表并存的课保留两种模块", ["unit:absorbed-kanji"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {LessonScreen} = load("src/modules/curriculum/presentation/index.ts");
    const catalog = fixture.catalog();
    const absorbed = catalog.lessons.filter(summary => shapeOf(summary) === "absorbed-kanji").slice(0, 4);
    assert(absorbed.length > 0, "没有汉字与词表并存的课");
    for (const summary of absorbed) {
        const book = catalog.books.find(item => item.id === summary.bookId);
        const html = render(LessonScreen, {book, lesson: summary, view: summary.views[0], catalog}, "zh");
        const tabs = html.match(/<nav class="lesson-modes"[^>]*>([\s\S]*?)<\/nav>/)[1];
        assert.equal(links(tabs).length, summary.views.length, `模块页签数不对：${summary.id}`);
        assert(tabs.includes("漢字") && tabs.includes("単語"), `原有模块标签必须保留：${summary.id}`);
    }
});

/* ── 路由 ─────────────────────────────────────────────────── */

test("合法路由参数定位到对应课与页签", ["route:valid"], context => {
    const {load, fixture} = context;
    const {lessonHref} = load("src/modules/curriculum/presentation/routes.ts");
    const {CurriculumService} = load("src/modules/curriculum/application/curriculum-service.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const catalog = fixture.catalog();
    const curriculum = new CurriculumService(new HttpCurriculumRepository(async () => catalog));
    let checked = 0;
    for (const summary of catalog.lessons) for (const view of summary.views) {
        const destination = curriculum.select(catalog, summary.id, view);
        assert.equal(destination.lesson.id, summary.id, `合法路由解析失败：${summary.id}/${view}`);
        assert.equal(destination.view, view);
        assert.equal(destination.book.id, summary.bookId);
        assert(lessonHref(summary.id, view).includes(`unit=${summary.id}`));
        checked++;
    }
    assert(checked >= catalog.lessons.length);
});

test("缺少路由参数回落到默认页签与全部教材", ["route:missing"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {CatalogScreen} = load("src/modules/curriculum/presentation/index.ts");
    const {CurriculumService} = load("src/modules/curriculum/application/curriculum-service.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const {defaultView} = load("src/modules/curriculum/domain/catalog.ts");
    const catalog = fixture.catalog();
    const curriculum = new CurriculumService(new HttpCurriculumRepository(async () => catalog));
    assert.equal(curriculum.select(catalog, null, null), null, "没有课 id 时不应解析出目的地");
    assert.equal(bookLinks(render(CatalogScreen, {catalog}, "zh")).length, catalog.books.length, "缺参时必须显示全部教材");
    for (const summary of catalog.lessons)
        assert.equal(curriculum.select(catalog, summary.id, null).view, defaultView(summary.views), `默认页签不对：${summary.id}`);
});

test("非法路由参数不抛错，回落到全部教材", ["route:invalid"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {CatalogScreen} = load("src/modules/curriculum/presentation/index.ts");
    const {CurriculumService} = load("src/modules/curriculum/application/curriculum-service.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const {filterCatalog} = load("src/modules/curriculum/domain/catalog-queries.ts");
    const catalog = fixture.catalog();
    const curriculum = new CurriculumService(new HttpCurriculumRepository(async () => catalog));

    context.globals({window: {location: {search: "?book=missing&focus=missing"}}});
    assert.equal(bookLinks(render(CatalogScreen, {catalog}, "zh")).length, catalog.books.length, "非法筛选必须回落");
    assert.throws(() => curriculum.select(catalog, "missing", "words"), /Unavailable/, "不存在的课必须明确拒绝");
    assert.throws(() => curriculum.select(catalog, catalog.lessons[0].id, "word-test"), /Unavailable/, "旧页签名必须拒绝");
    assert.deepEqual(filterCatalog(catalog, "missing", ""), [], "不存在的等级不应匹配任何教材");
    assert.deepEqual(filterCatalog(catalog, "all", "  "), catalog.books, "空白查询不应过滤");
    assert.deepEqual(filterCatalog(catalog, "all", "no-matching-lesson-title"), []);
});

test("旧版单字路由不再重定向，明确拒绝", ["route:legacy"], context => {
    const {load, fixture} = context;
    const {CurriculumService} = load("src/modules/curriculum/application/curriculum-service.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const catalog = fixture.catalog();
    const curriculum = new CurriculumService(new HttpCurriculumRepository(async () => catalog));
    for (const legacy of ["kanji-intermediate-1", "kanji-new-301", "minna-1", "skn2-l01", "kanji-daily-group-1"])
        assert.throws(() => curriculum.select(catalog, legacy, "kanji"), /Unavailable/, `旧链接必须拒绝：${legacy}`);
    // 新 id 是路径式的，点号后是课号；不再有单字路由。
    assert(catalog.lessons.every(summary => summary.id.includes(".")), "课 id 必须分层");
});

test("从学习页返回时定位并标记上次的课", ["route:focus"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {BookScreen} = load("src/modules/curriculum/presentation/pages/BookScreen.tsx");
    const catalog = fixture.catalog();
    const book = catalog.books.find(item => item.id === "minna-no-nihongo-shokyu");
    const focus = book.lessonIds[41];

    context.globals({window: {location: {search: `?book=${book.id}&focus=${focus}`}}});
    const returned = render(BookScreen, {book, catalog}, "zh");
    const entry = returned.match(new RegExp(`<a[^>]*id="unit-${focus.replaceAll(".", "\\.")}"[^>]*>`))?.[0];
    assert(entry && !entry.includes("hidden"), "返回目标必须可见");
    assert(entry.includes('aria-current="location"'), "返回目标必须被标记");

    for (const kanjiBook of catalog.books.filter(item => item.id.includes("kanji"))) {
        const last = kanjiBook.lessonIds.at(-1);
        context.globals({window: {location: {search: `?book=${kanjiBook.id}&focus=${last}`}}});
        const grid = render(BookScreen, {book: kanjiBook, catalog}, "zh");
        assert(grid.includes('class="book-contents"') && !grid.includes("<details"));
        assert.equal(countOf(grid, "unit-entry unit-link kanji-group-entry"), kanjiBook.lessonIds.length,
            "汉字教材必须列出每一课");
        assert(!grid.includes('hidden=""') && !grid.includes('class="show-more"'), "汉字分组不得被隐藏");
        assert(grid.includes('aria-current="location"'), "返回分组时也要标记");
    }
});

test("跨教材定位不会串到别的教材的课", ["route:cross-book"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {BookScreen} = load("src/modules/curriculum/presentation/pages/BookScreen.tsx");
    const catalog = fixture.catalog();
    const minna = catalog.books.find(item => item.id === "minna-no-nihongo-shokyu");
    const outsider = catalog.books.find(item => item.id !== minna.id).lessonIds[0];

    context.globals({window: {location: {search: `?book=${minna.id}&focus=${outsider}`}}});
    const html = render(BookScreen, {book: minna, catalog}, "zh");
    assert(!html.includes(`id="unit-${outsider}"`), "别的教材的课不应出现在本教材页");
    assert(!html.includes('aria-current="location"'), "跨教材的定位参数必须被忽略");
    for (const id of minna.lessonIds) assert(html.includes(`id="unit-${id}"`), "本教材的课必须完整显示");
});

/* ── 语音设置与教程（与内容模型无关，保留原有断言） ─────────── */

test("朗读设置显示引擎检测面板", ["speech:loading"], context => {
    const {load} = context;
    const {render} = setup(context);
    const {SpeechControls} = load("src/presentation/components/SpeechControls.tsx");
    const zh = render(SpeechControls, {}, "zh");
    const en = render(SpeechControls, {}, "en");

    for (const html of [zh, en]) {
        assert(html.includes('class="speech-diagnostics"'), "必须渲染引擎检测面板");
        assert(html.includes("Web Speech API"), "支持时必须说明实际引擎");
    }
    assert(zh.includes("朗读引擎") && zh.includes("系统声音"), "检测面板缺少中文标签");
    assert(en.includes("Speech engine") && en.includes("System voices"), "检测面板缺少英文标签");
    assert(!zh.includes("VOICEVOX ENGINE SERVER"), "只扫系统声音，不再有引擎服务器选项");
    assert(zh.includes("正在等待设备日语声音加载"), "声音未到位时必须提示加载中");
    assert(en.includes("Waiting for Japanese device voices"));
    assert(!zh.includes('class="speech-voice-tag"'), "没有声音时不得显示本地/在线标记");
});

test("引擎检测面板列出日语声音并标注本地/在线", ["speech:ready"], context => {
    const {load} = context;
    const {services, render} = setup(context);
    const {SpeechControls} = load("src/presentation/components/SpeechControls.tsx");
    const voices = [
        {voiceURI: "local-ja", name: "Microsoft Nanami", lang: "ja-JP", localService: true},
        {voiceURI: "cloud-ja", name: "Cloud Japanese", lang: "ja", localService: false},
        {voiceURI: "zh-tts", name: "Chinese TTS", lang: "zh-CN", localService: true},
    ];
    context.globals({
        window: {
            SpeechSynthesisUtterance: class {
                constructor(text) {
                    this.text = text;
                }
            },
            localStorage: {getItem: () => null, setItem() {
            }},
            speechSynthesis: {
                getVoices: () => voices,
                speak() {
                },
                cancel() {
                },
                addEventListener() {
                },
                removeEventListener() {
                },
            },
        },
    });
    context.cleanup(services.speech.initialize());

    const zh = render(SpeechControls, {}, "zh");
    assert(zh.includes("Microsoft Nanami") && zh.includes("Cloud Japanese"), "每个日语声音都要列出");
    assert(zh.includes('<span class="speech-voice-tag">本地</span>'), "本地声音必须标注");
    assert(zh.includes('<span class="speech-voice-tag">在线（非本地）</span>'), "在线声音必须标注");
    assert(zh.includes('<code>ja-JP</code>') && zh.includes('<code>ja</code>'), "必须显示声音语言");
    assert(zh.includes('<span class="speech-count">2</span>'), "必须显示日语声音数量");
    assert(!zh.includes("Chinese TTS"), "非日语声音不得出现在列表里");
    assert(zh.includes("已隐藏 1 个非日语声音。"), "隐藏数量必须交代");
    const selected = zh.match(/<li aria-current="true">([\s\S]*?)<\/li>/)?.[1] ?? "";
    assert(selected.includes("Microsoft Nanami"), "默认选中本地声音，且要在列表里标出来");
    assert(!zh.includes("正在等待设备日语声音加载"), "声音到位后不得再提示加载中");
});

test("除手机与 Windows 外的桌面不给下载入口", ["speech:ready"], context => {
    const {load} = context;
    const {services, render} = setup(context);
    const {SpeechControls} = load("src/presentation/components/SpeechControls.tsx");
    context.globals({
        window: {
            SpeechSynthesisUtterance: class {
                constructor(text) {
                    this.text = text;
                }
            },
            localStorage: {getItem: () => null, setItem() {
            }},
            speechSynthesis: {
                getVoices: () => [{voiceURI: "local-ja", name: "Microsoft Nanami", lang: "ja-JP", localService: true}],
                speak() {
                },
                cancel() {
                },
                addEventListener() {
                },
                removeEventListener() {
                },
            },
        },
    });
    context.cleanup(services.speech.initialize());

    const desktop = render(SpeechControls, {}, "zh");
    assert(desktop.includes('class="speech-diagnostics"'), "检测面板照旧");
    assert(!desktop.includes('class="engine-download"'), "没有安装包的平台不该出现下载入口");
});

test("Windows 给出本地语音引擎的下载入口", ["speech:ready", "speech:windows-engine"], context => {
    const {load} = context;
    const {services, render} = setup(context);
    const {SpeechControls} = load("src/presentation/components/SpeechControls.tsx");
    const {windowsEngineUrl} = load("src/presentation/components/speech-engine-link.ts");
    context.globals({
        navigator: {userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"},
        window: {
            SpeechSynthesisUtterance: class {
                constructor(text) {
                    this.text = text;
                }
            },
            localStorage: {getItem: () => null, setItem() {
            }},
            speechSynthesis: {
                getVoices: () => [{voiceURI: "en-us", name: "Microsoft David", lang: "en-US", localService: true}],
                speak() {
                },
                cancel() {
                },
                addEventListener() {
                },
                removeEventListener() {
                },
            },
        },
    });
    context.cleanup(services.speech.initialize());

    const html = render(SpeechControls, {}, "zh");
    assert(html.includes('class="engine-download"'), "Windows 必须给出下载入口");
    assert(html.includes(`href="${windowsEngineUrl}"`), "指向 Windows 语音引擎安装包");
    assert(html.includes("下载 Windows 语音引擎"), "按钮文案要说清装的是什么");
    assert(!html.includes("VoiceVox_TTS.apk"), "Windows 不该看到安卓的安装包");
    assert(html.includes("时间和语言"), "Windows 的提示要指向系统语音设置");
    assert(!html.includes("语言和输入法"), "不得把手机的设置路径搬到这里");
});

test("安卓壳给出手机端 TTS 的下载入口", ["speech:android-device"], context => {
    const {load} = context;
    const {services, render} = setup(context);
    const {SpeechControls} = load("src/presentation/components/SpeechControls.tsx");
    const {androidEngineUrl} = load("src/presentation/components/speech-engine-link.ts");
    context.globals({
        window: {
            AndroidSpeech: {},
            SpeechSynthesisUtterance: class {
                constructor(text) {
                    this.text = text;
                }
            },
            localStorage: {getItem: () => null, setItem() {
            }},
            speechSynthesis: {
                getVoices: () => [],
                speak() {
                },
                cancel() {
                },
                addEventListener() {
                },
                removeEventListener() {
                },
            },
        },
    });
    context.cleanup(services.speech.initialize());

    const phone = render(SpeechControls, {}, "zh");
    assert(phone.includes('class="engine-download"'), "手机上也必须有下载入口");
    assert(phone.includes(`href="${androidEngineUrl}"`), "手机上指向 TTS 引擎");
    assert(phone.includes("下载手机端 TTS"), "手机上的按钮文案");
    assert(!phone.includes("VoicevoxSapiSetup"), "手机上不该看到 Windows 的安装包");
    assert(!phone.includes("VOICEVOX ENGINE SERVER"), "不再有引擎服务器选项");
});

/** 带 id 的元素开标签，这样属性顺序不影响判断。 */
const tagOf = (html, id) => new RegExp(`<[a-z]+[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? "";

test("语音教程分手机与 Windows 两套步骤", ["page:guide:zh", "page:guide:en"], context => {
    const {load} = context;
    const {render} = setup(context);
    const {SpeechGuideScreen} = load("src/presentation/pages/SpeechGuideScreen.tsx");
    const {androidEngineUrl, windowsEngineUrl} = load("src/presentation/components/speech-engine-link.ts");
    const zh = render(SpeechGuideScreen, {}, "zh");
    const en = render(SpeechGuideScreen, {}, "en");

    for (const html of [zh, en]) {
        assert(html.includes('class="guide"'), "必须渲染教程页");
        assert(html.includes(androidEngineUrl), "必须链到手机端 TTS 安装包");
        assert(html.includes(windowsEngineUrl), "必须链到 Windows 语音引擎安装包");
        assert.equal((html.match(/<li>/g) || []).length, 8, "手机四步 + Windows 四步");
        assert(html.includes('href="./?page=settings"'), "要能回到朗读设置");
        assert(!html.includes("127.0.0.1:50021"), "不得再提引擎服务器地址");
        assert(!html.includes("--cors_policy_mode"), "不得再要求放行 CORS");
        assert(!html.includes("--host 0.0.0.0"), "不得再教局域网监听");
        assert(!html.includes("7-Zip"), "不再需要解压桌面引擎");
        assert(!html.includes('class="guide-tabs"'), "两套步骤各占一段，不需要标签栏");
        assert(!tagOf(html, "guide-panel-desktop"), "电脑面板是旧设计的残留，不得回来");
    }
    assert(zh.includes("常见问题") && en.includes("Questions"), "常见问题必须双语");
    assert(zh.includes("日语语音") && en.includes("Japanese voice"), "标题要说明只装日语语音");
    assert(zh.includes("VoicevoxSapiSetup.exe") && en.includes("VoicevoxSapiSetup.exe"), "要点名装的是哪个程序");
    const windowsPart = zh.slice(zh.indexOf('id="guide-steps-windows"'), zh.indexOf('id="guide-faq"'));
    assert(windowsPart.includes("时间和语言"), "Windows 的设置路径要写对");
    assert(!windowsPart.includes("语言和输入法"), "不得把手机的设置路径搬进 Windows 一节");
    assert(!windowsPart.includes("VoiceVox_TTS.apk"), "Windows 一节不得塞安卓的安装包");
});

test("首页的记录工具有清空按钮，确认区默认不出现", [], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {ProgressTools} = load("src/presentation/components/ProgressTools.tsx");
    const ui = fixture.ui();
    for (const locale of ["zh", "en"]) {
        const html = render(ProgressTools, {}, locale);
        assert(html.includes(`<button class="danger">${ui["ui.clearProgress"][locale]}</button>`), `缺少清空按钮：${locale}`);
        assert(!html.includes(ui["ui.clearProgressConfirm"][locale]), `确认按钮不应直接出现：${locale}`);
        assert(html.includes(ui["ui.dataTools"][locale].replaceAll("&", "&amp;")), `缺少数据工具标题：${locale}`);
    }
});

test("顶栏只有首页、教材库、搜索三个标签，设置走右上角齿轮", [], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {Shell} = load("src/presentation/shell/Shell.tsx");
    const ui = fixture.ui();
    for (const locale of ["zh", "en"]) {
        const html = render(Shell, {children: null}, locale);
        const desktop = html.match(/<nav class="desktop-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
        assert.deepEqual([...desktop.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ["./", "./?page=library", "./?page=search"]);
        assert(html.includes(`class="settings-link" href="./?page=settings" aria-label="${ui["ui.settings"][locale]}"`), `缺少设置齿轮：${locale}`);
        assert(!html.includes("<footer"), "设置不再挂在页脚");
        const actions = html.match(/<div class="header-actions">([\s\S]*?)<\/a><\/div>/)[1];
        assert(actions.indexOf('class="language-switch"') >= 0 && actions.indexOf('class="language-switch"') < actions.indexOf('class="settings-link"'), "语言切换紧挨在齿轮左边");
        assert(!html.includes(ui["ui.clearProgress"][locale]), "数据工具只在设置页");
    }
});

test("设置页依次是 App、显示、朗读，语言和记录工具不在这里", [], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {SettingsScreen} = load("src/presentation/pages/SettingsScreen.tsx");
    const ui = fixture.ui();
    for (const locale of ["zh", "en"]) {
        const html = render(SettingsScreen, {}, locale);
        const modules = [...html.matchAll(/<section class="settings-module"[^>]*><div class="dashboard-section-heading"><h2[^>]*>([^<]+)<\/h2>/g)].map(m => m[1]);
        assert.deepEqual(modules, ["ui.androidApp", "ui.displaySettings", "ui.speechSettings"].map(id => ui[id][locale]), `模块顺序不对：${locale}`);
        const display = html.slice(html.indexOf(ui["ui.displaySettings"][locale]), html.indexOf(ui["ui.speechSettings"][locale]));
        for (const id of ["ui.dayMode", "ui.nightMode", "ui.textScale"])
            assert(display.includes(ui[id][locale]), `显示设置缺少 ${id}：${locale}`);
        assert(display.includes('id="text-scale-range"'), "放大倍率滑杆在显示设置里");
        assert(html.includes(ui["ui.downloadAndroid"][locale]), `缺少 APK 下载：${locale}`);
        assert(!html.includes(ui["ui.clearProgress"][locale]), "记录工具已移到首页");
        assert(!html.includes('lang="zh-CN" aria-pressed'), "语言切换在顶栏，不在设置页");
    }
    context.globals({window: {location: {search: "?page=settings"}, akamonkaiAndroid: {checkUpdates() {}}}});
    const app = render(SettingsScreen, {}, "zh");
    assert(app.includes(ui["ui.checkUpdates"].zh), "App 壳里要有检查更新按钮");
    assert(!app.includes("data-android-download"), "App 里不再给 APK 下载");
});
