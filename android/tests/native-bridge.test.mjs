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
    EventTarget, Event, Blob, setTimeout, HTMLAnchorElement: Anchor, location: {origin},
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

const speaks = calls => calls.filter(call => call[0] === 'speak');

test('Android speech hands the next sentence to the engine at once, queued behind the current one', () => {
  const {context: c, calls} = setup();
  assert.equal(c.speechSynthesis.getVoices()[0].voiceURI, 'offline');
  const first = new c.SpeechSynthesisUtterance('一'), second = new c.SpeechSynthesisUtterance('二');
  const events = [];
  for (const [name, utterance] of [['一', first], ['二', second]]) {
    utterance.onstart = () => events.push(name + ':start');
    utterance.onend = () => events.push(name + ':end');
  }
  c.speechSynthesis.speak(first);
  c.speechSynthesis.speak(second);
  // 两句都已交给引擎：第一句清空队列开始，第二句排在后面（最后一个参数 queued）。
  assert.deepEqual(speaks(calls).map(call => [call[2], call[6]]), [['一', false], ['二', true]]);
  assert.equal(c.speechSynthesis.pending, true);
  const [firstId, secondId] = speaks(calls).map(call => call[1]);
  c.__androidSpeechEvent(firstId, 'start');
  c.__androidSpeechEvent(firstId, 'end');
  c.__androidSpeechEvent(secondId, 'start');
  assert.deepEqual(events, ['一:start', '一:end', '二:start']);
  assert.equal(c.speechSynthesis.speaking, true);
  assert.equal(c.speechSynthesis.pending, false);

  // 暂停：停掉引擎；恢复：从被打断的那句重送，旧 id 的回调不再认。
  c.speechSynthesis.pause();
  assert.equal(calls.at(-1)[0], 'stop');
  c.speechSynthesis.resume();
  const resent = speaks(calls).at(-1);
  assert.deepEqual([resent[2], resent[6]], ['二', false]);
  c.__androidSpeechEvent(secondId, 'end');
  assert.equal(events.length, 3, 'a callback for the interrupted request is ignored');
  c.__androidSpeechEvent(resent[1], 'end');
  assert.deepEqual(events.slice(3), ['二:end']);
  assert.equal(c.speechSynthesis.speaking, false);

  // 取消：排着的全部以 canceled 收尾，状态归零。
  const third = new c.SpeechSynthesisUtterance('三');
  let canceled;
  third.onerror = event => canceled = event.error;
  c.speechSynthesis.speak(third);
  c.speechSynthesis.cancel();
  assert.equal(canceled, 'canceled');
  assert.equal(c.speechSynthesis.speaking, false);
  assert.equal(c.speechSynthesis.pending, false);
  assert.equal(c.speechSynthesis.paused, false);
});

test('blank warm-up never reaches the engine, so an engine that ignores it cannot block the queue', async () => {
  const {context: c, calls} = setup();
  const warm = new c.SpeechSynthesisUtterance(' '), line = new c.SpeechSynthesisUtterance('一');
  const events = [];
  warm.onstart = () => events.push('warm:start');
  warm.onend = () => events.push('warm:end');
  c.speechSynthesis.speak(warm);
  c.speechSynthesis.speak(line);
  assert.deepEqual(speaks(calls).map(call => [call[2], call[6]]), [['一', false]], 'only the real line is sent, and it starts the queue');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(events, ['warm:start', 'warm:end']);

  // 夹在两句中间的空白：前一句读完它就了结；下一句的回调先到也不会卡住。
  const before = new c.SpeechSynthesisUtterance('前'), blank = new c.SpeechSynthesisUtterance('　'), after = new c.SpeechSynthesisUtterance('後');
  const order = [];
  for (const [name, utterance] of [['前', before], ['空', blank], ['後', after]]) {
    utterance.onstart = () => order.push(name + ':start');
    utterance.onend = () => order.push(name + ':end');
  }
  c.__androidSpeechEvent(speaks(calls)[0][1], 'end');
  c.speechSynthesis.speak(before);
  c.speechSynthesis.speak(blank);
  c.speechSynthesis.speak(after);
  const [, beforeCall, afterCall] = speaks(calls);
  assert.deepEqual([beforeCall[2], afterCall[2]], ['前', '後']);
  c.__androidSpeechEvent(beforeCall[1], 'end');
  c.__androidSpeechEvent(afterCall[1], 'start');
  assert.deepEqual(order, ['前:end', '空:start', '空:end', '後:start']);
});

test('the pause the page sets before a sentence is handed to the native player', () => {
  const {context: c, calls} = setup();
  const line = new c.SpeechSynthesisUtterance('二');
  line.pauseBefore = 800;
  c.speechSynthesis.speak(new c.SpeechSynthesisUtterance('一'));
  c.speechSynthesis.speak(line);
  assert.deepEqual(speaks(calls).map(call => call[7]), [0, 800]);
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
