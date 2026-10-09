import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import ts from "@typescript/typescript6";
import { createRequire } from "node:module";
import { compileUnits } from "./content-library.mjs";
const files = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? files(dir + "/" + e.name) : [dir + "/" + e.name],
    );
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const catalog = read("data/content/catalog.json");
const units = compileUnits();
assert.equal(new Set(units.map((u) => u.id)).size, units.length);
const verbReference = read("data/content/reference/verbs.json");
assert.deepEqual(units.find((u) => u.id === "verbs"), verbReference);
assert(!fs.existsSync("data/content/units/verbs.json"), "Reference must not use the textbook compiler");
const referenceTextIds = new Set(Object.keys(verbReference.texts));
for (const unit of units.filter((u) => u.id !== "verbs")) {
  assert(Object.keys(unit.texts).every((id) => !referenceTextIds.has(id)),
    "Textbook shares reference text IDs: " + unit.id);
  const articleIds = new Set();
  const checkArticles = (articles) => articles.forEach((article) => {
    assert(!article.id.startsWith("verb-"), "Repeated reference appendix in " + unit.id);
    assert(!articleIds.has(article.id), "Duplicate article in " + unit.id + ": " + article.id);
    articleIds.add(article.id);
    checkArticles(article.children);
  });
  checkArticles(unit.articles);
  assert(!Object.keys(unit.texts).some(id => id.startsWith("curriculum.conjugation.")),
    "Obsolete generic conjugation data in " + unit.id);
}
let references = 0,
  questions = 0,
  words = 0;
const allIds = new Set();
for (const unit of units) {
  const descriptor = catalog.books
    .find((b) => b.id === unit.bookId)
    ?.units.find((u) => u.id === unit.id);
  assert(descriptor, "Unlisted unit " + unit.id);
  const check = (id) => {
    assert(
      unit.texts[id] &&
        typeof unit.texts[id].zh === "string" &&
        typeof unit.texts[id].en === "string",
      "Missing text " + id + " in " + unit.id,
    );
    if (unit.texts[id].zh.trim())
      assert(unit.texts[id].en.trim(), "Missing English " + id);
    references++;
  };
  function walk(value, key = "") {
    if (!value) return;
    if (
      typeof value === "string" &&
      (key === "textId" || (key.endsWith("Id") && !["bookId", "progressId"].includes(key)))
    )
      check(value);
    else if (key === "paragraphIds") value.forEach(check);
    else if (Array.isArray(value)) value.forEach((x) => walk(x));
    else if (typeof value === "object")
      for (const [k, v] of Object.entries(value)) if (k !== "texts") walk(v, k);
  }
  walk(unit);
  for (const word of unit.words) {
    assert(word.wordJa && word.readingJa);
    assert(!/[ァ-ヶ]/.test(word.readingJa), "Non-hiragana reading " + word.id);
    words++;
  }
  for (const q of unit.questions) {
    assert(!allIds.has(q.id), "Duplicate question " + q.id);
    allIds.add(q.id);
    questions++;
    assert(q.prompt.length);
    for (const s of q.prompt) assert(Boolean(s.ja) !== Boolean(s.textId));
    if (q.options) {
      assert(q.options.length >= 2);
      assert(q.accepted.length > 0);
      for (const i of q.accepted) assert(Number.isInteger(i) && q.options[i]);
    } else
      assert(
        q.acceptedText.length &&
          q.acceptedText.every((x) => typeof x === "string" && x.trim()),
      );
  }
  assert.equal(descriptor.wordCount, unit.words.length);
  assert.equal(descriptor.questionCount, unit.questions.length);
}
assert.equal(catalog.books.find((b) => b.id === "minna").units.filter(u => u.id.startsWith("minna-")).length, 50);
assert(
  units
    .find((u) => u.id === "topic-6-reading")
    .articles.some((a) => a.examples.length),
);
assert(units.find((u) => u.id === "verbs").articles.length === 21);
const graph = new Map();
for (const file of files("src").filter((f) => /\.tsx?$/.test(f))) {
  const code = fs.readFileSync(file, "utf8"),
    ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  assert(
    !/localStorage|sessionStorage/.test(code) ||
      file.includes("/infrastructure/"),
    "Storage leaked: " + file,
  );
  assert(
    !/\bfetch\(/.test(code) || file.includes("/infrastructure/"),
    "Network leaked: " + file,
  );
  if (file.includes("/domain/"))
    assert(
      !/react|document\.|window\.|localStorage|fetch\(/.test(code),
      "Domain impurity: " + file,
    );
  if (file.includes("/presentation/"))
    assert(!/createObjectURL|revokeObjectURL|new Blob\(|\.text\(\)/.test(code), "File adapter leaked into UI: " + file);
  if (file.includes("/application/"))
    assert(!/document\.|window\.|new Blob\(|createObjectURL|localStorage|sessionStorage|\bfetch\(/.test(code), "Browser dependency in application: " + file);
  const edges = [];
  for (const statement of ast.statements) {
    if (
      !(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
    )
      continue;
    const spec = statement.moduleSpecifier?.text;
    if (!spec) continue;
    assert(!spec.endsWith(".json") && !spec.includes("/content/"), "Bundled content import: " + file);
    const typeOnly = statement.isTypeOnly || statement.importClause?.isTypeOnly;
    if (!spec.startsWith(".")) {
      if (file.includes("/domain/") || file.includes("/application/"))
        assert(!/react|next|vite/.test(spec), "Framework dependency: " + file);
      continue;
    }
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), spec),
    );
    assert(!target.startsWith("data/"), "Source dataset import: " + file);
    if (target.includes("/presentation/data/"))
      assert(file.includes("/presentation/") || (file === "src/modules/curriculum/public.ts" && target === "src/modules/curriculum/presentation/data/views"), "UI configuration leaked inward: " + file);
    if (target.includes("/infrastructure/")) {
      assert(file.includes("/infrastructure/") || file.startsWith("src/bootstrap/"), "Infrastructure bypass: " + file);
    }
    if (file.endsWith("/public.ts")) assert(typeOnly || target.includes("/domain/") || (file === "src/modules/curriculum/public.ts" && target === "src/modules/curriculum/presentation/data/views"), "Concrete service leaked through public API: " + file);
    const module = file.match(/^src\/modules\/([^/]+)\//)?.[1],
      targetModule = target.match(/^src\/modules\/([^/]+)\//)?.[1];
    if (module && targetModule && module !== targetModule)
      assert(
        target.endsWith("/public") || (file.includes("/presentation/") && target.endsWith("/presentation/index")),
        "Private module import: " + file + " -> " + target,
      );
    if (file.includes("/domain/"))
      assert(
        target.startsWith("src/shared/kernel/") ||
          target.startsWith("src/modules/" + module + "/domain/"),
        "Domain dependency: " + file,
      );
    if (file.includes("/application/"))
      assert(
        !target.includes("/infrastructure/") &&
          !target.includes("/presentation/"),
        "Application dependency: " + file,
      );
    if (file.includes("/presentation/")) {
      assert(
        !target.includes("/infrastructure/") && !target.startsWith("data/content/"),
        "Presentation bypass: " + file,
      );
      if (targetModule && targetModule !== module)
        assert(
          target.endsWith("/public") || target.endsWith("/presentation/index"),
          "Presentation imports module internals: " + file,
        );
    }
    // Include type-only edges too: architectural cycles remain cycles even when erased at runtime.
    {
      const full = [
        target,
        target + ".ts",
        target + ".tsx",
        target + ".json",
      ].find(fs.existsSync);
      if (full) edges.push(full);
    }
  }
  graph.set(file, edges);
}
for (const file of graph.keys()) {
  const visit = (f, seen) => {
    for (const next of graph.get(f) ?? []) {
      assert(next !== file, "Cycle " + file);
      if (!seen.has(next)) {
        seen.add(next);
        visit(next, seen);
      }
    }
  };
  visit(file, new Set());
}
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  if (file.endsWith(".json")) return read(file);
  const m = { exports: {} };
  cache.set(file, m);
  const req = createRequire(file);
  const local = (spec) => {
    if (!spec.startsWith(".")) return req(spec);
    const base = path.resolve(path.dirname(file), spec);
    return load(
      [base, base + ".ts", base + ".tsx", base + ".json"].find(fs.existsSync),
    );
  };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", js)(local, m, m.exports);
  return m.exports;
}
const { AssessmentService } = load("src/modules/assessment/application/assessment-service.ts"),
  assessment = new AssessmentService();
for (const unit of units) {
  const prepared = assessment.start(unit.questions),
    answers = {};
  for (const q of prepared)
    answers[q.id] = q.options ? q.accepted[0] : q.acceptedText[0];
  const result = assessment.grade(prepared, answers);
  assert.equal(result.correct, prepared.length);
  assert(result.complete);
  assert.equal(assessment.retry(prepared, answers).length, 0);
  for (const q of prepared.filter((q) => q.options))
    for (const accepted of q.accepted)
      assert(assessment.correct(q, accepted), "Lost accepted alternate");
  const wordQs = assessment.vocabulary(unit.words, (id) => unit.texts[id].zh, (id) => unit.texts[id].en);
  for (const q of wordQs) {
    for (const locale of ["zh", "en"]) {
      const labels = q.options.map((o) => unit.texts[o[0].textId][locale].trim().toLowerCase());
      assert.equal(new Set(labels).size, labels.length, "Duplicate " + locale + " choices in " + q.id);
    }
  }
}
const { ProgressService } = load("src/modules/learning-progress/application/progress-service.ts");
let saved = null;
const progress = new ProgressService({
  read: () => saved,
  write: (p) => {
    saved = p;
    return true;
  },
}, { now: () => "2026-09-21T00:00:00.000Z" });
let state = progress.load();
state = progress.mark(state, "word.1", "saved");
state = progress.record(state, "minna-1:grammar-test", 5, 6);
progress.save(state);
assert.deepEqual(progress.load(), state);
assert.deepEqual(
  progress.import(progress.export(state), progress.load()),
  state,
);
assert.throws(() =>
  progress.import('{"version":1,"words":[],"results":{}}', state),
);
assert.throws(() => progress.import("{bad", state));
// Resume state remains compatible with existing version 1 exports and merges by time.
const visited = progress.visit(state, "minna-3", "words");
progress.save(visited);
assert.deepEqual(progress.load(), visited);
assert.deepEqual(progress.import(progress.export(visited), state), visited);
assert.deepEqual(progress.import(progress.export(state), visited), visited);
const newerVisit = { ...visited, lastVisited: { unitId: "minna-4", view: "grammar", at: "2026-09-22T00:00:00.000Z" } };
assert.deepEqual(progress.import(progress.export(visited), newerVisit).lastVisited, newerVisit.lastVisited);
assert.deepEqual(progress.import(progress.export(newerVisit), visited).lastVisited, newerVisit.lastVisited);
assert.throws(() => progress.visit(state, "", "words"));
assert.throws(() => progress.import(JSON.stringify({ ...state, lastVisited: { unitId: "minna-1", view: "words", at: "invalid" } }), state));
const { LocalizationService } = load("src/modules/localization/application/localization-service.ts"),
  ui = read("data/content/localization/ui.json");
const loc = new LocalizationService({ read: () => "zh", write: () => {} }, ui);
for (const unit of units) {
  for (const locale of ["zh", "en"])
    for (const [id, value] of Object.entries(unit.texts))
      assert.equal(loc.text(unit.texts, id, locale), value[locale]);
}
const target = units.find((u) => u.id === "minna-21");
const id = "minna.lesson.21.grammar.1.meaning";
const en = loc.text(target.texts, id, "en");
const title = target.titleJa;
target.texts[id].zh = "修订后的中文";
assert.equal(loc.text(target.texts, id, "en"), en);
assert.equal(target.titleJa, title);
console.log(
  JSON.stringify({
    units: units.length,
    vocabularyRows: words,
    fixedQuestions: questions,
    textReferences: references,
    moduleBoundaries: "passed",
    gradingAndAlternateAnswers: "passed",
    progressRoundTrip: "passed",
    languageIsolation: "passed",
  }),
);
const React=createRequire(import.meta.url)('react');
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server');
const {StudyProvider}=load('src/presentation/context.tsx');
const {createServices}=load('src/bootstrap/client.ts');
const {IndexScreen}=load('src/presentation/screens/IndexScreen.tsx');
const {VocabularyScreen}=load('src/presentation/screens/VocabularyScreen.tsx');
const {GrammarScreen}=load('src/presentation/screens/GrammarScreen.tsx');
const {AssessmentScreen}=load('src/presentation/screens/AssessmentScreen.tsx');
function render(component,props,locale){const services=createServices(ui);services.localization.current=()=>locale;return renderToStaticMarkup(React.createElement(StudyProvider,{services},React.createElement(component,props)));}
const {SpeechControls}=load('src/presentation/components/SpeechControls.tsx');
assert(render(SpeechControls,{},'zh').includes('设备声音'), 'Speech settings must render without browser globals');
const zhIndex=render(IndexScreen,{catalog},'zh'),enIndex=render(IndexScreen,{catalog},'en');
for (const [locale, html] of [['zh', zhIndex], ['en', enIndex]]) {
  const groups = [...html.matchAll(/<section class="library-level" aria-labelledby="level-([^"]+)">([\s\S]*?)<\/section>/g)];
  assert.deepEqual(groups.map(match => match[1]), ['beginner', 'intermediate']);
  assert(groups[0][2].includes(ui['ui.levelBeginner'][locale]));
  assert(groups[1][2].includes(ui['ui.levelIntermediate'][locale]));
  for (const book of catalog.books) {
    const groupIndex = ['minna', 'kanji-daily', 'topic'].includes(book.id) ? 0 : 1;
    assert(groups[groupIndex][2].includes(book.titleJa), 'Book in wrong level: ' + book.id);
    assert(!groups[1 - groupIndex][2].includes(book.titleJa), 'Book duplicated across levels: ' + book.id);
  }
}
const links=html=>[...html.matchAll(/href="(\?unit=[^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
assert.deepEqual(links(zhIndex),links(enIndex));
const expected=catalog.books.flatMap(b=>b.units.flatMap(u=>u.views.map(v=>'?unit='+u.id+'&view='+v)));
assert.deepEqual([...links(zhIndex)].sort(),expected.sort(),'Missing or duplicate index route');
let renderedViews=0;
for(const unit of compileUnits()){
 const descriptor=catalog.books.flatMap(b=>b.units).find(d=>d.id===unit.id);
 for(const view of descriptor.views){const component=view==='words'?VocabularyScreen:['grammar','kanji'].includes(view)?GrammarScreen:AssessmentScreen;
 for(const locale of ['zh','en']){const html=render(component,{lesson:unit,view},locale);assert(!html.includes('Unknown text ID'));if(view==='words'){
   assert.equal((html.match(/class="word-headword"/g)||[]).length,unit.words.length);
   assert.equal((html.match(/class="word-note"/g)||[]).length,unit.words.filter(w=>w.noteId&&unit.texts[w.noteId][locale].trim()).length,'Empty notes must not expose an empty toggle');
 }}
 renderedViews++;
 }
}
console.log(JSON.stringify({indexRoutes:links(zhIndex).length,renderedViews,bothLanguages:'passed'}));

const { checkDdd } = await import('./check-ddd.mjs');
await checkDdd({ load, catalog, units: compileUnits(), ui });
await import('./check-content-review.mjs');
const { checkSpeech } = await import('./check-speech.mjs');
await checkSpeech({ load });
const { checkStudyWorkflows } = await import('./check-study-workflows.mjs');
await checkStudyWorkflows({ load, catalog, units: compileUnits(), ui });
const { checkAuditFixes } = await import('./check-audit-fixes.mjs');
await checkAuditFixes({ load, units: compileUnits(), ui });
