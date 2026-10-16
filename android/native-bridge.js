(() => {
  if (!window.AndroidSpeech || location.origin !== 'https://appassets.androidplatform.net') return;
  class Utterance extends EventTarget {
    constructor(text = '') {
      super();
      Object.assign(this, { text, lang: 'ja-JP', rate: 1, pitch: 1, volume: 1, voice: null });
    }
  }
  let current, sequence = 0;
  const queue = [];
  const synthesis = new EventTarget();
  Object.assign(synthesis, {
    paused: false, speaking: false,
    getVoices() {
      return JSON.parse(AndroidSpeech.getVoices()).sort((a, b) => Number(b.localService) - Number(a.localService));
    },
    speak(utterance) { queue.push(utterance); next(); },
    cancel() {
      const canceled = [current?.utterance, ...queue].filter(Boolean);
      current = undefined;
      queue.length = 0;
      synthesis.speaking = false;
      synthesis.paused = false;
      AndroidSpeech.stop();
      for (const utterance of canceled) emit(utterance, 'error', 'canceled');
    },
    pause() { synthesis.paused = true; AndroidSpeech.stop(); },
    resume() {
      if (!synthesis.paused) return;
      synthesis.paused = false;
      // Android TTS cannot pause mid-sentence; resuming repeats the current sentence.
      if (current) start(current.utterance); else next();
    },
  });
  Object.defineProperty(synthesis, 'pending', { get: () => queue.length > 0 });
  function emit(utterance, type, error) {
    const event = new Event(type);
    Object.assign(event, { utterance, error });
    utterance[`on${type}`]?.(event);
    utterance.dispatchEvent(event);
  }
  function start(utterance) {
    current = { id: String(++sequence), utterance };
    synthesis.speaking = true;
    AndroidSpeech.speak(current.id, utterance.text, utterance.voice?.voiceURI || '', utterance.rate, utterance.pitch);
  }
  function next() { if (!current && !synthesis.paused && queue.length) start(queue.shift()); }
  window.__androidSpeechEvent = (id, type) => {
    if (!current || current.id !== id || synthesis.paused) return;
    const utterance = current.utterance;
    if (type !== 'start') { current = undefined; synthesis.speaking = false; }
    emit(utterance, type, type === 'error' ? 'synthesis-failed' : undefined);
    if (type !== 'start') next();
  };
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true });

  const blobs = new Map();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
  URL.revokeObjectURL = url => { blobs.delete(url); revoke(url); };
  function save(anchor) {
    if (!anchor.hasAttribute('download') || !window.AndroidFiles) return false;
    const blob = blobs.get(anchor.href);
    if (!blob || blob.type !== 'application/json') return false;
    if (blob.size > 10 * 1024 * 1024) { alert('备份文件过大'); return true; }
    // Capture the Blob before the original application immediately revokes its URL.
    blob.text().then(text => AndroidFiles.saveJson(text, anchor.download || 'study-progress.json'))
      .catch(() => alert('导出失败，请重试'));
    return true;
  }
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (!save(this)) click.call(this); };
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[download]');
    if (anchor && save(anchor)) event.preventDefault();
  }, true);
})();
