import type { SpeechPort } from "../application/ports";
import type { SpeechEngine, SpeechLine, SpeechState, SpeechVoice } from "../application/contracts";

import { roleVoiceKey } from "../domain/roles";
import { speechConfiguration } from "./config";
const { engineUrl: ENGINE_URL, storageKey: STORAGE_KEY } = speechConfiguration;
interface Settings {
  engine?: SpeechEngine;
  voiceURI?: string;
  styleId?: string;
  roles?: Record<string, { voiceURI?: string; styleId?: string }>;
}
export class BrowserSpeech implements SpeechPort {
  private state: SpeechState = {
    engine: "device", deviceVoices: [], voicevoxVoices: [], selectedDevice: "",
    selectedVoicevox: "", deviceStatus: "loading", detecting: false, playing: false, notice: "",
  };
  private settings: Settings = {};
  private voices: SpeechSynthesisVoice[] = [];
  private listeners = new Set<() => void>();
  private generation = 0;
  private request?: AbortController;
  private detection?: AbortController;
  private audio?: HTMLAudioElement;
  private audioUrl?: string;
  private utterance?: SpeechSynthesisUtterance;
  private completion?: () => void;
  private restoreEngine = true;
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<SpeechState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private save() {
    try { if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); }
    catch { this.update({ notice: "ui.speechStorageError" }); }
  }
  initialize() {
    if (typeof window === "undefined") return () => {};
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        this.settings = {
          engine: saved.engine === "voicevox" ? "voicevox" : "device",
          voiceURI: typeof saved.voiceURI === "string" ? saved.voiceURI : undefined,
          styleId: typeof saved.styleId === "string" ? saved.styleId : undefined,
          roles: saved.roles && typeof saved.roles === "object" && !Array.isArray(saved.roles) ? saved.roles : {},
        };
      }
    } catch { /* Invalid or inaccessible preferences use defaults. */ }
    this.restoreEngine = true;
    const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      this.voices = window.speechSynthesis.getVoices().filter(v => /^ja(?:[-_]|$)/i.test(v.lang));
      const options = this.voices.map(v => ({ id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }));
      const fallback = this.voices.find(v => v.localService) ?? this.voices[0];
      const selected = this.voices.find(v => v.voiceURI === this.settings.voiceURI) ?? fallback;
      // Keep a saved URI while the browser is still loading its voices.
      this.update({ deviceVoices: options, selectedDevice: selected?.voiceURI ?? "",
        deviceStatus: options.length ? "ready" : this.state.deviceStatus === "loading" ? "loading" : "empty" });
    };
    if (supported) {
      window.speechSynthesis.addEventListener("voiceschanged", refresh);
      refresh();
      timer = setTimeout(() => {
        refresh();
        if (!this.voices.length) this.update({ deviceStatus: "empty" });
      }, 2500);
    } else this.update({ deviceStatus: "unsupported" });
    void this.detectVoicevox();
    return () => {
      if (supported) window.speechSynthesis.removeEventListener("voiceschanged", refresh);
      clearTimeout(timer);
      this.stop();
      this.detection?.abort();
      this.detection = undefined;
      this.restoreEngine = false;
      this.update({ detecting: false });
    };
  }
  async detectVoicevox() {
    if (typeof window === "undefined") return;
    this.detection?.abort();
    const controller = new AbortController();
    this.detection = controller;
    this.update({ detecting: true });
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(ENGINE_URL + "/speakers", { signal: controller.signal });
      if (!response.ok) throw Error("speakers");
      const speakers: unknown = await response.json();
      if (!Array.isArray(speakers)) throw Error("speakers");
      const options: SpeechVoice[] = [];
      for (const speaker of speakers) {
        if (typeof speaker?.name !== "string" || !Array.isArray(speaker.styles)) continue;
        for (const style of speaker.styles) {
          if (Number.isInteger(style?.id) && style.id >= 0 && typeof style.name === "string" &&
              (style.type === undefined || style.type === "talk"))
            options.push({ id: String(style.id), name: speaker.name + " / " + style.name });
        }
      }
      if (!options.length) throw Error("No talk styles");
      if (this.detection !== controller || controller.signal.aborted) return;
      this.update({ voicevoxVoices: options,
        selectedVoicevox: options.find(v => v.id === this.settings.styleId)?.id ?? options[0].id, notice: "" });
      if (this.restoreEngine && this.settings.engine === "voicevox") this.update({ engine: "voicevox" });
    } catch {
      if (this.detection !== controller) return;
      if (this.state.engine === "voicevox") this.cancelPlayback();
      this.update({ voicevoxVoices: [], engine: "device", notice: this.restoreEngine && this.settings.engine === "voicevox"
        ? "ui.voicevoxFallback" : "ui.voicevoxUnavailable" });
    } finally {
      clearTimeout(timeout);
      if (this.detection === controller) {
        this.detection = undefined;
        this.restoreEngine = false;
        this.update({ detecting: false });
      }
    }
  }
  selectEngine(engine: SpeechEngine) {
    if (engine === "voicevox" && !this.state.voicevoxVoices.length) return;
    this.stop();
    this.restoreEngine = false;
    this.settings.engine = engine;
    this.update({ engine, notice: "" });
    this.save();
  }
  selectVoice(id: string) {
    const device = this.state.engine === "device";
    if (!(device ? this.state.deviceVoices : this.state.voicevoxVoices).some(v => v.id === id)) return;
    if (device) this.settings.voiceURI = id;
    else this.settings.styleId = id;
    this.update(device ? { selectedDevice: id } : { selectedVoicevox: id });
    this.save();
  }
  roleVoice(lessonId: string, role: string) {
    const device = this.state.engine === "device";
    const saved = this.settings.roles?.[roleVoiceKey(lessonId, role)];
    const id = device ? saved?.voiceURI : saved?.styleId;
    return (device ? this.state.deviceVoices : this.state.voicevoxVoices).some(v => v.id === id) ? id! : "";
  }
  setRoleVoice(lessonId: string, role: string, id: string) {
    const device = this.state.engine === "device";
    if (id && !(device ? this.state.deviceVoices : this.state.voicevoxVoices).some(v => v.id === id)) return;
    const key = roleVoiceKey(lessonId, role);
    this.settings.roles ??= {};
    this.settings.roles[key] = { ...this.settings.roles[key], [device ? "voiceURI" : "styleId"]: id };
    this.save();
    this.update({});
  }
  speak(text: string, onEnd: () => void, context?: Omit<SpeechLine, "text">) {
    return this.play([{ text, ...context }], onEnd);
  }
  play(lines: SpeechLine[], onEnd: () => void) {
    this.cancelPlayback();
    if (typeof window === "undefined" || !lines.length) return false;
    this.restoreEngine = false;
    if (this.state.engine === "device" && (!this.voices.length || !("speechSynthesis" in window))) {
      this.update({ notice: this.state.deviceStatus === "loading" ? "ui.speechLoading" : "ui.speechNoJapanese" });
      return false;
    }
    // Construct the media element during the user gesture; playback rejection is reported.
    if (this.state.engine === "voicevox") this.audio = new window.Audio();
    this.completion = onEnd;
    const token = this.generation;
    this.update({ playing: true, notice: "" });
    const next = (index: number) => {
      if (token !== this.generation) return;
      if (index === lines.length) { this.cancelPlayback(); return; }
      this.readLine(lines[index], token, () => next(index + 1));
    };
    next(0);
    return this.state.playing;
  }
  private readLine(line: SpeechLine, token: number, onEnd: () => void) {
    const text = line.text.replace(/\[([^:\]]+):([^\]]+)\]/g, "$2");
    const roleId = line.role ? this.roleVoice(line.lessonId ?? "", line.role) : "";
    if (this.state.engine === "device") {
      const voice = this.voices.find(v => v.voiceURI === (roleId || this.state.selectedDevice));
      if (!voice) { this.fail(token, "ui.speechNoJapanese"); return; }
      try {
        const utterance = new window.SpeechSynthesisUtterance(text);
        this.utterance = utterance;
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = 0.85;
        utterance.onend = () => { if (token === this.generation) onEnd(); };
        utterance.onerror = () => this.fail(token, "ui.speechFailed");
        window.speechSynthesis.speak(utterance);
      } catch { this.fail(token, "ui.speechFailed"); }
    } else void this.readVoicevox(text, roleId || this.state.selectedVoicevox, token, onEnd);
  }
  private async readVoicevox(text: string, styleId: string, token: number, onEnd: () => void) {
    const controller = new AbortController();
    this.request = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const query = await fetch(ENGINE_URL + "/audio_query?" + new URLSearchParams({ text, speaker: styleId }),
        { method: "POST", signal: controller.signal });
      if (!query.ok) throw Error("query");
      const body = await query.json();
      if (token !== this.generation || controller.signal.aborted) return;
      const response = await fetch(ENGINE_URL + "/synthesis?" + new URLSearchParams({ speaker: styleId }),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) throw Error("synthesis");
      const blob = await response.blob();
      if (token !== this.generation) return;
      this.releaseAudioUrl();
      this.audioUrl = URL.createObjectURL(blob);
      const audio = this.audio!;
      audio.src = this.audioUrl;
      audio.onended = () => { if (token === this.generation) onEnd(); };
      audio.onerror = () => this.fail(token, "ui.voicevoxPlaybackFailed");
      await audio.play();
    } catch { this.fail(token, "ui.voicevoxPlaybackFailed"); }
    finally { clearTimeout(timeout); if (this.request === controller) this.request = undefined; }
  }
  private fail(token: number, notice: string) {
    if (token !== this.generation) return;
    this.cancelPlayback();
    this.update({ notice });
  }
  private releaseAudioUrl() {
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = undefined;
  }
  private cancelPlayback() {
    this.generation++;
    this.request?.abort();
    this.request = undefined;
    if (this.utterance) { this.utterance.onend = null; this.utterance.onerror = null; this.utterance = undefined; }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); this.audio = undefined; }
    this.releaseAudioUrl();
    const completion = this.completion;
    this.completion = undefined;
    this.update({ playing: false });
    completion?.();
  }
  stop() {
    this.cancelPlayback();
  }
}
