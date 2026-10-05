import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "@typescript/typescript6";

export async function checkAuditFixes({ load, units, ui }) {
  const { emptyProgress, validateProgress } = load("src/modules/learning-progress/domain/progress.ts");
  const { ProgressService } = load("src/modules/learning-progress/application/progress-service.ts");
  const { ProgressCommandService } = load("src/modules/learning-progress/application/progress-commands.ts");
  const { ProgressTransferService } = load("src/modules/learning-progress/application/progress-transfer.ts");
  const { BrowserProgressRepository } = load("src/modules/learning-progress/infrastructure/browser-progress-repository.ts");
  const { decodeTranslations } = load("src/modules/localization/infrastructure/http-ui-catalog.ts");
  const { requiredUiTextIds } = load("src/modules/localization/domain/ui-text-ids.ts");
  const { decodeLesson } = load("src/modules/curriculum/infrastructure/content-mapper.ts");
  const { HttpWordAliases } = load("src/modules/learning-progress/infrastructure/http-word-aliases.ts");
  const { captureDraft, restoreDraft } = load("src/modules/assessment/domain/draft.ts");
  const { DraftService } = load("src/modules/assessment/application/draft-service.ts");
  const { AssessmentService } = load("src/modules/assessment/application/assessment-service.ts");
  const { readJson } = load("src/shared/infrastructure/http-json.ts");
  const clock = { now: () => "2026-10-05T00:00:00.000Z" };
  const aliases = await new HttpWordAliases(async () => JSON.parse(fs.readFileSync("data/content/word-aliases.json", "utf8"))).load();
  const vocabulary = JSON.parse(fs.readFileSync("data/content/vocabulary.json", "utf8"));
  for (const [id, canonical] of Object.entries(aliases)) {
    assert(vocabulary[id] && vocabulary[canonical], "Alias must refer to existing stable IDs");
    assert.equal(vocabulary[id].wordJa, vocabulary[canonical].wordJa);
    assert.equal(vocabulary[id].readingJa, vocabulary[canonical].readingJa);
  }
  await assert.rejects(new HttpWordAliases(async () => ({ a: "b", b: "c" })).load());
  assert.deepEqual([...requiredUiTextIds].sort(), Object.keys(ui).sort());
  assert.throws(() => decodeTranslations({}));
  const missingUi = { ...ui }; delete missingUi[requiredUiTextIds[0]];
  assert.throws(() => decodeTranslations(missingUi));
  assert.throws(() => decodeTranslations({ ...ui, [requiredUiTextIds[0]]: { zh: "", en: "Home" } }));
  const lesson = structuredClone(units.find(unit => unit.questions.length));
  const textId = Object.keys(lesson.texts)[0];
  lesson.questions[0].prompt = [{ ja: 42, textId }];
  assert.throws(() => decodeLesson(lesson, lesson.id));
  lesson.questions[0].prompt = [{ ja: "日文", textId }];
  assert.throws(() => decodeLesson(lesson, lesson.id));
  assert(!validateProgress({ ...emptyProgress(), results: { test: { total: 1, correct: 1, at: "invalid" } } }));

  let stored = emptyProgress(), queue = Promise.resolve();
  const repository = {
    read: () => structuredClone(stored),
    write: value => { stored = structuredClone(value); return true; },
    exclusive: task => {
      const result = queue.then(() => task(true));
      queue = result.catch(() => {});
      return result;
    },
  };
  const left = new ProgressService(repository, clock, aliases), right = new ProgressService(repository, clock, aliases);
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
  assert(!imported.words.a.saved, "An older backup must not resurrect a removed mark");
  assert.deepEqual(imported.results.test, current.results.test);
  const olderResult = { ...emptyProgress(), results: { test: { correct: 1, total: 2, at: "2025-01-01T00:00:00Z" } } };
  assert.deepEqual(left.import(JSON.stringify(olderResult), current).results.test, current.results.test);
  const legacy = { ...emptyProgress(), words: { a: { saved: true, mastered: false }, legacy: { saved: true, mastered: false } } };
  const mergedLegacy = left.import(JSON.stringify(legacy), current);
  assert(!mergedLegacy.words.a.saved && mergedLegacy.words.legacy.saved, "Legacy conflicts retain current marks but missing IDs are imported");
  const [alias, canonical] = Object.entries(aliases)[0];
  const migrated = left.import(JSON.stringify({ ...emptyProgress(), words: { [alias]: { saved: true, mastered: false }, [canonical]: { saved: false, mastered: true } } }), emptyProgress());
  assert.deepEqual(migrated.words[canonical], { saved: true, mastered: true });
  assert(!Object.hasOwn(migrated.words, alias));
  assert.equal(left.mark(migrated, alias, "saved").words[canonical].saved, false);

  let resolveRead;
  const transfer = new ProgressTransferService(left, { size: () => 10, read: () => new Promise(resolve => { resolveRead = resolve; }), download() {} });
  let latest = emptyProgress();
  const reading = transfer.import({}, () => latest);
  latest = left.mark(latest, "during-import", "saved");
  resolveRead(JSON.stringify(emptyProgress()));
  const outcome = await reading;
  assert.equal(outcome.status, "imported");
  assert(outcome.progress.words["during-import"].saved, "File reads must resolve against current state");

  const descriptors = new Map(["localStorage", "navigator", "fetch", "window"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const setGlobal = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try {
    setGlobal("localStorage", storage);
    setGlobal("navigator", {});
    const browser = new BrowserProgressRepository();
    const damaged = JSON.stringify({ version: 1, words: { good: { saved: true, mastered: false }, bad: {} }, results: { bad: { total: 1, correct: 1, at: "bad" } } });
    values.set("akamonkai.progress.v1", damaged);
    const recovering = new ProgressService(browser, clock);
    const recovered = recovering.load();
    assert.equal(recovering.problem(), "corrupt");
    assert(recovered.words.good.saved && !Object.hasOwn(recovered.words, "bad"));
    assert.equal(browser.recovery(), damaged);
    const memoryOnly = await new ProgressCommandService(recovering).mark(recovered, "new", "saved");
    assert(!memoryOnly.persisted && memoryOnly.progress.words.new.saved);
    assert.equal(values.get("akamonkai.progress.v1"), damaged, "No lock support must not perform an unsafe write");
    setGlobal("navigator", { locks: { request: async (_, task) => task() } });
    const saved = await new ProgressCommandService(recovering).mark(recovered, "new", "saved");
    assert(saved.persisted);
    assert.equal(values.get("akamonkai.progress.recovery.v1"), damaged);
    assert(validateProgress(browser.read()));
    values.set("akamonkai.progress.v1", damaged);
    storage.setItem = (key, value) => { if (key.endsWith("recovery.v1")) throw Error("Quota exceeded"); values.set(key, value); };
    assert(!browser.write(emptyProgress()));
    assert.equal(values.get("akamonkai.progress.v1"), damaged, "A failed recovery backup must prevent destructive replacement");
    const listeners = new Set();
    setGlobal("window", { localStorage: storage, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) });
    let notifications = 0;
    const unsubscribe = browser.subscribe(() => notifications++);
    const notify = key => listeners.forEach(listener => listener({ storageArea: storage, key }));
    notify("unrelated"); notify("akamonkai.progress.v1"); notify(null);
    assert.equal(notifications, 2); unsubscribe(); assert.equal(listeners.size, 0);
    setGlobal("fetch", async (_, options) => { assert(options.signal); return { ok: true, json: async () => ({ loaded: true }) }; });
    assert.deepEqual(await readJson("/content/test.json", 10), { loaded: true });
    setGlobal("fetch", async () => ({ ok: false }));
    await assert.rejects(readJson("missing", 10), /could not be loaded/);
    let signal;
    setGlobal("fetch", (_, options) => { signal = options.signal; return new Promise(() => {}); });
    await assert.rejects(readJson("hanging", 5), /timed out/);
    assert(signal.aborted);
    setGlobal("fetch", async () => ({ ok: true, json: () => new Promise(() => {}) }));
    await assert.rejects(readJson("hanging-body", 5), /timed out/);

    const assessment = new AssessmentService(() => 0.25);
    const source = [{ id: "choice", prompt: [{ ja: "選択" }], options: [[{ ja: "一" }], [{ ja: "二" }]], accepted: [1] },
      { id: "text", prompt: [{ ja: "入力" }], acceptedText: ["答え"] }];
    const questions = assessment.start(source);
    const answers = Object.fromEntries(questions.map(q => [q.id, q.options ? q.accepted[0] : "答え"]));
    const state = { questions, answers, page: 1, wrongOnly: false };
    const serialized = captureDraft(source, state);
    const resumed = restoreDraft(source, structuredClone(serialized), 1);
    assert.deepEqual(resumed, state);
    assert.equal(assessment.grade(resumed.questions, resumed.answers).correct, 2);
    assert.equal(restoreDraft([...source].reverse(), serialized, 1), undefined, "Changed source must invalidate stale drafts");
    assert.equal(restoreDraft(source, { ...serialized, page: 99 }, 1), undefined);
    assert.equal(restoreDraft(source, { ...serialized, answers: { choice: 99 } }, 1), undefined);
    const tampered = structuredClone(serialized);
    tampered.order.find(q => q.options).options = [0, 0];
    assert.equal(restoreDraft(source, tampered, 1), undefined);
    const drafts = new Map();
    const draftService = new DraftService({ read: key => drafts.get(key), write: (key, value) => { drafts.set(key, value); return true; }, remove: key => drafts.delete(key) });
    await checkAssessmentHook({ source, assessment, draftService, drafts, load, setGlobal });
    await checkImportFeedback();
  } finally {
    for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
  console.log(JSON.stringify({ auditRegressions: "passed", multiPageWrites: "passed", importFreshnessAndConflictPolicy: "passed", recoveryAndStorageFailure: "passed", draftsAndRetryScores: "passed", malformedContentAndTimeouts: "passed" }));
}

async function checkImportFeedback() {
  const messages = [];
  let persisted = false;
  const context = { services: { progress: { recovery() {} }, progressTransfer: { import: async (_, current) => ({ status: "imported", progress: current() }) } }, currentProgress: () => ({ version: 1, words: {}, results: {} }), updateProgress: async () => persisted, setMessage: message => messages.push(message) };
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync("src/presentation/shell/use-progress-tools.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", compiled)(() => ({ useStudy: () => context }), module, module.exports);
  await module.exports.useProgressTools().importFile({});
  assert.equal(messages.at(-1), "ui.storageError", "Import success must not hide failure to persist");
  persisted = true;
  await module.exports.useProgressTools().importFile({});
  assert.equal(messages.at(-1), "ui.imported");
}

async function checkAssessmentHook({ source, assessment, draftService, drafts, load, setGlobal }) {
  const slots = [], effects = [];
  let cursor = 0, updates = 0, scroll;
  setGlobal("window", { scrollTo: value => { scroll = value; } });
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(factory) { return factory(); },
    useEffect(effect) { effects.push(effect); },
  };
  const session = { source: () => source, submit: () => ({ status: "submitted", progress: emptyTestProgress }) };
  const emptyTestProgress = { version: 1, words: {}, results: {} };
  const context = { services: { session, assessment, drafts: draftService }, setMessage() {}, updateProgress: async change => { updates++; change(emptyTestProgress); return true; } };
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync("src/modules/assessment/presentation/hooks/use-assessment.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", compiled)(specifier => {
    if (specifier === "react") return react;
    if (specifier.endsWith("/context")) return { useStudy: () => context };
    if (specifier.endsWith("/pagination")) return load("src/modules/assessment/presentation/data/pagination.ts");
    throw Error("Unexpected hook dependency: " + specifier);
  }, module, module.exports);
  const render = () => { cursor = 0; effects.length = 0; const hook = module.exports.useAssessment({ id: "unit" }, "grammar-test"); effects.splice(0).forEach(effect => effect()); return hook; };
  let hook = render();
  const answers = Object.fromEntries(hook.questions.map(q => [q.id, q.options ? q.accepted[0] === 0 ? 1 : 0 : "答え"]));
  hook.setAnswers(answers); hook = render();
  assert(drafts.get("unit:grammar-test").answers.choice !== undefined);
  await Promise.all([hook.submit(), hook.submit()]); hook = render();
  assert.equal(updates, 1, "Double-clicking submit records only once");
  assert(!drafts.has("unit:grammar-test"), "Submitted drafts must be cleared");
  hook.restart(true); hook = render();
  assert(hook.wrongOnly && hook.questions.length === 1);
  hook.setAnswers({ choice: hook.questions[0].accepted[0] }); hook = render();
  await hook.submit(); render();
  assert.equal(updates, 1, "Wrong-only practice must not replace the full assessment result");
  assert.equal(scroll.behavior, "auto", "JavaScript defers scrolling motion to the reduced-motion CSS rule");
}
