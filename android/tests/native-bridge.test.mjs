import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../native-bridge.js', import.meta.url), 'utf8');
function setup(origin = 'https://appassets.androidplatform.net') {
  const calls = [], saved = [], listeners = new Map();
  class Anchor {
    href = ''; download = '';
    hasAttribute(name) { return name === 'download' && !!this.download; }
    click() { calls.push(['click']); }
  }
  let urls = 0;
  const context = {
    EventTarget, Event, Blob, HTMLAnchorElement: Anchor, location: {origin},
    document: {addEventListener: (name, callback) => listeners.set(name, callback)},
    URL: {createObjectURL: () => `blob:test/${++urls}`, revokeObjectURL() {}},
    AndroidSpeech: {
      getVoices: () => JSON.stringify([
        {voiceURI: 'online', localService: false, lang: 'ja-JP'},
        {voiceURI: 'offline', localService: true, lang: 'ja-JP'},
      ]),
      speak: (...args) => calls.push(['speak', ...args]), stop: () => calls.push(['stop']),
    },
    AndroidFiles: {saveJson: (...args) => saved.push(args)},
    alert: message => calls.push(['alert', message]),
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return {context, calls, saved, Anchor};
}

test('Android speech keeps queue order, ignores replaced callbacks and prefers offline voices', () => {
  const {context: c, calls} = setup();
  assert.equal(c.speechSynthesis.getVoices()[0].voiceURI, 'offline');
  const first = new c.SpeechSynthesisUtterance('一'), second = new c.SpeechSynthesisUtterance('二');
  let completed = 0;
  first.onend = () => completed++;
  c.speechSynthesis.speak(first);
  c.speechSynthesis.speak(second);
  const oldId = calls.at(-1)[1];
  assert.equal(c.speechSynthesis.pending, true);
  c.speechSynthesis.pause();
  c.__androidSpeechEvent(oldId, 'end');
  assert.equal(completed, 0);
  c.speechSynthesis.resume();
  const newId = calls.at(-1)[1];
  assert.notEqual(oldId, newId);
  c.__androidSpeechEvent(oldId, 'end');
  assert.equal(completed, 0);
  c.__androidSpeechEvent(newId, 'end');
  assert.equal(completed, 1);
  assert.equal(calls.at(-1)[2], '二');
  c.speechSynthesis.cancel();
  assert.equal(c.speechSynthesis.speaking, false);
  assert.equal(c.speechSynthesis.pending, false);
  assert.equal(c.speechSynthesis.paused, false);
});

test('disconnected backup anchor saves JSON even when its blob URL is revoked immediately', async () => {
  const {context: c, saved, calls, Anchor} = setup();
  const anchor = new Anchor();
  anchor.href = c.URL.createObjectURL(new Blob(['{"saved":true}'], {type: 'application/json'}));
  anchor.download = 'progress.json';
  anchor.click();
  c.URL.revokeObjectURL(anchor.href);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(saved, [['{"saved":true}', 'progress.json']]);
  assert.equal(calls.length, 0);
});

test('native bridge is not installed for an external page', () => {
  const {context} = setup('https://example.com');
  assert.equal(context.speechSynthesis, undefined);
});
