(() => {
  if (!window.AndroidSpeech || location.origin !== 'https://appassets.androidplatform.net') return;
  class Utterance extends EventTarget {
    constructor(text = '') {
      super();
      Object.assign(this, { text, lang: 'ja-JP', rate: 1, pitch: 1, volume: 1, voice: null });
    }
  }
  // 已经交给原生、还没读完的句子，按朗读顺序排列。引擎按顺序读，回调总是落在队首。
  const sent = [];
  // 暂停期间收到的句子，以及暂停时被打断、恢复后要重读的句子。
  const held = [];
  let sequence = 0;
  const synthesis = new EventTarget();
  Object.assign(synthesis, {
    paused: false, speaking: false,
    getVoices() {
      return JSON.parse(AndroidSpeech.getVoices()).sort((a, b) => Number(b.localService) - Number(a.localService));
    },
    speak(utterance) {
      if (synthesis.paused) held.push(utterance);
      else send(utterance);
    },
    cancel() {
      const canceled = [...sent.map(item => item.utterance), ...held];
      sent.length = 0;
      held.length = 0;
      synthesis.speaking = false;
      synthesis.paused = false;
      AndroidSpeech.stop();
      for (const utterance of canceled) emit(utterance, 'error', 'canceled');
    },
    pause() {
      if (synthesis.paused) return;
      synthesis.paused = true;
      AndroidSpeech.stop();
      // Android TTS 不能停在句中：恢复时从被打断的那句重读，排在后面的原样再送一遍。
      held.unshift(...sent.map(item => item.utterance));
      sent.length = 0;
      synthesis.speaking = false;
    },
    resume() {
      if (!synthesis.paused) return;
      synthesis.paused = false;
      for (const utterance of held.splice(0)) send(utterance);
    },
  });
  Object.defineProperty(synthesis, 'pending', { get: () => sent.length > 1 || held.length > 0 });
  function emit(utterance, type, error) {
    const event = new Event(type);
    Object.assign(event, { utterance, error });
    utterance[`on${type}`]?.(event);
    utterance.dispatchEvent(event);
  }
  /**
   * 收到就交给原生，不等前一句读完：前面没有在读的就清空引擎队列重新开始，有的话排在
   * 后面（QUEUE_ADD）。Android 的 TTS 框架合成和播放是两条线，前一句还在播，这一句
   * 已经在合成——句与句之间不再空等合成。
   */
  function send(utterance) {
    const item = { id: String(++sequence), utterance, blank: !String(utterance.text).trim() };
    const queued = sent.some(other => !other.blank);
    sent.push(item);
    synthesis.speaking = true;
    // 纯空白（网页的静音预热）不送引擎：VOICEVOX 收到这种文本既不开始也不结束，
    // 这一条就永远占着队列，后面的朗读全都轮不到——表现就是「点了不播放」。
    // 本来就没有要读的内容，轮到它时直接按「读完」处理。
    if (item.blank) {
      if (sent[0] === item) setTimeout(settleBlanks, 0);
      return;
    }
    // pauseBefore：网页设的句间停顿，原生播放器在上一句播完后等够这么久再开口。
    AndroidSpeech.speak(item.id, utterance.text, utterance.voice?.voiceURI || '', utterance.rate, utterance.pitch, queued,
      Number(utterance.pauseBefore) || 0);
  }
  /** 队首是不送引擎的空白句时，替引擎把它「读完」。 */
  function settleBlanks() {
    while (!synthesis.paused && sent[0]?.blank) {
      const { utterance } = sent.shift();
      synthesis.speaking = sent.length > 0;
      emit(utterance, 'start');
      emit(utterance, 'end');
    }
  }
  window.__androidSpeechEvent = (id, type) => {
    if (synthesis.paused) return;
    const index = sent.findIndex(item => item.id === id);
    // 取消或暂停之前送出去的旧句子，回调一律不认。
    if (index < 0) return;
    // 引擎按顺序读：这一句有了回调，排在它前面的只可能是不送引擎的空白句，先把它们了结。
    for (const item of sent.splice(0, index)) {
      emit(item.utterance, 'start');
      emit(item.utterance, 'end');
    }
    const { utterance } = sent[0];
    if (type !== 'start') {
      sent.shift();
      synthesis.speaking = sent.length > 0;
    }
    emit(utterance, type, type === 'error' ? 'synthesis-failed' : undefined);
    if (type !== 'start' && sent[0]?.blank) setTimeout(settleBlanks, 0);
  };
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true });
  // 页面需要跳出 WebView 的少数场合（目前只有「打开系统语音设置」）。
  window.akamonkaiAndroid = {
    openTtsSettings() {
      try { AndroidSpeech.openTtsSettings(); } catch (error) { /* 老版本壳没这个方法 */ }
    },
    /** 设置页的「检查更新」：结果由原生对话框给出。 */
    checkUpdates() {
      try { window.AndroidApp?.checkUpdates(); } catch (error) { /* 老版本壳没这个接口 */ }
    },
  };

  // 壳的提示跟系统语言走，与 res/values(-zh)/strings.xml 一致。
  const zh = /^zh/i.test(globalThis.navigator?.language || '');
  const texts = zh
    ? { tooLarge: '备份文件过大', exportFailed: '导出失败，请重试' }
    : { tooLarge: 'The backup file is too large', exportFailed: 'Export failed, please try again' };
  const blobs = new Map();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
  URL.revokeObjectURL = url => { blobs.delete(url); revoke(url); };
  function save(anchor) {
    if (!anchor.hasAttribute('download') || !window.AndroidFiles) return false;
    const blob = blobs.get(anchor.href);
    if (!blob || blob.type !== 'application/json') return false;
    if (blob.size > 10 * 1024 * 1024) { alert(texts.tooLarge); return true; }
    // Capture the Blob before the original application immediately revokes its URL.
    blob.text().then(text => AndroidFiles.saveJson(text, anchor.download || 'study-progress.json'))
      .catch(() => alert(texts.exportFailed));
    return true;
  }
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (!save(this)) click.call(this); };
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[download]');
    if (anchor && save(anchor)) event.preventDefault();
  }, true);
})();
