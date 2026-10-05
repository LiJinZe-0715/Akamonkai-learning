import assert from "node:assert/strict";

/** Contract tests use injected ports, so neither a browser nor network is required. */
export async function checkDdd({ load, catalog, units, ui }) {
  const { CurriculumService } = load("src/modules/curriculum/application/curriculum-service.ts");
  const { HttpCurriculumRepository } = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
  const { decodeCatalog, decodeLesson } = load("src/modules/curriculum/infrastructure/content-mapper.ts");
  const { HttpUiCatalog } = load("src/modules/localization/infrastructure/http-ui-catalog.ts");
  const { ProgressService } = load("src/modules/learning-progress/application/progress-service.ts");
  const { emptyProgress } = load("src/modules/learning-progress/domain/progress.ts");
  assert.deepEqual(decodeCatalog(structuredClone(catalog)), catalog);
  for (const u of units) assert.deepEqual(decodeLesson(structuredClone(u), u.id), u);
  const broken = structuredClone(units.find(u => u.words.length));
  delete broken.texts[broken.words[0].meaningId];
  assert.throws(() => decodeLesson(broken, broken.id), /missing translation/);
  assert.throws(() => decodeLesson(units[0], "wrong-id"), /identity mismatch/);
  assert.throws(() => decodeCatalog({ ...catalog, schemaVersion: 99 }), /schema/);
  const duplicate = structuredClone(catalog);
  duplicate.books[0].units.push(duplicate.books[0].units[0]);
  assert.throws(() => decodeCatalog(duplicate), /duplicate unit/);
  let catalogReads = 0, lessonReads = 0;
  const sample = units.find(u => u.id === "minna-1");
  const repo = new HttpCurriculumRepository(async path => {
    if (path === "/content/catalog.json") { catalogReads++; return structuredClone(catalog); }
    lessonReads++;
    if (lessonReads === 1) throw new Error("Temporary outage");
    return structuredClone(sample);
  });
  await Promise.all([repo.catalog(), repo.catalog()]);
  assert.equal(catalogReads, 1, "Concurrent catalog requests must coalesce");
  await assert.rejects(repo.lesson(sample.id), /outage/);
  const [a, b] = await Promise.all([repo.lesson(sample.id), repo.lesson(sample.id)]);
  assert.equal(a, b); assert.equal(lessonReads, 2, "Failed reads must be retriable and deduplicated");
  await assert.rejects(repo.lesson("../private"), /Invalid lesson ID/);
  const service = new CurriculumService(repo);
  assert.equal(service.resolve(catalog, null, null), null);
  assert.throws(() => service.resolve(catalog, "missing", "words"), /Unavailable/);
  await assert.rejects(service.lesson("day2-wake", "words"), /Unavailable/);
  assert.equal(lessonReads, 2, "Unavailable views must fail before reading a lesson");
  let badCatalogReads = 0;
  const recovered = new HttpCurriculumRepository(async () => ++badCatalogReads === 1 ? {} : catalog);
  await assert.rejects(recovered.catalog(), /schema/);
  assert.deepEqual(await recovered.catalog(), catalog);
  let uiReads = 0;
  const translations = new HttpUiCatalog(async () => { uiReads++; return uiReads === 1 ? { broken: { zh: "中文" } } : ui; });
  await assert.rejects(translations.load(), /translation/);
  assert.deepEqual(await translations.load(), ui);
  let stored = null;
  const progress = new ProgressService({ read: () => stored, write: p => { stored = p; return true; } }, { now: () => "2026-09-21T01:02:03.000Z" });
  const before = emptyProgress();
  const marked = progress.mark(before, "word.1", "saved");
  assert.deepEqual(before, emptyProgress(), "Aggregate commands must not mutate old state");
  const recorded = progress.record(marked, "minna-1:grammar-test", 5, 6);
  assert.equal(recorded.results["minna-1:grammar-test"].at, "2026-09-21T01:02:03.000Z");
  assert.throws(() => progress.record(before, "x", 7, 6), /Invalid assessment/);
  assert.throws(() => progress.record(before, "x", 0, 0), /Invalid assessment/);
  assert.throws(() => progress.record(before, "x", -1, 6), /Invalid assessment/);
  progress.save(recorded);
  assert.deepEqual(progress.import(progress.export(recorded), before), recorded);
  assert.deepEqual(progress.load(), recorded);
  console.log(JSON.stringify({ dddContracts: "passed", dataDecoders: units.length, retryAndRequestCoalescing: "passed", immutableProgressAndClock: "passed" }));
}
