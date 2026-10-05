import assert from "node:assert/strict";

export async function checkStudyWorkflows({ load, catalog, units, ui }) {
  const { catalogLessons, findDestination, filterCatalog, adjacentLessons } = load("src/modules/curriculum/domain/catalog-queries.ts");
  const { isStudyView } = load("src/modules/curriculum/domain/catalog.ts");
  const { emptyProgress } = load("src/modules/learning-progress/domain/progress.ts");
  const { matchesWordFilter, assessmentIdentity } = load("src/modules/learning-progress/domain/progress-queries.ts");
  const { DashboardService } = load("src/application/dashboard.ts");
  const { AssessmentService } = load("src/modules/assessment/application/assessment-service.ts");
  const { ProgressService } = load("src/modules/learning-progress/application/progress-service.ts");
  const { ProgressCommandService } = load("src/modules/learning-progress/application/progress-commands.ts");
  const { ProgressTransferService } = load("src/modules/learning-progress/application/progress-transfer.ts");
  const { BrowserProgressFiles } = load("src/modules/learning-progress/infrastructure/browser-progress-files.ts");
  const { StudySessionService } = load("src/application/study-session.ts");
  const { VocabularyService } = load("src/modules/vocabulary/application/vocabulary-service.ts");
  const { LocalizationService } = load("src/modules/localization/application/localization-service.ts");
  const { VocabularyStudyService } = load("src/application/vocabulary-study.ts");
  const { decodeCatalog, decodeLesson } = load("src/modules/curriculum/infrastructure/content-mapper.ts");
  const { roleVoiceKey } = load("src/modules/speech/domain/roles.ts");
  const { grammarViewModel } = load("src/modules/grammar/presentation/grammar-view-model.ts");
  const { normalizeAnswer, grade } = load("src/modules/assessment/domain/assessment.ts");

  assert(isStudyView("words")); assert(!isStudyView("toString")); assert(!isStudyView(null));
  assert.deepEqual(filterCatalog(catalog, "all", "  "), catalog.books);
  assert.deepEqual(filterCatalog(catalog, "missing", ""), []);
  assert.deepEqual(filterCatalog(catalog, "all", "no-matching-unit-title"), []);
  assert.deepEqual(filterCatalog(catalog, "all", "TOPIC"), filterCatalog(catalog, "all", " topic "));
  const book = catalog.books[0];
  const first = book.units[0], second = book.units[1];
  assert.deepEqual(adjacentLessons(book, first.id, "words").map(x => x.unit.id), [second.id]);
  const edgeBook = { ...book, units: [first, { ...second, views: ["grammar"] }] };
  assert.equal(adjacentLessons(edgeBook, first.id, "words")[0].view, "grammar");
  assert.equal(adjacentLessons(book, book.units.at(-1).id, "words").length, 1);
  assert.equal(assessmentIdentity("unit:part", "words"), "unit:part:words");
  assert(matchesWordFilter(emptyProgress(), "missing", "all"));
  assert(!matchesWordFilter(emptyProgress(), "missing", "saved"));
  const discoveryCalls = [];
  const dashboard = new DashboardService({ lessons: catalogLessons, destination: findDestination, adjacent: adjacentLessons,
    search: (...args) => { discoveryCalls.push(args); return filterCatalog(...args); } });
  const state = { ...emptyProgress(), words: { w: { saved: true, mastered: false }, x: { saved: false, mastered: true } },
    lastVisited: { unitId: second.id, view: second.views[0], at: "2026-01-01T00:00:00Z" },
    results: {
      "removed:grammar-test": { correct: 1, total: 1, at: "2026-02-03T00:00:00Z" },
      [assessmentIdentity(second.id, second.views[0])]: { correct: 1, total: 2, at: "2026-02-02T00:00:00Z" },
      [assessmentIdentity(first.id, first.views[0])]: { correct: 2, total: 2, at: "2026-02-01T00:00:00Z" },
    } };
  const overview = dashboard.overview(catalog, state, "all", "", 1);
  assert(overview.resuming); assert.equal(overview.active.unit.id, second.id);
  assert.deepEqual(overview.summary, { saved: 1, mastered: 1, tests: 3 });
  assert.equal(overview.recent[0].unit.id, second.id, "Discard stale routes before applying display limit");
  const obsolete = dashboard.overview(catalog, { ...state, lastVisited: { ...state.lastVisited, view: "unavailable" } }, "all", "", 5);
  assert(!obsolete.resuming); assert.equal(obsolete.active.unit.id, first.id);
  assert.equal(dashboard.overview({ ...catalog, books: [] }, emptyProgress(), "all", "", 5).active, undefined);
  assert.equal(dashboard.overview(catalog, state, "missing", "", 5).visible.length, 0);
  assert.equal(discoveryCalls.at(-1)[1], "missing", "Application delegates catalog filtering through the injected query interface");

  let writes = 0, persisted = true;
  const progress = new ProgressService({ read: () => null, write: () => { writes++; return persisted; } }, { now: () => "2026-01-02T00:00:00Z" });
  const commands = new ProgressCommandService(progress);
  const marked = await commands.mark(emptyProgress(), "w", "saved");
  assert(marked.persisted); assert.equal(writes, 1); assert(marked.progress.words.w.saved);
  persisted = false;
  const unsaved = await commands.mark(marked.progress, "w", "mastered");
  assert(!unsaved.persisted); assert(unsaved.progress.words.w.mastered, "Storage failure must preserve in-memory state");
  const visited = await commands.remember(emptyProgress(), first.id, first.views[0]);
  const beforeWrites = writes;
  assert.equal(await commands.remember(visited.progress, first.id, first.views[0]), undefined);
  assert.equal(writes, beforeWrites, "Remembering the same destination must not save again");

  const assessment = new AssessmentService(() => 0.25);
  const sample = units.find(unit => unit.questions.length && unit.words.length);
  const session = new StudySessionService(assessment, progress);
  const questions = session.start(sample, "grammar-test");
  assert.deepEqual(session.submit(questions, {}, emptyProgress(), sample.id, "grammar-test"), { status: "incomplete" });
  assert.equal(writes, beforeWrites);
  const answers = Object.fromEntries(questions.map(question => [question.id, question.options ? question.accepted[0] : question.acceptedText[0]]));
  const submitted = session.submit(questions, answers, emptyProgress(), sample.id, "grammar-test");
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.progress.results[sample.id + ":grammar-test"].correct, questions.length);
  assert.equal(writes, beforeWrites, "The caller explicitly commits returned state through ProgressCommands");
  assert.deepEqual(session.submit([], {}, emptyProgress(), sample.id, "grammar-test"), { status: "incomplete" });
  assert.throws(() => new StudySessionService(assessment, { ...progress, record: () => { throw Error("record failed"); } })
    .submit(questions, answers, emptyProgress(), sample.id, "grammar-test"), /record failed/);
  let meaningLocale;
  const startSpy = new StudySessionService({ ...assessment, vocabulary: (words, meaning) => { meaningLocale = meaning(words[0].meaningId); return []; }, start: value => value }, progress);
  startSpy.start(sample, "word-test");
  assert.equal(meaningLocale, sample.texts[sample.words[0].meaningId].zh);
  assert.equal(normalizeAnswer("　カ タ カ ナ　"), "かたかな");
  assert.equal(grade([{ id: "q", prompt: [{ ja: "?" }], acceptedText: ["かたかな"] }], { q: "ｶﾀｶﾅ" }).correct, 1);
  assert.equal(grade([{ id: "q", prompt: [{ ja: "?" }], acceptedText: ["a"] }], { q: "  " }).complete, false);

  const localization = new LocalizationService({ read: () => "zh", write: () => {} }, ui);
  const wordStudy = new VocabularyStudyService(new VocabularyService(), localization);
  const word = sample.words[0], wordProgress = progress.mark(emptyProgress(), word.progressId ?? word.id, "saved");
  assert.deepEqual(wordStudy.search(sample, wordProgress, "en", "", "saved"), [word]);
  assert.equal(wordStudy.search(sample, wordProgress, "zh", "", "mastered").length, 0);
  assert(wordStudy.search(sample, wordProgress, "en", sample.texts[word.meaningId].en, "saved").some(item => item.id === word.id));

  let reads = 0, bytes = 2e6, serialized = progress.export(wordProgress), exported;
  const files = { size: () => bytes, read: async () => { reads++; return serialized; }, download: value => { exported = value; } };
  const transfer = new ProgressTransferService(progress, files);
  transfer.export(wordProgress); assert.equal(exported, serialized);
  assert.equal((await transfer.import({}, emptyProgress())).status, "imported");
  bytes++; assert.deepEqual(await transfer.import({}, emptyProgress()), { status: "invalid-file" });
  assert.equal(reads, 1, "Oversized files must not be read");
  bytes = 0; serialized = "{bad";
  assert.equal((await transfer.import({}, emptyProgress())).status, "invalid-file");
  const failing = new ProgressTransferService(progress, { ...files, read: async () => { throw Error("read failed"); } });
  assert.equal((await failing.import({}, emptyProgress())).status, "invalid-file");
  serialized = JSON.stringify({ ...wordProgress, version: 99 });
  assert.equal((await transfer.import({}, emptyProgress())).status, "invalid-file");

  // Exercise browser file mapping and URL cleanup independently of browser download automation.
  const originalFile = Object.getOwnPropertyDescriptor(globalThis, "File");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const fileEvents = [];
  let clickedLink, clickFails = false;
  class SelectedFile { constructor(size, content) { this.size = size; this.content = content; } async text() { return this.content; } }
  try {
    Object.defineProperty(globalThis, "File", { configurable: true, value: SelectedFile });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: tag => {
      assert.equal(tag, "a");
      return clickedLink = { click: () => { fileEvents.push("click"); if (clickFails) throw Error("blocked download"); } };
    } } });
    URL.createObjectURL = blob => { assert.equal(blob.type, "application/json"); fileEvents.push("create"); return "blob:progress"; };
    URL.revokeObjectURL = url => { assert.equal(url, "blob:progress"); fileEvents.push("revoke"); };
    const adapter = new BrowserProgressFiles();
    const handle = new SelectedFile(25, "progress content");
    assert.equal(adapter.size(handle), 25); assert.equal(await adapter.read(handle), "progress content");
    assert.throws(() => adapter.size({ size: 25 }), /Invalid progress file/);
    adapter.download("{}");
    assert.equal(clickedLink.href, "blob:progress"); assert.equal(clickedLink.download, "akamonkai-progress.json");
    assert.deepEqual(fileEvents, ["create", "click", "revoke"]);
    fileEvents.length = 0; clickFails = true;
    assert.throws(() => adapter.download("{}"), /blocked download/);
    assert.deepEqual(fileEvents, ["create", "click", "revoke"], "Failed download must still release the URL");
  } finally {
    if (originalFile) Object.defineProperty(globalThis, "File", originalFile); else delete globalThis.File;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else delete globalThis.document;
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }

  const catalogDto = structuredClone(catalog); catalogDto.transportOnly = true;
  catalogDto.books[0].units[0].transportOnly = true;
  const mapped = decodeCatalog(catalogDto);
  assert(!("transportOnly" in mapped)); assert(!("transportOnly" in mapped.books[0].units[0]));
  catalogDto.books[0].units[0].views.length = 0;
  assert(mapped.books[0].units[0].views.length > 0, "DTO mutation must not change a model");
  const dto = structuredClone(sample); dto.words[0].transportOnly = true;
  dto.texts[word.meaningId].extraLocale = "unused";
  const lesson = decodeLesson(dto, dto.id);
  assert(!("transportOnly" in lesson.words[0]));
  dto.words[0].wordJa = "changed"; dto.texts[word.meaningId].zh = "changed";
  assert.equal(lesson.words[0].wordJa, word.wordJa); assert.equal(lesson.texts[word.meaningId].zh, sample.texts[word.meaningId].zh);
  assert.deepEqual(Object.keys(lesson.texts[word.meaningId]).sort(), ["en", "zh"]);

  assert.equal(roleVoiceKey("a", "我"), roleVoiceKey("b", "Me"));
  assert.notEqual(roleVoiceKey("a", "A"), roleVoiceKey("b", "A"));
  const nested = [{ id: "a", titleJa: "a", paragraphIds: [], examples: [{ ja: "A：はい B：いいえ" }],
    children: [{ id: "b", titleJa: "b", paragraphIds: [], examples: [{ ja: "私：そうです" }], children: [] }] }];
  const grammar = grammarViewModel(nested, "lesson");
  assert.deepEqual(grammar.lines.map(line => line.text), ["はい", "いいえ", "そうです"]);
  assert.deepEqual(grammar.roles, ["我", "A", "B", "私"]);
  assert.equal(grammar.articles[0].examples[0].lines.length, 2);
  assert(!("lines" in nested[0].examples[0]), "View-model mapping must not mutate content");
  console.log(JSON.stringify({ studyWorkflows: "passed", dashboardFallbackAndFiltering: "passed", submissionGuardAndPorts: "passed", transferFailuresAndSizeLimit: "passed", browserFileAdapterAndCleanup: "passed", dtoIsolation: "passed" }));
}
