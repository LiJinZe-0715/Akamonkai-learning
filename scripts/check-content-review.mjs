import assert from 'node:assert/strict';
import { compileUnits } from './content-library.mjs';

const units = compileUnits();
const n2 = units.filter(unit => unit.bookId === 'n2');
const reviewed = n2.flatMap(unit => unit.questions)
  .filter(question => question.prompt.some(segment => segment.textId?.endsWith('.review-instruction')));
assert.equal(reviewed.length, 61, 'Reviewed N2 questions lost their explicit scoring instructions');
assert.equal(reviewed.filter(question => question.accepted.length > 1).length, 9);
const fake = reviewed.find(question => question.id === 'n2.day14-judgment.question.6');
assert.deepEqual(fake.accepted.map(i => fake.options[i][0].ja), ['に決まっている'],
  'Risk and inference must not score as emphatic subjective certainty');
const comparison = reviewed.find(question => question.id === 'n2.day8-gyakusetsu.question.8');
assert.deepEqual(comparison.accepted.map(i => comparison.options[i][0].ja), ['わりに', 'にしては']);

let examples = 0;
for (const unit of units.filter(unit => unit.id.startsWith('kanji-new-'))) {
  for (const article of unit.articles) {
    const sentence = article.examples.find(example => example.translationId === article.id + '.supplement.example.translation');
    assert(sentence?.ja.includes(article.titleJa), 'Missing contextual example: ' + article.id);
    assert(/\[[^:\]]+:[^\]]+\]/u.test(sentence.ja), 'Missing reading: ' + article.id);
    assert(unit.texts[sentence.translationId].zh && unit.texts[sentence.translationId].en);
    examples++;
  }
}
assert.equal(examples, 140);
let readingQuestions = 0;
for (const n of [3, 4, 5, 6]) {
  const unit = units.find(unit => unit.id === 'topic-' + n + '-reading');
  const passage = unit.articles.find(article => article.id.endsWith('.supplement'));
  assert(passage.titleJa.includes('オリジナル'));
  const questions = unit.questions.filter(question => question.id.includes('.supplement.question.'));
  assert.equal(questions.length, 4);
  for (const question of questions) {
    assert(question.prompt[0].ja.startsWith(passage.examples[0].ja), 'Question must include its evidence passage');
    assert.equal(question.accepted.length, 1);
    assert(unit.texts[question.explanationId].zh && unit.texts[question.explanationId].en);
    readingQuestions++;
  }
}
for (const unit of units) for (const text of Object.values(unit.texts)) {
  assert(!/Egypt Protests|Oh my God|I don't know what I'm talking about|West Pilo|red gorillas|Great Kandong|\bFrom verb\.|\bhe verb\./i.test(text.en),
    'Known translation contamination returned in ' + unit.id);
}
console.log(JSON.stringify({reviewedN2: reviewed.length, naturalMultipleAnswers: 9, contextualKanjiExamples: examples, supplementaryReadingQuestions: readingQuestions}));
