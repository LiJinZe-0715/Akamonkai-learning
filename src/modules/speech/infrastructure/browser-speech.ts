import type {SpeechUseCases, SpeechEngine, SpeechLine, SpeechState, SpeechVoice} from "../application/contracts";

import {clampSpeechRate, SPEECH_RATE} from "../domain/rate";
import {roleVoiceKey} from "../domain/roles";
import {speechConfiguration} from "./speech-config";

const {engineUrls: ENGINE_URLS, storageKey: STORAGE_KEY} = speechConfiguration;
const DEFAULT_RATE = SPEECH_RATE.default;

interface Settings {
    engine?: SpeechEngine;
    voiceURI?: string;
    styleId?: string;
    rate?: number;
    engineUrl?: string;
    roles?: Record<string, { voiceURI?: string; styleId?: string }>;
}

/** Accepts `host:port` as well as a full URL, and drops any trailing slash. */
function normalizeEngineUrl(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : "http://" + trimmed;
    return /^https?:\/\/[^\s/?#]+$/i.test(withScheme) ? withScheme : "";
}

export class BrowserSpeech implements SpeechUseCases {
    private state: SpeechState = {
        engine: "device", deviceVoices: [], voicevoxVoices: [], selectedDevice: "",
        selectedVoicevox: "", deviceStatus: "loading", detecting: false, playing: false, notice: "",
        rate: DEFAULT_RATE, engineUrl: "",
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
        return () => {
            this.listeners.delete(listener);
        };
    };

    initialize() {
        if (typeof window === "undefined") return () => {
        };
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
            if (saved && typeof saved === "object" && !Array.isArray(saved)) {
                this.settings = {
                    engine: saved.engine === "voicevox" ? "voicevox" : "device",
                    voiceURI: typeof saved.voiceURI === "string" ? saved.voiceURI : undefined,
                    styleId: typeof saved.styleId === "string" ? saved.styleId : undefined,
                    rate: typeof saved.rate === "number" ? clampSpeechRate(saved.rate) : DEFAULT_RATE,
                    engineUrl: typeof saved.engineUrl === "string" ? normalizeEngineUrl(saved.engineUrl) : "",
                    roles: saved.roles && typeof saved.roles === "object" && !Array.isArray(saved.roles) ? saved.roles : {},
                };
            }
        } catch { /* Invalid or inaccessible preferences use defaults. */
        }
        // Both of these come back from storage; leaving `engineUrl` out would hide a
        // saved manual address behind an empty field while it is still in use.
        this.update({rate: this.settings.rate ?? DEFAULT_RATE, engineUrl: this.settings.engineUrl ?? ""});
        this.restoreEngine = true;
        const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = () => {
            this.voices = window.speechSynthesis.getVoices().filter(v => /^ja(?:[-_]|$)/i.test(v.lang));
            const options = this.voices.map(v => ({id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService}));
            const fallback = this.voices.find(v => v.localService) ?? this.voices[0];
            const selected = this.voices.find(v => v.voiceURI === this.settings.voiceURI) ?? fallback;
            // Keep a saved URI while the browser is still loading its voices.
            this.update({
                deviceVoices: options, selectedDevice: selected?.voiceURI ?? "",
                deviceStatus: options.length ? "ready" : this.state.deviceStatus === "loading" ? "loading" : "empty"
            });
        };
        if (supported) {
            window.speechSynthesis.addEventListener("voiceschanged", refresh);
            refresh();
            timer = setTimeout(() => {
                refresh();
                if (!this.voices.length) this.update({deviceStatus: "empty"});
            }, 2500);
        } else this.update({deviceStatus: "unsupported"});
        void this.detectVoicevox();
        return () => {
            if (supported) window.speechSynthesis.removeEventListener("voiceschanged", refresh);
            clearTimeout(timer);
            this.stop();
            this.detection?.abort();
            this.detection = undefined;
            this.restoreEngine = false;
            this.update({detecting: false});
        };
    }

    async detectVoicevox() {
        if (typeof window === "undefined") return;
        this.detection?.abort();
        const controller = new AbortController();
        this.detection = controller;
        this.update({detecting: true});
        // Probe every candidate at once and take the first engine that answers.
        // Sequentially, a port that swallows packets instead of refusing them would
        // add its full timeout to the wait before the next one is even tried.
        const probes = this.engineCandidates().map(base => ({base, cancel: new AbortController()}));
        const abortProbes = () => probes.forEach(probe => probe.cancel.abort());
        controller.signal.addEventListener("abort", abortProbes);
        try {
            const hit = await new Promise<{ base: string; voices: SpeechVoice[] } | null>(resolve => {
                let left = probes.length;
                probes.forEach(probe => {
                    void this.readSpeakers(probe.base, probe.cancel.signal).then(voices => {
                        if (voices.length) resolve({base: probe.base, voices});
                        else if (--left === 0) resolve(null);
                    });
                });
            });
            if (!hit) throw Error("No talk styles");
            if (this.detection !== controller || controller.signal.aborted) return;
            this.update({
                engineUrl: hit.base, voicevoxVoices: hit.voices,
                selectedVoicevox: hit.voices.find(v => v.id === this.settings.styleId)?.id ?? hit.voices[0].id, notice: ""
            });
            if (this.restoreEngine && this.settings.engine === "voicevox") this.update({engine: "voicevox"});
        } catch {
            if (this.detection !== controller) return;
            if (this.state.engine === "voicevox") this.cancelPlayback();
            this.update({
                voicevoxVoices: [], engine: "device", notice: this.restoreEngine && this.settings.engine === "voicevox"
                    ? "ui.voicevoxFallback" : "ui.voicevoxUnavailable"
            });
        } finally {
            controller.signal.removeEventListener("abort", abortProbes);
            abortProbes();
            if (this.detection === controller) {
                this.detection = undefined;
                this.restoreEngine = false;
                this.update({detecting: false});
            }
        }
    }

    /** A hand-entered address replaces the built-in list instead of adding to it. */
    private engineCandidates(): readonly string[] {
        return this.settings.engineUrl ? [this.settings.engineUrl] : ENGINE_URLS;
    }

    private async readSpeakers(base: string, parent: AbortSignal): Promise<SpeechVoice[]> {
        const attempt = new AbortController();
        const forward = () => attempt.abort();
        parent.addEventListener("abort", forward);
        const timeout = setTimeout(() => attempt.abort(), 3000);
        try {
            const response = await fetch(base + "/speakers", {signal: attempt.signal});
            if (!response.ok) return [];
            const speakers: unknown = await response.json();
            if (!Array.isArray(speakers)) return [];
            const options: SpeechVoice[] = [];
            for (const speaker of speakers) {
                if (typeof speaker?.name !== "string" || !Array.isArray(speaker.styles)) continue;
                for (const style of speaker.styles) {
                    if (Number.isInteger(style?.id) && style.id >= 0 && typeof style.name === "string" &&
                        (style.type === undefined || style.type === "talk"))
                        options.push({id: String(style.id), name: speaker.name + " / " + style.name});
                }
            }
            return options;
        } catch {
            return [];
        } finally {
            clearTimeout(timeout);
            parent.removeEventListener("abort", forward);
        }
    }

    setEngineUrl(url: string) {
        const normalized = normalizeEngineUrl(url);
        if (normalized === (this.settings.engineUrl ?? "")) return;
        this.settings.engineUrl = normalized || undefined;
        this.save();
        this.update({engineUrl: normalized, voicevoxVoices: [], selectedVoicevox: ""});
        if (this.state.engine === "voicevox") this.selectEngine("device");
        void this.detectVoicevox();
    }

    setRate(rate: number) {
        const clamped = clampSpeechRate(rate);
        if (clamped === this.state.rate) return;
        this.settings.rate = clamped;
        this.update({rate: clamped});
        this.save();
    }

    selectEngine(engine: SpeechEngine) {
        if (engine === "voicevox" && !this.state.voicevoxVoices.length) return;
        this.stop();
        this.restoreEngine = false;
        this.settings.engine = engine;
        this.update({engine, notice: ""});
        this.save();
    }

    selectVoice(id: string) {
        const device = this.state.engine === "device";
        if (!(device ? this.state.deviceVoices : this.state.voicevoxVoices).some(v => v.id === id)) return;
        if (device) this.settings.voiceURI = id;
        else this.settings.styleId = id;
        this.update(device ? {selectedDevice: id} : {selectedVoicevox: id});
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
        this.settings.roles[key] = {...this.settings.roles[key], [device ? "voiceURI" : "styleId"]: id};
        this.save();
        this.update({});
    }

    speak(text: string, onEnd: () => void, context?: Omit<SpeechLine, "text">) {
        return this.play([{text, ...context}], onEnd);
    }

    play(lines: SpeechLine[], onEnd: () => void) {
        this.cancelPlayback();
        if (typeof window === "undefined" || !lines.length) return false;
        this.restoreEngine = false;
        if (this.state.engine === "device" && (!this.voices.length || !("speechSynthesis" in window))) {
            this.update({notice: this.state.deviceStatus === "loading" ? "ui.speechLoading" : "ui.speechNoJapanese"});
            return false;
        }
        // Construct the media element during the user gesture; playback rejection is reported.
        if (this.state.engine === "voicevox") this.audio = new window.Audio();
        this.completion = onEnd;
        const token = this.generation;
        this.update({playing: true, notice: ""});
        const next = (index: number) => {
            if (token !== this.generation) return;
            if (index === lines.length) {
                this.cancelPlayback();
                return;
            }
            this.readLine(lines[index], token, () => next(index + 1));
        };
        next(0);
        return this.state.playing;
    }

    stop() {
        this.cancelPlayback();
    }

    private update(patch: Partial<SpeechState>) {
        this.state = {...this.state, ...patch};
        this.listeners.forEach(listener => listener());
    }

    private save() {
        try {
            if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch {
            this.update({notice: "ui.speechStorageError"});
        }
    }

    private readLine(line: SpeechLine, token: number, onEnd: () => void) {
        const text = line.text.replace(/\[([^:\]]+):([^\]]+)\]/g, "$2");
        const roleId = line.role ? this.roleVoice(line.lessonId ?? "", line.role) : "";
        if (this.state.engine === "device") {
            const voice = this.voices.find(v => v.voiceURI === (roleId || this.state.selectedDevice));
            if (!voice) {
                this.fail(token, "ui.speechNoJapanese");
                return;
            }
            try {
                const utterance = new window.SpeechSynthesisUtterance(text);
                this.utterance = utterance;
                utterance.voice = voice;
                utterance.lang = voice.lang;
                utterance.rate = this.state.rate;
                utterance.onend = () => {
                    if (token === this.generation) onEnd();
                };
                utterance.onerror = () => this.fail(token, "ui.speechFailed");
                window.speechSynthesis.speak(utterance);
            } catch {
                this.fail(token, "ui.speechFailed");
            }
        } else void this.readVoicevox(text, roleId || this.state.selectedVoicevox, token, onEnd);
    }

    private async readVoicevox(text: string, styleId: string, token: number, onEnd: () => void) {
        const controller = new AbortController();
        this.request = controller;
        const timeout = setTimeout(() => controller.abort(), 30000);
        const base = this.state.engineUrl || ENGINE_URLS[0];
        try {
            const query = await fetch(base + "/audio_query?" + new URLSearchParams({text, speaker: styleId}),
                {method: "POST", signal: controller.signal});
            if (!query.ok) throw Error("query");
            const body = await query.json();
            if (token !== this.generation || controller.signal.aborted) return;
            // The engine takes speed as a scale factor, the same number the device
            // voices use as their rate, so one slider drives both.
            if (body && typeof body === "object") body.speedScale = this.state.rate;
            const response = await fetch(base + "/synthesis?" + new URLSearchParams({speaker: styleId}),
                {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
            if (!response.ok) throw Error("synthesis");
            const blob = await response.blob();
            if (token !== this.generation) return;
            this.releaseAudioUrl();
            this.audioUrl = URL.createObjectURL(blob);
            const audio = this.audio!;
            audio.src = this.audioUrl;
            audio.onended = () => {
                if (token === this.generation) onEnd();
            };
            audio.onerror = () => this.fail(token, "ui.voicevoxPlaybackFailed");
            await audio.play();
        } catch {
            this.fail(token, "ui.voicevoxPlaybackFailed");
        } finally {
            clearTimeout(timeout);
            if (this.request === controller) this.request = undefined;
        }
    }

    private fail(token: number, notice: string) {
        if (token !== this.generation) return;
        this.cancelPlayback();
        this.update({notice});
    }

    private releaseAudioUrl() {
        if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
        this.audioUrl = undefined;
    }

    private cancelPlayback() {
        this.generation++;
        this.request?.abort();
        this.request = undefined;
        if (this.utterance) {
            this.utterance.onend = null;
            this.utterance.onerror = null;
            this.utterance = undefined;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
        if (this.audio) {
            this.audio.onended = null;
            this.audio.onerror = null;
            this.audio.pause();
            this.audio.removeAttribute("src");
            this.audio.load();
            this.audio = undefined;
        }
        this.releaseAudioUrl();
        const completion = this.completion;
        this.completion = undefined;
        this.update({playing: false});
        completion?.();
    }
}
