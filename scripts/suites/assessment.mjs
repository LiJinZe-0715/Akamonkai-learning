import assert from "node:assert/strict";
import {test} from "../harness.mjs";

/**
 * 答题与草稿（新模型）。
 *
 * 草稿用例用一个 30 行的手写 React hooks 运行时来跑真实的挂载/重渲染/副作用时序，
 * 不引 jsdom：断言的是「切后台会不会落盘」「双击会不会记两次」这类行为，
 * 而不是 DOM 结构。每个用例自己建一份运行时，互不影响。
 */

/** 手写 hooks 运行时：数组当槽位，手动重放 render。 */
function createReactRuntime() {
    const slots = [];
    const effects = [];
    let cursor = 0;
    const changed = (before, after) => !before || after.some((value, index) => !Object.is(value, before[index]));

    return {
        reset() {
            cursor = 0;
            effects.length = 0;
        },
        flush() {
            effects.splice(0).forEach(effect => effect());
        },
        cleanup() {
            slots.forEach(slot => slot?.cleanup?.());
        },
        slots,
        react: {
            useState(initial) {
                const index = cursor++;
                if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
                return [slots[index], value => {
                    slots[index] = typeof value === "function" ? value(slots[index]) : value;
                }];
            },
            useRef(initial) {
                const index = cursor++;
                return (slots[index] ??= {current: initial});
            },
            useMemo(factory, dependencies) {
                const index = cursor++;
                if (changed(slots[index]?.dependencies, dependencies)) slots[index] = {dependencies, value: factory()};
                return slots[index].value;
            },
            useEffect(effect, dependencies) {
                const index = cursor++;
                if (!changed(slots[index]?.dependencies, dependencies)) return;
                effects.push(() => {
                    slots[index]?.cleanup?.();
                    slots[index] = {dependencies, cleanup: effect()};
                });
            },
        },
    };
}

/** 挂载 useAssessment，返回可手动驱动的句柄。 */
function mountAssessment(context, source) {
    const {load} = context;
    const {DraftService} = load("src/modules/assessment/application/draft-service.ts");
    const {AssessmentService} = load("src/modules/assessment/application/assessment-service.ts");
    const drafts = new Map();
    const draftService = new DraftService({
        read: key => drafts.get(key),
        write: (key, value) => {
            drafts.set(key, value);
            return true;
        },
        remove: key => drafts.delete(key),
    });
    const assessment = new AssessmentService();

    const runtime = createReactRuntime();
    context.cleanup(() => runtime.cleanup());
    const listeners = new Map();
    const events = {
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name, listener) => {
            if (listeners.get(name) === listener) listeners.delete(name);
        },
    };
    let scroll, updates = 0;
    const progress = {version: 1, words: {}, results: {}};
    const state = {
        services: {
            studySession: {source: () => source, submit: () => ({status: "submitted", progress})},
            assessment,
            drafts: draftService,
        },
        setNotice() {
        },
        updateProgress: async change => {
            updates++;
            change(progress);
            return true;
        },
    };
    context.globals({
        window: {...events, scrollTo: value => {
            scroll = value;
        }},
        document: {...events, visibilityState: "visible"},
    });

    const hookModule = load("src/modules/assessment/presentation/hooks/use-assessment.ts", specifier => {
        if (specifier === "react") return runtime.react;
        if (specifier.endsWith("/StudyContext"))
            return {useServices: () => state.services, useProgressActions: () => state, useFeedback: () => state};
        return undefined;
    });

    return {
        drafts,
        listeners,
        runtime,
        draftService,
        get updates() {
            return updates;
        },
        get scroll() {
            return scroll;
        },
        render() {
            runtime.reset();
            const hook = hookModule.useAssessment(source, "unit", "quiz");
            runtime.flush();
            return hook;
        },
    };
}

const questionsOf = ({load}, lesson) => load("src/modules/curriculum/domain/lesson-modules.ts").lessonQuestions(lesson.modules);
const answerOf = question => question.kind === "choice" ? question.correctOptionIndexes[0] : question.acceptedAnswers[0];

/* ── 判分 ─────────────────────────────────────────────────── */

test("全部答对时判分完整且满分", ["assessment:all-correct", "assessment:submitted"], context => {
    const {load, fixture} = context;
    const {AssessmentService} = load("src/modules/assessment/application/assessment-service.ts");
    const {StudySessionService} = load("src/application/study-session-service.ts");
    const assessment = new AssessmentService();
    let graded = 0;
    for (const lesson of fixture.units()) {
        const prepared = assessment.start(questionsOf(context, lesson));
        if (!prepared.length) continue;
        const answers = Object.fromEntries(prepared.map(question => [question.id, answerOf(question)]));
        const result = assessment.grade(prepared, answers);
        assert.equal(result.correct, prepared.length, `满分题被扣分：${lesson.id}`);
        assert(result.complete, `题目未答完：${lesson.id}`);
        assert.deepEqual(result.wrongIds, []);
        graded++;
    }
    assert(graded > 0);

    const lesson = fixture.units().find(item => questionsOf(context, item).length);
    const session = new StudySessionService(assessment, {record: (progress, id, correct, total) => ({
        ...progress, results: {...progress.results, [id]: {correct, total, at: "2026-10-05T00:00:00.000Z"}},
    })});
    const questions = session.start(lesson);
    const answers = Object.fromEntries(questions.map(question => [question.id, answerOf(question)]));
    const submission = session.submit(questions, answers, {version: 1, words: {}, results: {}}, lesson.id, "quiz");
    assert.equal(submission.status, "submitted");
    assert.equal(submission.progress.results[`${lesson.id}:quiz`].correct, questions.length);
});

test("部分答错时给出错题列表，不计为完成", ["assessment:partial", "assessment:incomplete"], context => {
    const {load, fixture} = context;
    const {AssessmentService} = load("src/modules/assessment/application/assessment-service.ts");
    const {StudySessionService} = load("src/application/study-session-service.ts");
    const assessment = new AssessmentService();
    const lesson = fixture.units().find(item => questionsOf(context, item).filter(question => question.kind === "choice").length > 1);
    const questions = assessment.start(questionsOf(context, lesson));
    const choice = questions.find(question => question.kind === "choice");

    const wrong = Object.fromEntries(questions.map(question => [question.id, answerOf(question)]));
    wrong[choice.id] = choice.options.findIndex((_, index) => !choice.correctOptionIndexes.includes(index));
    const partial = assessment.grade(questions, wrong);
    assert.equal(partial.correct, questions.length - 1);
    assert.deepEqual(partial.wrongIds, [choice.id]);
    assert(partial.complete);

    const session = new StudySessionService(assessment, {});
    assert.deepEqual(session.submit(questions, {}, {version: 1, words: {}, results: {}}, lesson.id, "quiz"),
        {status: "incomplete"});
    assert.deepEqual(session.submit([], {}, {version: 1, words: {}, results: {}}, lesson.id, "quiz"),
        {status: "incomplete"});
});

test("多选题的每个正确选项都算对，假名折叠覆盖片假名与长音", ["assessment:alternate"], context => {
    const {load, fixture} = context;
    const {AssessmentService} = load("src/modules/assessment/application/assessment-service.ts");
    const {normalizeAnswer, grade} = load("src/modules/assessment/domain/question.ts");
    const assessment = new AssessmentService();
    for (const lesson of fixture.units()) {
        for (const question of assessment.start(questionsOf(context, lesson)).filter(item => item.kind === "choice")) {
            for (const accepted of question.correctOptionIndexes)
                assert(assessment.isCorrect(question, accepted), `丢掉了备选正确答案：${question.id}`);
            const rejected = question.options.findIndex((_, index) => !question.correctOptionIndexes.includes(index));
            if (rejected >= 0) assert(!assessment.isCorrect(question, rejected), `错误选项被判对：${question.id}`);
        }
    }
    assert.equal(normalizeAnswer("　カ タ カ ナ　"), "かたかな");
    assert.equal(normalizeAnswer("ヷヸヹヺ"), normalizeAnswer("わ\u3099ゐ\u3099ゑ\u3099を\u3099"),
        "没有预组合平假名的片假名也必须折叠");
    assert.equal(normalizeAnswer("コーヒー"), "こーひー", "长音符在两种假名里是同一个字符");
    const plain = [{id: "q", kind: "fill-in", requiredScript: "any-kana", prompt: [{japanese: "?"}], acceptedAnswers: ["かたかな"]}];
    assert.equal(grade(plain, {q: "ｶﾀｶﾅ"}).correct, 1);
    assert.equal(grade([{...plain[0], acceptedAnswers: ["a"]}], {q: "  "}).complete, false);
    // 片假名题考的就是片假名写法：平假名作答必须判错，半角和空格仍然容忍。
    const loanword = [{id: "q", kind: "fill-in", requiredScript: "katakana", prompt: [{japanese: "?"}],
        acceptedAnswers: ["コーヒー", "けしゴム"]}];
    assert.equal(grade(loanword, {q: "こーひー"}).correct, 0, "片假名题不能接受平假名");
    assert.equal(grade(loanword, {q: "けしごむ"}).correct, 0, "混写答案的片假名部分也要匹配");
    assert.equal(grade(loanword, {q: " ｺｰﾋｰ "}).correct, 1);
    assert.equal(grade(loanword, {q: "けしゴム"}).correct, 1);
});

test("只练错题时只返回错题，且不覆盖完整成绩", ["assessment:retry-wrong"], async context => {
    const {load, fixture} = context;
    const {AssessmentService} = load("src/modules/assessment/application/assessment-service.ts");
    const lesson = fixture.units().find(item => questionsOf(context, item).length > 2);
    const source = questionsOf(context, lesson);

    const mounted = mountAssessment(context, source);
    const questions = mounted.render().questions;
    const answers = Object.fromEntries(questions.map(question => [question.id, answerOf(question)]));
    const wrong = {...answers};
    const first = questions[0];
    wrong[first.id] = first.kind === "choice"
        ? first.options.findIndex((_, index) => !first.correctOptionIndexes.includes(index))
        : "まちがい";

    const assessment = new AssessmentService();
    assert.deepEqual(assessment.retry(questions, wrong).map(question => question.id), [first.id]);
    assert.deepEqual(assessment.retry(questions, answers), [], "全部答对时没有错题可练");

    let hook = mounted.render();
    hook.setAnswers(wrong);
    hook = mounted.render();
    await hook.submit();

    const before = mounted.updates;
    hook.restart(true);
    const retryHook = mounted.render();
    assert(retryHook.wrongOnly, "只练错题必须进入 wrongOnly 状态");
    assert.equal(retryHook.questions.length, 1, "只练错题只应保留错的那一道");
    retryHook.setAnswers({[first.id]: first.kind === "choice" ? first.correctOptionIndexes[0] : first.acceptedAnswers[0]});
    mounted.render();
    await retryHook.submit();
    mounted.render();
    assert.equal(mounted.updates, before, "只练错题不得覆盖完整成绩");
});

/* ── 草稿 ─────────────────────────────────────────────────── */

const sampleQuestions = [
    {id: "choice", kind: "choice", prompt: [{japanese: "選択"}],
        options: [[{japanese: "一"}], [{japanese: "二"}]], correctOptionIndexes: [1]},
    {id: "text", kind: "fill-in", requiredScript: "any-kana", prompt: [{japanese: "入力"}], acceptedAnswers: ["答え"]},
];

test("改答案不重建题目签名，避免重复读取题目源", ["draft:signature-reuse"], ({load}) => {
    const {DraftService} = load("src/modules/assessment/application/draft-service.ts");
    const drafts = new Map();
    const service = new DraftService({
        read: key => drafts.get(key),
        write: (key, value) => {
            drafts.set(key, value);
            return true;
        },
        remove: key => drafts.delete(key),
    });
    let reads = 0;
    const tracked = new Proxy(sampleQuestions, {
        get(target, property, receiver) {
            if (/^\d+$/.test(String(property))) reads++;
            return Reflect.get(target, property, receiver);
        },
    });
    const state = {questions: sampleQuestions, answers: {}, wrongOnly: false};
    service.save("cached", tracked, state);
    const afterPreparation = reads;
    service.save("cached", tracked, {...state, answers: {text: "変更"}});
    assert.equal(reads, afterPreparation, "改答案不应重新遍历题目源");
});

test("输入停顿后自动保存最新答案", ["draft:debounced"], async context => {
    const mounted = mountAssessment(context, sampleQuestions);
    let hook = mounted.render();
    const answers = {choice: 1, text: "答え"};
    hook.setAnswers(answers);
    hook = mounted.render();
    assert(!mounted.drafts.has("unit:quiz"), "没有答案时不应创建草稿");

    for (const draft of ["入", "入力", "入力中"]) {
        hook.setAnswers({...answers, text: draft});
        hook = mounted.render();
        assert(!mounted.drafts.has("unit:quiz"), `防抖期间不应落盘：${draft}`);
    }
    await new Promise(resolve => setTimeout(resolve, 230));
    assert.equal(mounted.drafts.get("unit:quiz").answers.text, "入力中", "停顿后必须落盘最后一次输入");
});

test("切到后台立即落盘，回到前台不再重复", ["draft:background"], context => {
    const mounted = mountAssessment(context, sampleQuestions);
    const hook = mounted.render();
    hook.setAnswers({choice: 1, text: "入力中"});
    mounted.render();

    globalThis.document.visibilityState = "hidden";
    mounted.listeners.get("visibilitychange")();
    assert.equal(mounted.drafts.get("unit:quiz").answers.text, "入力中", "切后台必须立刻落盘");

    globalThis.document.visibilityState = "visible";
    mounted.listeners.get("visibilitychange")();
    assert.equal(mounted.drafts.get("unit:quiz").answers.text, "入力中", "回到前台不应改写草稿");
});

test("页面隐藏时落盘尚未提交的答案", ["draft:pagehide"], context => {
    const mounted = mountAssessment(context, sampleQuestions);
    const hook = mounted.render();
    hook.setAnswers({choice: 1, text: "答え"});
    mounted.render();
    mounted.listeners.get("pagehide")();
    assert(mounted.drafts.get("unit:quiz").answers.choice !== undefined, "pagehide 必须把答案刷进草稿");
});

test("提交后清空草稿，重复提交只记录一次", ["draft:cleared", "assessment:double-submit"], async context => {
    const mounted = mountAssessment(context, sampleQuestions);
    let hook = mounted.render();
    hook.setAnswers({choice: 1, text: "答え"});
    hook = mounted.render();
    await Promise.all([hook.submit(), hook.submit()]);
    mounted.render();
    assert.equal(mounted.updates, 1, "双击提交只能记录一次");
    assert(!mounted.drafts.has("unit:quiz"), "提交后必须清空草稿");

    mounted.runtime.cleanup();
    assert.equal(mounted.listeners.size, 0, "卸载后不得残留监听器");
    assert.equal(mounted.scroll.behavior, "auto", "滚动动效交给 CSS 的 reduced-motion 规则");
});

test("单词测验现场生成，干扰项与正确答案位置都打乱", ["assessment:dynamic-vocabulary"], context => {
    const {load, fixture} = context;
    const {AssessmentService} = load("src/modules/assessment/application/assessment-service.ts");
    const {StudySessionService} = load("src/application/study-session-service.ts");
    const lesson = fixture.units().find(item =>
        item.wordQuiz && (item.modules.words?.items.length ?? 0) >= 8);
    assert(lesson, "夹具里需要有带词表的 wordQuiz 课");
    const words = lesson.modules.words.items;
    const meaning = id => lesson.texts[id]?.zh ?? "";
    const seeded = () => {
        let state = 7;
        return () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
        };
    };

    const first = new AssessmentService(seeded()).vocabulary(words, meaning);
    const repeat = new AssessmentService(seeded()).vocabulary(words, meaning);
    assert(first.length >= 8, "每个词都应生成一道题");
    assert.deepEqual(first, repeat, "同一随机源的结果必须可复现");
    assert(first.every(question => question.kind === "choice" && question.correctOptionIndexes.length === 1));
    const indexes = first.map(question => question.correctOptionIndexes[0]);
    assert(new Set(indexes).size > 1, "正确答案位置必须分散");
    assert(indexes.filter(index => index === 0).length < first.length * 0.5, "不能全选 A 就满分");
    assert.equal(new Set(first.map(question => question.id)).size, first.length, "题目 id 必须唯一");
    for (const question of first)
        assert(new AssessmentService(seeded()).isCorrect(question, question.correctOptionIndexes[0]),
            `生成题必须可判分：${question.id}`);

    const other = new AssessmentService(() => 0.83).vocabulary(words, meaning);
    assert.notDeepEqual(first.map(question => question.options), other.map(question => question.options),
        "不同随机源要给出不同的选项顺序");

    // 固化词题已经删干净：词下面只能挂教材自带的固定题。
    assert(words.every(word => word.questions.every(question => question.kind === "fill-in")),
        `词下仍残留固化的词义选择题：${lesson.id}`);
    const session = new StudySessionService(new AssessmentService(seeded()), {});
    assert(session.source(lesson).some(question => question.id.startsWith("vocabulary-quiz.")),
        "测验题源必须包含现场生成的单词题");
});
