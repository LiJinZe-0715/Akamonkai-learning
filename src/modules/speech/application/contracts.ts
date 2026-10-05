import type { SpeechLine } from "../domain/dialogue";
export type { SpeechLine } from "../domain/dialogue";
export type SpeechEngine = "device" | "voicevox";
export interface SpeechVoice { id: string; name: string; local?: boolean; lang?: string; }
export interface SpeechState {
  engine: SpeechEngine;
  deviceVoices: SpeechVoice[];
  voicevoxVoices: SpeechVoice[];
  selectedDevice: string;
  selectedVoicevox: string;
  deviceStatus: "loading" | "ready" | "empty" | "unsupported";
  detecting: boolean;
  playing: boolean;
  notice: string;
}
export interface SpeechUseCases {
  initialize(): () => void;
  subscribe(listener: () => void): () => void;
  snapshot(): SpeechState;
  detectVoicevox(): Promise<void>;
  selectEngine(engine: SpeechEngine): void;
  selectVoice(id: string): void;
  roleVoice(lessonId: string, role: string): string;
  setRoleVoice(lessonId: string, role: string, id: string): void;
  speak(text: string, onEnd: () => void, context?: Omit<SpeechLine, "text">): boolean;
  play(lines: SpeechLine[], onEnd: () => void): boolean;
  stop(): void;
}
