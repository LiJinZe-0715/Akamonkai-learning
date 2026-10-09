import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileUnits } from './content-library.mjs';

const units = compileUnits();
const learningTexts = JSON.parse(fs.readFileSync('data/content/localization/learning.json', 'utf8'));
let protectedJapaneseReferences = 0;
for (const [id, text] of Object.entries(learningTexts)) {
  const wordExample = id.endsWith('.note') && id.includes('.word.')
    ? text.zh.match(/^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々0-9]+)[：:]/u)?.[1]
    : undefined;
  if (wordExample && /[ぁ-んァ-ヶ]/u.test(wordExample)) {
    assert(text.en.includes(wordExample), 'English changed a vocabulary example: ' + id + ': ' + wordExample);
    protectedJapaneseReferences++;
  }
  // Glosses and passage summaries may translate or paraphrase their examples.
  if (id.endsWith('.meaning') || id.includes('.supplement.') || text.en.startsWith('Target expression:')) continue;
  for (const [, literal] of text.zh.matchAll(/「([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+)」/gu)) {
    if (!/[ぁ-んァ-ヶ]/u.test(literal) || /[词汉语]|形$/u.test(literal)) continue;
    assert(text.en.includes(literal), 'English changed a quoted Japanese reference: ' + id + ': ' + literal);
    protectedJapaneseReferences++;
  }
}
// Unquoted examples need protection too, especially suru compounds and conjugation chains.
const protectedExamples = {
  'chukyu.question.l5-g8.explanation': ['勉強する'],
  'chukyu.word.2753.note': ['習慣が定着する'],
  'chukyu.word.2849.note': ['寝食を共にする'],
  'chukyu.word.2985.note': ['第一印象を左右する'],
  'chukyu.word.2296.note': ['手に入れる'],
  'chukyu.word.2166.note': ['目を合わせる'],
  'chukyu.lesson.7.exerciseInstructions': ['共にする', '与える'],
  'minna.question.42-1.explanation': ['留学する'],
  'minna.lesson.50.grammar.1.note': ['伺う', '拝見する'],
  'minna.lesson.50.grammar.3.note': ['ご案内します', 'ご説明します'],
  'minna.question.44-2.explanation': ['書きます→書きやすい'],
  'minna.question.32-5.translation': ['飲む'],
  'n2.day14-judgment.grammar.3.contrast': ['に違いない', 'に決まっている'],
  'n2.day13-tendency.question.5.explanation': ['子供'],
  'topic.5.5-1.example.0.analysis': ['誘う→誘われる→誘われた', '鈴木君に'],
  'topic.5.5-1.grammar.3.join': ['残る→残っている', '残す→残してある'],
  'topic.6.6-1.example.1.analysis': ['コピーする→コピーさせる'],
  'topic.4.reading.question.4.reason': ['勉強する→勉強せずに'],
};
for (const [id, literals] of Object.entries(protectedExamples)) {
  for (const literal of literals) {
    assert(learningTexts[id]?.en.includes(literal), 'English changed a Japanese example: ' + id + ': ' + literal);
    protectedJapaneseReferences++;
  }
}
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
assert.equal(examples, 160);
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
console.log(JSON.stringify({reviewedN2: reviewed.length, naturalMultipleAnswers: 9, contextualKanjiExamples: examples, supplementaryReadingQuestions: readingQuestions, protectedJapaneseReferences}));
