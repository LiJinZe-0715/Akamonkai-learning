import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "@typescript/typescript6";

export async function checkPersistenceAndValidation({load, units, ui}) {
    const {emptyProgress, validateProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressCommandService} = load("src/modules/learning-progress/application/progress-command-service.ts");
    const {ProgressTransferService} = load("src/modules/learning-progress/application/progress-transfer-service.ts");
    const {BrowserProgressRepository} = load("src/modules/learning-progress/infrastructure/browser-progress-repository.ts");
    const {decodeTranslations} = load("src/modules/localization/infrastructure/http-ui-catalog.ts");
    const {requiredUiTextIds} = load("src/modules/localization/domain/ui-text-ids.ts");
    const {decodeLesson} = load("src/modules/curriculum/infrastructure/curriculum-content-decoder.ts");
    const {HttpWordAliases} = load("src/modules/learning-progress/infrastructure/http-word-aliases.ts");
    const {captureDraft, restoreDraft} = load("src/modules/assessment/domain/draft.ts");
    const {DraftService} = load("src/modules/assessment/application/draft-service.ts");
    const {AssessmentService} = load("src/modules/assessment/application/assessment-service.ts");
    const {readJson} = load("src/shared/infrastructure/http-json.ts");
    const clock = {now: () => "2026-10-05T00:00:00.000Z"};
    const aliases = await new HttpWordAliases(async () => JSON.parse(fs.readFileSync("data/content/word-aliases.json", "utf8"))).load();
    const vocabulary = Object.fromEntries(units.flatMap(unit => unit.words.map(word => [word.id, word])));
    for (const [id, canonical] of Object.entries(aliases)) {
        assert(vocabulary[id] && vocabulary[canonical], "Alias must refer to existing stable IDs");
        assert.equal(vocabulary[id].wordJa, vocabulary[canonical].wordJa);
        assert.equal(vocabulary[id].readingJa, vocabulary[canonical].readingJa);
    }
    await assert.rejects(new HttpWordAliases(async () => ({a: "b", b: "c"})).load());
    assert.deepEqual([...requiredUiTextIds].sort(), Object.keys(ui).sort());
    assert.throws(() => decodeTranslations({}));
    const missingUi = {...ui};
    delete missingUi[requiredUiTextIds[0]];
    assert.throws(() => decodeTranslations(missingUi));
    assert.throws(() => decodeTranslations({...ui, [requiredUiTextIds[0]]: {zh: "", en: "Home"}}));
    const lesson = structuredClone(units.find(unit => unit.questions.length));
    const textId = Object.keys(lesson.texts)[0];
    lesson.questions[0].prompt = [{ja: 42, textId}];
    assert.throws(() => decodeLesson(lesson, lesson.id));
    lesson.questions[0].prompt = [{ja: "日文", textId}];
    assert.throws(() => decodeLesson(lesson, lesson.id));
    const wordLesson = structuredClone(units.find(unit => unit.words.length > 1));
    wordLesson.words.push({...wordLesson.words[0]});
    assert.throws(() => decodeLesson(wordLesson, wordLesson.id), /duplicate word/);
    wordLesson.words.pop();
    wordLesson.words[0].id = " ";
    assert.throws(() => decodeLesson(wordLesson, wordLesson.id), /empty word ID/);
    wordLesson.words[0].id = "valid-word";
    wordLesson.words[0].progressId = " ";
    assert.throws(() => decodeLesson(wordLesson, wordLesson.id), /empty progress ID/);
    wordLesson.words[0].progressId = wordLesson.words[1].progressId = "shared-word";
    assert.doesNotThrow(() => decodeLesson(wordLesson, wordLesson.id), "Distinct placements may share a progress ID");
    assert(!validateProgress({...emptyProgress(), results: {test: {total: 1, correct: 1, at: "invalid"}}}));

    let stored = emptyProgress(), queue = Promise.resolve();
    const repository = {
        read: () => structuredClone(stored),
        write: value => {
            stored = structuredClone(value);
            return true;
        },
        exclusive: task => {
            const result = queue.then(() => task(true));
            queue = result.catch(() => {
            });
            return result;
        },
    };
    const left = new ProgressService(repository, clock, aliases),
        right = new ProgressService(repository, clock, aliases);
    const a = new ProgressCommandService(left), b = new ProgressCommandService(right);
    const staleLeft = left.load(), staleRight = right.load();
    await Promise.all([a.mark(staleLeft, "a", "saved"), b.mark(staleRight, "b", "mastered")]);
    assert(stored.words.a.saved && stored.words.b.mastered, "Two stale pages must retain both writes");
    await Promise.all([a.mark(staleLeft, "a", "saved"), b.mark(staleRight, "a", "saved")]);
    assert(stored.words.a.saved, "Two queued toggles must execute against the latest value");
    const oldBackup = left.export(stored);
    await a.mark(stored, "a", "saved");
    stored = left.record(stored, "test", 3, 4);
    const current = structuredClone(stored);
    const imported = left.import(oldBackup, current);
    assert.deepEqual(left.merge(current, JSON.parse(oldBackup)), imported);
    assert(!imported.words.a.saved, "An older backup must not resurrect a removed mark");
    assert.deepEqual(imported.results.test, current.results.test);
    const olderResult = {...emptyProgress(), results: {test: {correct: 1, total: 2, at: "2025-01-01T00:00:00Z"}}};
    assert.deepEqual(left.import(JSON.stringify(olderResult), current).results.test, current.results.test);
    const legacy = {
        ...emptyProgress(),
        words: {a: {saved: true, mastered: false}, legacy: {saved: true, mastered: false}}
    };
    const mergedLegacy = left.import(JSON.stringify(legacy), current);
    assert(!mergedLegacy.words.a.saved && mergedLegacy.words.legacy.saved, "Legacy conflicts retain current marks but missing IDs are imported");
    const [alias, canonical] = Object.entries(aliases)[0];
    const migrated = left.import(JSON.stringify({
        ...emptyProgress(),
        words: {[alias]: {saved: true, mastered: false}, [canonical]: {saved: false, mastered: true}}
    }), emptyProgress());
    assert.deepEqual(migrated.words[canonical], {saved: true, mastered: true});
    assert(!Object.hasOwn(migrated.words, alias));
    assert.equal(left.mark(migrated, alias, "saved").words[canonical].saved, false);
    assert.deepEqual(left.merge(emptyProgress(), {
        ...emptyProgress(), words: {[alias]: {saved: true, mastered: false}}
    }).words[canonical], {saved: true, mastered: false});
    const objectOnly = new ProgressService(repository, clock);
    objectOnly.export = objectOnly.import = () => { throw Error("Object updates must not serialize"); };
    const objectCommands = new ProgressCommandService(objectOnly);
    assert((await objectCommands.mark(emptyProgress(), "object-update", "saved")).progress.words["object-update"].saved);
    assert((await objectCommands.replace(emptyProgress())).progress.words["object-update"].saved);

    for (const hasLocks of [false, true]) {
        let available = false, disk = emptyProgress();
        const memory = new ProgressService({
            read: () => structuredClone(disk),
            write: value => {
                if (!available) return false;
                disk = structuredClone(value);
                return true;
            },
            exclusive: async task => task(hasLocks || available),
        }, clock);
        const memoryCommands = new ProgressCommandService(memory);
        const stale = memory.load();
        const [marked, unmarked] = await Promise.all([
            memoryCommands.mark(stale, "queued", "saved"),
            memoryCommands.mark(stale, "queued", "saved"),
        ]);
        assert(!marked.persisted && !unmarked.persisted);
        assert(marked.progress.words.queued.saved);
        assert(!unmarked.progress.words.queued.saved, "Queued toggles must use the preceding in-memory change when persistence fails");
        const mastered = await memoryCommands.mark(stale, "queued", "mastered");
        assert.deepEqual(mastered.progress.words.queued, {saved: false, mastered: true});
        available = true;
        assert((await memoryCommands.replace(stale)).persisted);
        assert.deepEqual(disk.words.queued, {saved: false, mastered: true}, "Restored persistence must save pending in-memory changes");
    }

    let resolveRead;
    const transfer = new ProgressTransferService(left, {
        size: () => 10, read: () => new Promise(resolve => {
            resolveRead = resolve;
        }), download() {
        }
    });
    let latest = emptyProgress();
    const reading = transfer.import({}, () => latest);
    latest = left.mark(latest, "during-import", "saved");
    resolveRead(JSON.stringify(emptyProgress()));
    const outcome = await reading;
    assert.equal(outcome.status, "imported");
    assert(outcome.progress.words["during-import"].saved, "File reads must resolve against current state");

    const descriptors = new Map(["localStorage", "navigator", "fetch", "window", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const values = new Map();
    const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
    const setGlobal = (name, value) => Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value
    });
    try {
        setGlobal("localStorage", storage);
        setGlobal("navigator", {});
        const browser = new BrowserProgressRepository();
        const damaged = JSON.stringify({
            version: 1,
            words: {good: {saved: true, mastered: false}, bad: {}},
            results: {bad: {total: 1, correct: 1, at: "bad"}}
        });
        values.set("akamonkai.progress.v1", damaged);
        const recovering = new ProgressService(browser, clock);
        const recovered = recovering.load();
        assert.equal(recovering.problem(), "corrupt");
        assert(recovered.words.good.saved && !Object.hasOwn(recovered.words, "bad"));
        assert.equal(browser.recovery(), damaged);
        const memoryOnly = await new ProgressCommandService(recovering).mark(recovered, "new", "saved");
        assert(!memoryOnly.persisted && memoryOnly.progress.words.new.saved);
        assert.equal(values.get("akamonkai.progress.v1"), damaged, "No lock support must not perform an unsafe write");
        setGlobal("navigator", {locks: {request: async (_, task) => task()}});
        const saved = await new ProgressCommandService(recovering).mark(recovered, "new", "saved");
        assert(saved.persisted);
        assert.equal(recovering.problem(), "corrupt", "A successful write must not clear the startup warning");
        assert.equal(values.get("akamonkai.progress.recovery.v1"), damaged);
        assert(validateProgress(browser.read()));
        values.set("akamonkai.progress.v1", damaged);
        storage.setItem = (key, value) => {
            if (key.endsWith("recovery.v1")) throw Error("Quota exceeded");
            values.set(key, value);
        };
        assert(!browser.write(emptyProgress()));
        assert.equal(values.get("akamonkai.progress.v1"), damaged, "A failed recovery backup must prevent destructive replacement");
        const listeners = new Set();
        setGlobal("window", {
            localStorage: storage,
            addEventListener: (_, listener) => listeners.add(listener),
            removeEventListener: (_, listener) => listeners.delete(listener)
        });
        let notifications = 0;
        const unsubscribe = browser.subscribe(() => notifications++);
        const notify = key => listeners.forEach(listener => listener({storageArea: storage, key}));
        notify("unrelated");
        notify("akamonkai.progress.v1");
        notify(null);
        assert.equal(notifications, 2);
        unsubscribe();
        assert.equal(listeners.size, 0);
        setGlobal("fetch", async (_, options) => {
            assert(options.signal);
            return {ok: true, json: async () => ({loaded: true})};
        });
        assert.deepEqual(await readJson("/content/test.json", 10), {loaded: true});
        setGlobal("fetch", async () => ({ok: false}));
        await assert.rejects(readJson("missing", 10), /could not be loaded/);
        let signal;
        setGlobal("fetch", (_, options) => {
            signal = options.signal;
            return new Promise(() => {
            });
        });
        await assert.rejects(readJson("hanging", 5), /timed out/);
        assert(signal.aborted);
        setGlobal("fetch", async () => ({
            ok: true, json: () => new Promise(() => {
            })
        }));
        await assert.rejects(readJson("hanging-body", 5), /timed out/);
        let requested;
        setGlobal("fetch", async url => {
            requested = url;
            return {ok: true, json: async () => ({loaded: true})};
        });
        for (const baseURI of ["https://example.test/app/", "https://example.test/app/index.html", "https://example.test/app"]) {
            setGlobal("document", {baseURI});
            await readJson("/content/test.json", 10);
            assert.equal(requested, "https://example.test/app/content/test.json", "Content paths resolve against the document directory: " + baseURI);
        }
        setGlobal("document", {baseURI: "file:///android_asset/index.html"});
        await readJson("content/test.json", 10);
        assert.equal(requested, "file:///android_asset/content/test.json", "Local packaging keeps the asset directory");

        const assessment = new AssessmentService(() => 0.25);
        const source = [{id: "choice", prompt: [{ja: "選択"}], options: [[{ja: "一"}], [{ja: "二"}]], accepted: [1]},
            {id: "text", prompt: [{ja: "入力"}], acceptedText: ["答え"]}];
        const questions = assessment.start(source);
        const answers = Object.fromEntries(questions.map(q => [q.id, q.options ? q.accepted[0] : "答え"]));
        const state = {questions, answers, page: 1, wrongOnly: false};
        const serialized = captureDraft(source, state);
        const resumed = restoreDraft(source, structuredClone(serialized), 1);
        assert.deepEqual(resumed, state);
        assert.equal(assessment.grade(resumed.questions, resumed.answers).correct, 2);
        const identicalOptions = [{id: "identical", prompt: [{ja: "同じ選択肢"}],
            options: [[{ja: "同じ"}], [{ja: "同じ"}]], accepted: [1]}];
        const identicalState = {questions: assessment.start(identicalOptions), answers: {}, page: 0, wrongOnly: false};
        assert.deepEqual(restoreDraft(identicalOptions, captureDraft(identicalOptions, identicalState), 10), identicalState,
            "Distinct options with identical text must preserve their original positions");
        assert.equal(restoreDraft([...source].reverse(), serialized, 1), undefined, "Changed source must invalidate stale drafts");
        assert.equal(restoreDraft(source, {...serialized, page: 99}, 1), undefined);
        assert.equal(restoreDraft(source, {...serialized, answers: {choice: 99}}, 1), undefined);
        const tampered = structuredClone(serialized);
        tampered.order.find(q => q.options).options = [0, 0];
        assert.equal(restoreDraft(source, tampered, 1), undefined);
        const drafts = new Map();
        const draftService = new DraftService({
            read: key => drafts.get(key), write: (key, value) => {
                drafts.set(key, value);
                return true;
            }, remove: key => drafts.delete(key)
        });
        let sourceReads = 0;
        const trackedSource = new Proxy(source, {get: (target, property, receiver) => {
            if (/^\d+$/.test(String(property))) sourceReads++;
            return Reflect.get(target, property, receiver);
        }});
        draftService.save("cached", trackedSource, state);
        const readsAfterPreparation = sourceReads;
        draftService.save("cached", trackedSource, {...state, answers: {text: "変更"}});
        assert.equal(sourceReads, readsAfterPreparation, "Answer changes must reuse the prepared signature and order");
        await checkAssessmentHook({source, assessment, draftService, drafts, load, setGlobal});
        await checkImportFeedback();
    } finally {
        for (const [name, descriptor] of descriptors) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
        }
    }
    console.log(JSON.stringify({
        persistenceAndValidation: "passed",
        multiPageWrites: "passed",
        importFreshnessAndConflictPolicy: "passed",
        recoveryAndStorageFailure: "passed",
        draftsAndRetryScores: "passed",
        malformedContentAndTimeouts: "passed"
    }));
}

async function checkImportFeedback() {
    const messages = [];
    let persisted = false;
    const context = {
        services: {
            progress: {
                recovery() {
                }
            }, progressTransfer: {import: async (_, current) => ({status: "imported", progress: current()})}
        },
        currentProgress: () => ({version: 1, words: {}, results: {}}),
        updateProgress: async () => persisted,
        setMessage: message => messages.push(message)
    };
    const module = {exports: {}};
    const compiled = ts.transpileModule(fs.readFileSync("src/presentation/shell/use-progress-tools.ts", "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
    new Function("require", "module", "exports", compiled)(() => ({useServices: () => context.services, useProgressActions: () => context, useFeedback: () => context}), module, module.exports);
    await module.exports.useProgressTools().importFile({});
    assert.equal(messages.at(-1), "ui.storageError", "Import success must not hide failure to persist");
    persisted = true;
    await module.exports.useProgressTools().importFile({});
    assert.equal(messages.at(-1), "ui.imported");
}

async function checkAssessmentHook({source, assessment, draftService, drafts, load, setGlobal}) {
    const slots = [], effects = [];
    let cursor = 0, updates = 0, scroll;
    const listeners = new Map();
    const events = {
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); }
    };
    setGlobal("window", {
        ...events,
        scrollTo: value => {
            scroll = value;
        }
    });
    setGlobal("document", {...events, visibilityState: "visible"});
    const changed = (before, after) => !before || after.some((value, i) => !Object.is(value, before[i]));
    const react = {
        useState(initial) {
            const i = cursor++;
            if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
            return [slots[i], value => {
                slots[i] = typeof value === "function" ? value(slots[i]) : value;
            }];
        },
        useRef(initial) {
            const i = cursor++;
            return slots[i] ??= {current: initial};
        },
        useMemo(factory, dependencies) {
            const i = cursor++;
            if (changed(slots[i]?.dependencies, dependencies)) slots[i] = {dependencies, value: factory()};
            return slots[i].value;
        },
        useEffect(effect, dependencies) {
            const i = cursor++;
            if (changed(slots[i]?.dependencies, dependencies)) effects.push(() => {
                slots[i]?.cleanup?.();
                slots[i] = {dependencies, cleanup: effect()};
            });
        },
    };
    const session = {source: () => source, submit: () => ({status: "submitted", progress: emptyTestProgress})};
    const emptyTestProgress = {version: 1, words: {}, results: {}};
    const context = {
        services: {session, assessment, drafts: draftService}, setMessage() {
        }, updateProgress: async change => {
            updates++;
            change(emptyTestProgress);
            return true;
        }
    };
    const module = {exports: {}};
    const compiled = ts.transpileModule(fs.readFileSync("src/modules/assessment/presentation/hooks/use-assessment.ts", "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022
        }
    }).outputText;
    new Function("require", "module", "exports", compiled)(specifier => {
        if (specifier === "react") return react;
        if (specifier.endsWith("/StudyContext")) return {useServices: () => context.services, useProgressActions: () => context, useFeedback: () => context};
        if (specifier.endsWith("/assessment-pagination")) return load("src/modules/assessment/presentation/data/assessment-pagination.ts");
        throw Error("Unexpected hook dependency: " + specifier);
    }, module, module.exports);
    const render = () => {
        cursor = 0;
        effects.length = 0;
        const hook = module.exports.useAssessment(source, "unit", "grammar-test");
        effects.splice(0).forEach(effect => effect());
        return hook;
    };
    let hook = render();
    const answers = Object.fromEntries(hook.questions.map(q => [q.id, q.options ? q.accepted[0] === 0 ? 1 : 0 : "答え"]));
    hook.setAnswers(answers);
    hook = render();
    assert(!drafts.has("unit:grammar-test"), "Mounting must not persist a draft with no answers");
    listeners.get("pagehide")();
    assert(drafts.get("unit:grammar-test").answers.choice !== undefined, "Typing is debounced until a flush");
    hook.setAnswers({...answers, text: "入力中"});
    hook = render();
    document.visibilityState = "hidden";
    listeners.get("visibilitychange")();
    assert.equal(drafts.get("unit:grammar-test").answers.text, "入力中", "Backgrounding flushes pending answers");
    document.visibilityState = "visible";
    hook.setAnswers({...answers, text: "自動保存"});
    hook = render();
    assert.equal(drafts.get("unit:grammar-test").answers.text, "入力中");
    await new Promise(resolve => setTimeout(resolve, 230));
    assert.equal(drafts.get("unit:grammar-test").answers.text, "自動保存", "An input pause saves the latest answer");
    hook.setAnswers(answers);
    hook = render();
    await Promise.all([hook.submit(), hook.submit()]);
    hook = render();
    assert.equal(updates, 1, "Double-clicking submit records only once");
    assert(!drafts.has("unit:grammar-test"), "Submitted drafts must be cleared");
    hook.restart(true);
    hook = render();
    assert(hook.wrongOnly && hook.questions.length === 1);
    hook.setAnswers({choice: hook.questions[0].accepted[0]});
    hook = render();
    await hook.submit();
    render();
    assert.equal(updates, 1, "Wrong-only practice must not replace the full assessment result");
    assert.equal(scroll.behavior, "auto", "JavaScript defers scrolling motion to the reduced-motion CSS rule");
    slots.forEach(slot => slot?.cleanup?.());
    assert.equal(listeners.size, 0, "Unmount removes draft lifecycle listeners");
}
