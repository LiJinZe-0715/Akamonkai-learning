import assert from 'node:assert/strict';

export async function checkSpeech({ load }) {
  const { BrowserSpeech } = load('src/modules/speech/infrastructure/browser-speech.ts');
  const { dialogueLines } = load('src/modules/speech/domain/dialogue.ts');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalFetch = globalThis.fetch;
  const tick = () => new Promise(resolve => setImmediate(resolve));
  let voices = [], spoken = [], events = new Map(), cancellations = 0;
  const saved = new Map();
  const local = { voiceURI: 'local-ja', name: 'Local Japanese', lang: 'ja-JP', localService: true };
  const remote = { voiceURI: 'remote-ja', name: 'Remote Japanese', lang: 'ja', localService: false };
  class Utterance { constructor(text) { this.text = text; } }
  const audioInstances = [];
  class Audio {
    constructor() { audioInstances.push(this); }
    play() { this.played = true; return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }
  const engineSpeakers = [{ name: 'Character', styles: [
    { id: 7, name: 'Talk', type: 'talk' }, { id: 8, name: 'Sing', type: 'sing' },
    { id: 9, name: 'Legacy' }, { id: 'bad', name: 'Invalid' },
  ] }];
  const calls = [];
  const engineFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/speakers')) return { ok: true, json: async () => engineSpeakers };
    if (url.includes('/audio_query?')) return { ok: true, json: async () => ({ accent_phrases: [] }) };
    return { ok: true, blob: async () => new Blob(['audio'], { type: 'audio/wav' }) };
  };
  const cleanups = [];
  function setup(settings = {}) {
    saved.set('akamonkai-speech-v1', JSON.stringify(settings));
    const speech = new BrowserSpeech();
    cleanups.push(speech.initialize());
    return speech;
  }
  try {
    delete globalThis.window;
    const server = new BrowserSpeech();
    server.initialize()();
    assert.equal(server.speak('日本語', () => {}), false);
    server.stop();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      SpeechSynthesisUtterance: Utterance, Audio,
      localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
      speechSynthesis: {
        getVoices: () => voices, speak: u => spoken.push(u), cancel: () => cancellations++,
        addEventListener: (name, fn) => { const set = events.get(name) ?? new Set(); set.add(fn); events.set(name, set); },
        removeEventListener: (name, fn) => events.get(name)?.delete(fn),
      },
    } });
    const refresh = () => events.get('voiceschanged')?.forEach(fn => fn());
    globalThis.fetch = async () => { throw Error('Engine offline'); };
    const speech = setup({ voiceURI: 'remote-ja' });
    assert.equal(speech.snapshot().deviceStatus, 'loading');
    await tick();
    assert.equal(speech.snapshot().engine, 'device');
    assert.equal(speech.snapshot().voicevoxVoices.length, 0);
    voices = [{ ...local, lang: 'en-US' }, remote, local]; refresh();
    assert.equal(speech.snapshot().deviceStatus, 'ready');
    assert.equal(speech.snapshot().selectedDevice, remote.voiceURI, 'Restore URI after delayed voices');
    assert.equal(speech.snapshot().deviceVoices.length, 2);
    assert.equal(speech.snapshot().deviceVoices[0].local, false);
    const defaults = setup({ voiceURI: 'missing-on-this-device' });
    assert.equal(defaults.snapshot().selectedDevice, local.voiceURI, 'Prefer local Japanese fallback');
    await tick();
    speech.selectVoice(local.voiceURI);
    assert.equal(JSON.parse(saved.get('akamonkai-speech-v1')).voiceURI, local.voiceURI);
    speech.setRoleVoice('lesson1', 'A', remote.voiceURI);
    speech.setRoleVoice('lesson1', '我', remote.voiceURI);
    assert.equal(speech.roleVoice('lesson2', '我'), remote.voiceURI);
    assert.equal(speech.roleVoice('lesson2', 'A'), '');
    let completed = 0;
    assert(speech.play([{ text: '[日本:にほん]。', role: 'A', lessonId: 'lesson1' }, { text: '次。', role: 'A', lessonId: 'lesson1' }], () => completed++));
    assert.equal(spoken.at(-1).voice, remote);
    assert.equal(spoken.at(-1).lang, 'ja');
    assert.equal(spoken.at(-1).text, 'にほん。');
    const first = spoken.at(-1), count = spoken.length;
    speech.setRoleVoice('lesson1', 'A', local.voiceURI);
    first.onend();
    assert.equal(spoken.length, count + 1);
    assert.equal(spoken.at(-1).voice, local, 'Read role configuration again before each line');
    spoken.at(-1).onend();
    assert.equal(completed, 1);
    assert.equal(speech.snapshot().playing, false);
    speech.speak('停止', () => completed++);
    const stale = spoken.at(-1).onend;
    speech.stop(); stale();
    assert.equal(completed, 2, 'Stop completes exactly once');
    assert(cancellations > 0);
    speech.speak('失敗', () => completed++); spoken.at(-1).onerror();
    assert.equal(speech.snapshot().notice, 'ui.speechFailed');
    voices = [local]; refresh();
    assert.equal(speech.roleVoice('lesson2', '我'), '', 'Missing role voice falls back');
    speech.speak('回退', () => {}, { role: '我', lessonId: 'lesson2' });
    assert.equal(spoken.at(-1).voice, local);
    speech.stop();
    globalThis.fetch = engineFetch;
    await speech.detectVoicevox();
    assert.equal(speech.snapshot().engine, 'device', 'Detection must not switch a first-time user');
    assert.deepEqual(speech.snapshot().voicevoxVoices.map(v => v.id), ['7', '9']);
    speech.selectEngine('voicevox');
    speech.selectVoice('9');
    speech.setRoleVoice('lesson1', 'A', '7');
    assert(speech.speak('こんにちは', () => completed++, { role: 'A', lessonId: 'lesson1' }));
    await tick();
    assert(calls.some(call => call.url.includes('/audio_query?') && call.url.includes('speaker=7')));
    assert(calls.some(call => call.url.includes('/synthesis?') && call.options.method === 'POST'));
    assert.equal(audioInstances.at(-1).played, true);
    audioInstances.at(-1).onended();
    assert.equal(speech.snapshot().playing, false);
    speech.selectEngine('device');
    assert.equal(speech.snapshot().selectedDevice, local.voiceURI);
    assert.equal(speech.roleVoice('lesson1', 'A'), local.voiceURI, 'Engine role values stay separate');
    speech.selectEngine('voicevox');
    assert.equal(speech.roleVoice('lesson1', 'A'), '7');
    const restored = setup(JSON.parse(saved.get('akamonkai-speech-v1')));
    await tick();
    assert.equal(restored.snapshot().engine, 'voicevox', 'Restore explicitly chosen engine after successful detection');
    assert.equal(restored.snapshot().selectedVoicevox, '9');
    let resolveQuery, pendingSignal;
    globalThis.fetch = (url, options) => new Promise(resolve => { resolveQuery = resolve; pendingSignal = options.signal; });
    speech.speak('キャンセル', () => completed++);
    const synthesisCount = calls.filter(call => call.url.includes('/synthesis?')).length;
    speech.selectEngine('device');
    assert(pendingSignal.aborted);
    resolveQuery({ ok: true, json: async () => ({}) });
    await tick();
    assert.equal(calls.filter(call => call.url.includes('/synthesis?')).length, synthesisCount);
    speech.stop();
    globalThis.fetch = async () => { throw Error('Engine offline'); };
    const fallback = setup({ engine: 'voicevox' }); await tick();
    assert.equal(fallback.snapshot().engine, 'device');
    assert.equal(fallback.snapshot().notice, 'ui.voicevoxFallback');
    assert.deepEqual(dialogueLines('A：一。 B：二。', 'l'), [{ text: '一。', role: 'A', lessonId: 'l' }, { text: '二。', role: 'B', lessonId: 'l' }]);
    voices = []; refresh();
    await new Promise(resolve => setTimeout(resolve, 2600));
    assert.equal(speech.snapshot().deviceStatus, 'empty');
    voices = [remote]; refresh();
    assert.equal(speech.snapshot().deviceStatus, 'ready', 'Keep listening after an initially empty list');
    assert.equal(speech.snapshot().selectedDevice, remote.voiceURI);
    let finishDetection, detectionSignal;
    globalThis.fetch = (_, options) => new Promise(resolve => { finishDetection = resolve; detectionSignal = options.signal; });
    const detecting = speech.detectVoicevox();
    speech.stop();
    assert(!detectionSignal.aborted, 'Stopping playback must not cancel independent engine discovery');
    finishDetection({ ok: true, json: async () => engineSpeakers });
    await detecting;
    assert.equal(speech.snapshot().voicevoxVoices.length, 2);
    globalThis.fetch = async () => { throw Error('Engine offline'); };
    delete window.speechSynthesis;
    const unsupported = setup(); await tick();
    assert.equal(unsupported.snapshot().deviceStatus, 'unsupported');
    console.log(JSON.stringify({ speech: 'passed', delayedVoicesAndRestore: 'passed', roleIsolationAndLiveSequence: 'passed', voicevoxDetectionPlaybackAndCancellation: 'passed', speechSsr: 'passed' }));
  } finally {
    // Restore the mock synthesis before disposing its event subscriptions.
    if (globalThis.window && !window.speechSynthesis) window.speechSynthesis = { cancel() {}, removeEventListener() {} };
    cleanups.forEach(cleanup => cleanup());
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
}
