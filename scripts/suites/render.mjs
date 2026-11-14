import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {compileExams} from "../exam-compiler.mjs";
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

test("教材库按等级分组，每本书只出现在一个等级下", ["page:catalog:zh", "page:catalog:en", "level:beginner", "level:mid-intermediate", "level:intermediate", "level:jlpt-grammar", "level:jlpt-shiken"], context => {
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
            const position = libraryLevels.indexOf(book.shelfLevel);
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
    const {render} = setup(context);
    const {LessonScreen} = load("src/modules/curriculum/presentation/index.ts");
    const {bookHref, lessonHref} = load("src/modules/curriculum/presentation/routes.ts");
    const {defaultView} = load("src/modules/curriculum/domain/catalog.ts");
    const catalog = fixture.catalog();
    const byId = summariesOf(catalog);

    // 每本教材抽查前后各一课：页签组合在整本里是稳定的，全量渲染代价过高。
    for (const locale of ["zh", "en"])
        // 真题书没有课（内容是 ExamPaperScreen），这里只抽查教材书。
        for (const book of catalog.books.filter(item => item.lessonIds.length))
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
                }
            }
});

/* ── 页签 ─────────────────────────────────────────────────── */

const viewModules = {
    articles: ["src/modules/reading/presentation/index.ts", "ReadingScreen"],
    dialogues: ["src/modules/reading/presentation/index.ts", "DialogueScreen"],
    grammar: ["src/modules/grammar/presentation/index.ts", "GrammarScreen"],
    words: ["src/modules/vocabulary/presentation/index.ts", "VocabularyScreen"],
    kanji: ["src/modules/curriculum/presentation/pages/KanjiScreen.tsx", "KanjiScreen"],
    quiz: ["src/modules/assessment/presentation/index.ts", "AssessmentScreen"],
};

/** 文法例句（含下级条目）里出现的对话角色，声优栏必须照这个清单配置。 */
function grammarDialogueRoles(lesson) {
    const roles = new Set();
    const walk = items => {
        for (const grammar of items ?? []) {
            for (const example of grammar.examples ?? [])
                if (example.kind === "dialogue")
                    for (const line of example.lines ?? []) roles.add(line.role);
            walk(grammar.children);
        }
    };
    walk(lesson.modules.grammar?.items);
    return [...roles];
}

/** 测验页 props：题源与分块同一次生成，标题取页签的日语名。 */
function quizProps(load, services, lesson, limit) {
    const {viewTitle} = load("src/modules/curriculum/presentation/data/view-labels.ts");
    const quiz = services.studySession.sections(lesson);
    const source = quiz.flatMap(section => section.questions);
    return {
        source: limit ? source.slice(0, limit) : source,
        sections: quiz.map(section => ({
            label: viewTitle(lesson.bookId, section.module),
            questionIds: section.questions.map(question => question.id),
        })),
        texts: lesson.texts, lessonId: lesson.id, view: "quiz",
    };
}

function propsFor(services, lesson, view, load) {
    const modules = lesson.modules;
    switch (view) {
        case "kanji": return {items: modules.kanji?.items ?? [], texts: lesson.texts, lessonId: lesson.id};
        case "words": return {words: modules.words?.items ?? [], texts: lesson.texts};
        case "articles": return {articles: modules.articles?.items ?? [], texts: lesson.texts, lessonId: lesson.id};
        case "dialogues": return {dialogues: modules.dialogues?.items ?? [], texts: lesson.texts, lessonId: lesson.id};
        case "grammar": return {grammars: modules.grammar?.items ?? [], texts: lesson.texts, lessonId: lesson.id};
        default: return quizProps(load, services, lesson);
    }
}

for (const view of ["articles", "dialogues", "grammar", "words", "kanji", "quiz"]) {
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
                const html = render(Component, propsFor(services, lesson, view, load), locale);
                assert(!html.includes("Unknown text ID"), `缺少文案：${lesson.id} / ${view} / ${locale}`);
                assert(html.length > 0, `空白页面：${lesson.id} / ${view}`);
            }
        }
    });
}

test("测验页按模块顺序分块，索引锚点与题号连续", ["view:quiz:zh", "view:quiz:en"], context => {
    const {load, fixture} = context;
    const {services, render} = setup(context);
    const {AssessmentScreen} = load("src/modules/assessment/presentation/index.ts");
    const {moduleOrder} = load("src/modules/curriculum/domain/lesson-modules.ts");
    const {viewTitle} = load("src/modules/curriculum/presentation/data/view-labels.ts");
    const lesson = fixture.units().find(unit => services.studySession.sections(unit).length > 1);
    assert(lesson, "需要一课有至少两个带题模块");
    const quiz = services.studySession.sections(lesson);
    assert.deepEqual(quiz.map(section => section.module),
        moduleOrder.filter(key => quiz.some(section => section.module === key)),
        "测验分块必须按模块顺序");
    const props = quizProps(load, services, lesson);
    for (const locale of ["zh", "en"]) {
        const html = render(AssessmentScreen, props, locale);
        const index = html.match(/<nav class="quiz-index"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
        const anchors = [...index.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
        const heads = [...html.matchAll(/<h2 class="quiz-block-head" id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)];
        assert.equal(heads.length, quiz.length, `分块标题数不对：${locale}`);
        assert.deepEqual(anchors, heads.map(head => head[1]), `索引锚点要和分块标题一一对应：${locale}`);
        quiz.forEach((section, position) => assert(heads[position][2].includes(viewTitle(lesson.bookId, section.module)),
            `第 ${position + 1} 块标题不对：${locale}`));
        const numbers = [...html.matchAll(/<span class="question-number">(\d+)<\/span>/g)].map(match => Number(match[1]));
        assert.equal(numbers.length, props.source.length, `题目数量不对：${locale}`);
        assert.deepEqual(numbers, numbers.map((_, position) => position + 1), `题号必须连续：${locale}`);
        assert(!html.includes("Unknown text ID"), `测验页缺译文：${locale}`);
    }
});

test("跟读文章按角色分段，角色名只在段落头出现一次", ["view:articles:zh", "view:articles:en"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {ReadingScreen} = load("src/modules/reading/presentation/index.ts");
    const units = fixture.units();
    const shadow = units.find(unit => unit.bookId === "nihongo-namachukei");
    const plain = units.find(unit => unit.bookId === "chukyu-o-manabo-chukyu-zenki");
    assert(shadow && plain, "缺少跟读文章或普通叙述文的夹具");
    const props = lesson => ({articles: lesson.modules.articles.items, texts: lesson.texts, lessonId: lesson.id});
    const firstRole = shadow.modules.articles.items[0].paragraphs[0].role;
    for (const locale of ["zh", "en"]) {
        const html = render(ReadingScreen, props(shadow), locale);
        assert(html.includes('class="passage-role"'), `跟读文章缺少角色名：${locale}`);
        assert(html.includes('class="passage-group"'), `跟读文章没有按段落分组：${locale}`);
        assert(html.includes(firstRole), `段落头没有显示第一个角色：${locale}`);
        assert(!html.includes('class="jline-role"'), `逐句行里重复了角色名：${locale}`);
        const plainHtml = render(ReadingScreen, props(plain), locale);
        assert(!plainHtml.includes('class="passage-role"'), `普通叙述文不该出现角色标签：${locale}`);
    }
});

test("每条重要表現录音各自成篇后仍显示 ■ 小标题和 ①②③④ 组号", [
    "view:dialogues:zh", "view:dialogues:en", "view:articles:zh", "view:articles:en",
], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {ReadingScreen, DialogueScreen} = load("src/modules/reading/presentation/index.ts");
    const lesson = fixture.units().find(unit => unit.bookId === "nihongo-namachukei");
    assert(lesson, "缺少生中継夹具");
    const dialogues = lesson.modules.dialogues.items;
    const articles = lesson.modules.articles.items;
    // 重要表現按 CD 轨拆开：L1 等 8 课 2 篇，L5/L8 各 3 篇。
    const groupedDialogues = dialogues.slice(4);
    const groupedArticles = articles.slice(4);
    assert(groupedDialogues.length >= 2 && groupedArticles.length === groupedDialogues.length,
        "重要表現应拆成一条录音一篇，且会话／本文篇数一致");
    const sections = groupedDialogues.flatMap(dialogue =>
        dialogue.lines.filter(line => line.section !== undefined).map(line => line.section));
    const groups = groupedDialogues.flatMap(dialogue =>
        dialogue.lines.filter(line => line.group !== undefined).map(line => line.group));
    const dialogueProps = items => ({dialogues: items, texts: lesson.texts, lessonId: lesson.id});
    const articleProps = items => ({articles: items, texts: lesson.texts, lessonId: lesson.id});
    for (const locale of ["zh", "en"]) {
        // 本文页有「整篇通读」「逐句拆解」两块，标题各出现一次；会话页只有一块。
        for (const [name, html, factor] of [
            ["会话", render(DialogueScreen, dialogueProps(groupedDialogues), locale), 1],
            ["本文", render(ReadingScreen, articleProps(groupedArticles), locale), 2],
        ]) {
            assert.equal(countOf(html, "passage-section"), sections.length * factor,
                `${locale} ${name} 的 ■ 小标题数量不对`);
            assert.equal(countOf(html, "passage-group-label"), groups.length * factor,
                `${locale} ${name} 的 ①②③④ 组号数量不对`);
            for (const section of sections) assert(html.includes(section), `${locale} ${name} 缺小标题 ${section}`);
            for (const dialogue of groupedDialogues)
                assert(html.includes(dialogue.title), `${locale} ${name} 缺独立篇标题 ${dialogue.title}`);
            assert(html.includes('class="dialogue-block"') || html.includes('class="passage-group"'),
                `${locale} ${name} 没有按分组分块`);
        }
        // 4 篇独立对话／本文不带分组标记，仍保持原来的平铺排版。
        const flatDialogue = render(DialogueScreen, dialogueProps([dialogues[0]]), locale);
        const flatArticle = render(ReadingScreen, articleProps([articles[0]]), locale);
        assert(!flatDialogue.includes('class="passage-section"'), `${locale} 独立会话不该有小标题`);
        assert(!flatDialogue.includes('class="passage-group-label"'), `${locale} 独立会话不该有组号`);
        assert(!flatArticle.includes('class="passage-section"'), `${locale} 独立本文不该有小标题`);
        assert(!flatArticle.includes('class="passage-group-label"'), `${locale} 独立本文不该有组号`);
    }
});

test("带录音的本文渲染原生播放器，没有录音的文章不渲染", ["view:articles:zh", "view:articles:en"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {ReadingScreen} = load("src/modules/reading/presentation/index.ts");
    const props = lesson => ({articles: lesson.modules.articles.items, texts: lesson.texts, lessonId: lesson.id});
    const units = fixture.units();
    const withAudio = units.find(unit => unit.bookId === "chukyu-o-manabo-chukyu-zenki"
        && unit.modules.articles.items[0].audio);
    const without = units.find(unit => unit.bookId === "nihongo-namachukei"
        && !unit.modules.articles.items[0].audio);
    assert(withAudio && without, "缺少带录音／不带录音的夹具");
    const audio = withAudio.modules.articles.items[0].audio;
    for (const locale of ["zh", "en"]) {
        const html = render(ReadingScreen, props(withAudio), locale);
        assert(html.includes('class="passage-audio"'), `本文缺播放器：${locale}`);
        assert(html.includes(`src="${audio}"`), `播放器地址不对：${locale}`);
        assert(html.includes('preload="metadata"'), `播放器不该预加载整条音轨：${locale}`);
        assert(!html.includes("Unknown text ID"), `播放器缺少文案：${locale}`);
        const plain = render(ReadingScreen, props(without), locale);
        assert(!plain.includes('class="passage-audio"'), `不带录音的文章不该有播放器：${locale}`);
    }
});

test("日语行组件：角色、正文、按钮各占一列，说明块挂在行外", ["view:grammar:zh", "view:grammar:en"], context => {
    const {load} = context;
    const {render} = setup(context);
    const {JapaneseLine, LineNote} = load("src/presentation/components/JapaneseLine.tsx");
    const note = React.createElement(LineNote, {label: "译"}, "译文内容");
    for (const role of [undefined, "渡辺"]) {
        const html = render(JapaneseLine, {text: "長い日本語の文です。", role, lessonId: "l1", children: note});
        const row = html.split('<div class="jline')[1].split("</div>")[0];
        assert(!row.includes("jline-note"), "说明块不能出现在日语行内");
        assert(row.includes('class="icon-button"'), "朗读按钮必须在日语行内");
        assert(html.includes('class="jline-note"'), "说明块应挂在日语行外");
        assert.equal(html.includes('class="jline has-role"'), Boolean(role), "有角色时才是三列布局");
        assert.equal(row.includes('class="jline-role"'), Boolean(role), "角色前缀单独成列");
    }
});

test("文法对话例句挂在统一日语行之外", ["view:grammar:zh", "view:grammar:en"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {GrammarScreen} = load("src/modules/grammar/presentation/index.ts");
    const lesson = fixture.units().find(unit => (unit.modules.grammar?.items ?? []).some(grammar =>
        (grammar.examples ?? []).some(example =>
            example.kind === "dialogue" && (example.lines ?? []).some(line => line.translationId))));
    assert(lesson, "教材里要有带译文的对话例句，否则这个布局无从验证");
    for (const locale of ["zh", "en"]) {
        const html = render(GrammarScreen, {
            grammars: lesson.modules.grammar.items, texts: lesson.texts, lessonId: lesson.id,
        }, locale);
        assert(!html.includes("Unknown text ID"), `缺少译文：${locale}`);
        // jline 是 grid 行容器，内部只该有角色、正文、朗读按钮。
        const row = html.split('<div class="jline')[1].split("</div>")[0];
        assert(!row.includes("jline-note"), `说明块不能出现在日语行内：${locale}`);
        assert(row.includes('class="icon-button"'), `朗读按钮必须在日语行内：${locale}`);
        assert(html.includes('class="jline-note"'), `说明块应挂在日语行外：${locale}`);
    }
});

test("带朗读的页签都有声优入口：对话按角色，其余页选默认声音", [
    "view:articles:zh", "view:dialogues:zh", "view:grammar:zh", "view:words:zh", "view:kanji:zh", "view:quiz:zh",
], context => {
    const {load, fixture} = context;
    const {services, render} = setup(context);
    const catalog = fixture.catalog();
    const byId = new Map(fixture.units().map(lesson => [lesson.id, lesson]));
    const contentOf = {
        kanji: lesson => lesson.modules.kanji?.items,
        words: lesson => lesson.modules.words?.items,
        articles: lesson => lesson.modules.articles?.items,
        dialogues: lesson => lesson.modules.dialogues?.items,
        grammar: lesson => lesson.modules.grammar?.items,
    };
    // 遍历全部页签而不是只查文法：以后哪个页签加了朗读按钮却忘了声优栏，这里会直接失败。
    for (const view of Object.keys(viewModules)) {
        const [file, name] = viewModules[view];
        const Component = load(file)[name];
        const summary = catalog.lessons.find(item => item.views.includes(view)
            && (!contentOf[view] || (contentOf[view](byId.get(item.id))?.length ?? 0) > 0));
        assert(summary, `没有可用于检查声优栏的课：${view}`);
        const html = render(Component, propsFor(services, byId.get(summary.id), view, load), "zh");
        const speaks = html.includes('class="icon-button"');
        const defaultBar = html.split('class="speech-controls speech-voice-bar"')[1]?.split("</div>")[0] ?? "";
        const roleBar = html.split('class="speech-controls speech-roles"')[1]?.split("</section>")[0] ?? "";
        if (contentOf[view]) {
            assert(speaks, `${view} 页应该有朗读按钮，测试没渲染到内容`);
            assert(defaultBar || roleBar, `${view} 页有朗读按钮却没有声优入口`);
            assert((defaultBar || roleBar).includes('type="range"'),
                `${view} 页声优栏缺少语速控件（语速要能在课页直接调）`);
        }
        const hasGrammarRoles = view === "grammar" && grammarDialogueRoles(byId.get(summary.id)).length > 0;
        if (view === "dialogues" || hasGrammarRoles) {
            assert(roleBar.includes("<select"), `${view} 页缺少按角色选择声优的下拉`);
            assert(!defaultBar, `${view} 页不该同时挂两块控件条`);
        } else if (speaks) {
            assert(defaultBar.includes("<select"), `${view} 页缺少默认声音下拉`);
            assert(!roleBar, `${view} 页不该出现按角色的声优栏`);
        }
    }
});

test("文法例句里的 A/B 对话按角色配音，单句例句仍用默认声音", ["view:grammar:zh", "view:grammar:en"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {GrammarScreen} = load("src/modules/grammar/presentation/index.ts");
    const ui = fixture.ui();
    const lessons = fixture.units();
    const withDialogue = lessons.find(lesson => grammarDialogueRoles(lesson).length >= 2);
    const plain = lessons.find(lesson => (lesson.modules.grammar?.items?.length ?? 0) > 0
        && grammarDialogueRoles(lesson).length === 0);
    assert(withDialogue, "教材里要有带双人对话例句的文法课");
    assert(plain, "教材里也要有只有单句例句的文法课");
    const props = lesson => ({grammars: lesson.modules.grammar.items, texts: lesson.texts, lessonId: lesson.id});
    for (const locale of ["zh", "en"]) {
        const html = render(GrammarScreen, props(withDialogue), locale);
        const bar = html.split('class="speech-controls speech-roles"')[1]?.split("</section>")[0] ?? "";
        const labels = [...bar.matchAll(/<label>([^<]*)<select/g)].map(match => match[1]);
        assert(labels.includes(ui["ui.speechVoice"][locale]), `文法页缺少默认声音下拉：${locale}`);
        for (const role of grammarDialogueRoles(withDialogue))
            assert(labels.includes(role), `文法页缺少 ${role} 的声优下拉：${locale}`);
        assert(!html.includes('class="speech-controls speech-voice-bar"'), `文法页不该挂两块声优栏：${locale}`);
        const plainHtml = render(GrammarScreen, props(plain), locale);
        assert(plainHtml.includes('class="speech-controls speech-voice-bar"'), `纯单句文法课应有默认声音下拉：${locale}`);
        assert(!plainHtml.includes('class="speech-controls speech-roles"'), `纯单句文法课不该出现角色下拉：${locale}`);
    }
});

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
            const noteBlocks = words.reduce((total, word) => total
                + (word.noteIds ?? []).filter(id => lesson.texts[id]?.[locale]?.trim()).length, 0);
            assert.equal(countOf(html, "word-note"), noteBlocks,
                `用法块数量不符（空译文不应显示）：${lesson.id}`);
            // 解析（搭配说明、辨析、拆解）收在折叠区里，每词至多一个；没有内容的词不开折叠。
            const folded = words.filter(word => (word.patterns?.length ?? 0) > 0
                || (word.contrasts?.length ?? 0) > 0
                || (word.analysisId && lesson.texts[word.analysisId][locale].trim())).length;
            assert.equal(countOf(html, "word-analysis"), folded, `解析折叠区数量不符：${lesson.id}`);
            // 恢复旧套件里的文法页与测验页渲染，不再只查词表。
            if (lesson.modules.grammar) {
                const grammarHtml = render(GrammarScreen, {
                    grammars: lesson.modules.grammar.items, texts: lesson.texts, lessonId: lesson.id,
                }, locale);
                assert(grammarHtml.includes('class="grammar-article"'), `文法页缺条目：${lesson.id}`);
                assert(!grammarHtml.includes("Unknown text ID"), `文法页缺译文：${lesson.id}`);
            }
            if (summary.views.includes("quiz")) {
                const quizHtml = render(AssessmentScreen, quizProps(load, services, lesson, 24), locale);
                assert(quizHtml.includes('class="question"') || quizHtml.includes('class="empty-state"'),
                    `测验页没有题目：${lesson.id}`);
                assert(!quizHtml.includes("Unknown text ID"), `测验页缺译文：${lesson.id}`);
            }
        }
    }
});

test("词的解析：骨架占位符换成本词，辨析显示对方词义", ["unit:plain"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {VocabularyScreen} = load("src/modules/vocabulary/presentation/index.ts");
    const lesson = fixture.units().find(item =>
        item.modules.words?.items.some(word => (word.patterns?.length ?? 0) > 0));
    assert(lesson, "夹具里需要有带搭配骨架的词条");
    const words = lesson.modules.words.items;
    const patterned = words.find(word => (word.patterns?.length ?? 0) > 0);
    const contrasted = words.find(word => (word.contrasts?.length ?? 0) > 0);
    const html = render(VocabularyScreen, {words, texts: lesson.texts}, "zh");
    // 占位符不能漏到页面上（漏了会被转义成 &lt;w&gt;），必须换成本词的基本形。
    assert(!html.includes("<w>") && !html.includes("&lt;w"), "骨架占位符漏到了页面上");
    const base = patterned.lemma ?? patterned.word;
    for (const entry of patterned.patterns) {
        const [before, after] = entry.pattern.split("<w>");
        assert(html.includes(`${before}<b>${base}</b>${after}`), `骨架没有换成本词：${entry.pattern}`);
    }
    assert(html.includes('class="word-pattern-text"'), "骨架没有渲染");
    assert(html.includes('class="word-analysis"'), "解析没有折叠区");
    if (contrasted) {
        const first = contrasted.contrasts[0];
        assert(html.includes(lesson.texts[first.glossId].zh.slice(0, 4)), "辨析没有显示对方词义");
    }
});

test("词条用法与拆解按界面语言显示，空译文不占位", ["unit:plain"], context => {    const {load, fixture} = context;
    const {render, ui} = setup(context);
    const {VocabularyScreen} = load("src/modules/vocabulary/presentation/index.ts");
    const lesson = fixture.units().find(item => item.modules.words?.items.some(word => word.analysisId));
    assert(lesson, "夹具里需要有带拆解的词条");
    const words = lesson.modules.words.items;
    const analyzed = words.find(word => word.analysisId);
    for (const locale of ["zh", "en"]) {
        const html = render(VocabularyScreen, {words, texts: lesson.texts}, locale);
        const analysis = lesson.texts[analyzed.analysisId][locale];
        assert(html.includes(ui["ui.grammarBreakdown"][locale]), `${locale} 词表缺拆解标签`);
        assert(html.includes(analysis.slice(0, 8)), `${locale} 词表缺拆解内容`);
        // 标签以前是硬编码中文，英文界面也照印。这里按另一语言反查，防止再退化。
        for (const id of ["ui.grammarUsage", "ui.grammarBreakdown"]) {
            const other = locale === "zh" ? "en" : "zh";
            assert(!html.includes(`>${ui[id][other]}<`), `${locale} 词表混进了 ${other} 的标签：${id}`);
        }
        const blank = structuredClone(lesson);
        blank.texts[analyzed.analysisId][locale] = " ";
        const blankHtml = render(VocabularyScreen, {words, texts: blank.texts}, locale);
        assert(!blankHtml.includes(analysis.slice(0, 8)), `${locale} 空译文不应显示解析内容`);
    }
});

test("纯汉字课只有汉字与测验两个页签", ["unit:kanji-group"], context => {
    const {load, fixture} = context;
    const {render} = setup(context);
    const {LessonScreen} = load("src/modules/curriculum/presentation/index.ts");
    const catalog = fixture.catalog();
    const groups = catalog.lessons.filter(summary => shapeOf(summary) === "kanji-group").slice(0, 6);
    assert(groups.length > 0, "没有纯汉字课");
    for (const summary of groups) {
        const book = catalog.books.find(item => item.id === summary.bookId);
        const html = render(LessonScreen, {book, lesson: summary, view: "kanji", catalog}, "zh");
        const tabs = html.match(/<nav class="lesson-modes"[^>]*>([\s\S]*?)<\/nav>/)[1];
        assert.equal(links(tabs).length, 2, `纯汉字课必须恰好两个页签：${summary.id}`);
        assert(tabs.includes("漢字") && tabs.includes("テスト"));
        assert(!tabs.includes("view=words"), "汉字与词汇不能混在一个模块里");
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
});

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

test("読解正文一段一个段落，书信抬头不粘在正文上", ["exam:passage-render"], context => {
    const {load} = context;
    const {render} = setup(context);
    const {ExamSectionView} = load("src/modules/exam/presentation/index.ts");
    const {examSections} = load("src/modules/exam/domain/exam.ts");
    const section = compileExams()
        .flatMap(exam => examSections(exam))
        .find(item => (item.body?.length ?? 0) > 1);
    assert(section, "真题里没有多段文章，这个用例失去意义");
    const html = render(ExamSectionView, {section, children: null});
    assert.equal(countOf(html, "passage-text"), section.body.length,
        `正文段落数应为 ${section.body.length}：${html.slice(0, 300)}`);
    assert(html.includes('class="exam-passage-body"'), "正文应包在独立容器里");
});

test("教材页列出真题时显示最近一次成绩", ["exam:book-result"], context => {
    const {load, fixture} = context;
    const {ui, render} = setup(context);
    const {BookScreen} = load("src/modules/curriculum/presentation/pages/BookScreen.tsx");
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {assessmentResultId} = load("src/modules/learning-progress/public.ts");
    const catalog = fixture.catalog();
    const exam = catalog.exams[0];
    assert(exam, "目录里没有真题");
    const book = catalog.books.find(item => (item.examIds ?? []).includes(exam.id));
    assert(book, "真题没有所属教材");
    const progress = emptyProgress();
    progress.results[assessmentResultId(exam.id, "exam")] = {
        correct: 63, total: exam.questionCount, at: "2026-11-10T00:00:00.000Z",
    };
    for (const locale of ["zh", "en"]) {
        const label = ui["ui.examLastResult"][locale]
            .replace("{correct}", "63")
            .replace("{total}", String(exam.questionCount));
        const html = render(BookScreen, {book, catalog}, locale, progress);
        assert(html.includes(label), `${locale} 教材页没显示真题成绩：${label}`);
        assert(html.includes('class="exam-last-result"'), `${locale} 成绩缺少标记`);
    }
    const blank = render(BookScreen, {book, catalog}, "zh", emptyProgress());
    assert(!blank.includes('class="exam-last-result"'), "没有成绩时不该显示成绩标记");
});
