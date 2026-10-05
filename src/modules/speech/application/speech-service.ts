import type { SpeechEngine, SpeechLine, SpeechUseCases } from "./contracts";
import type { SpeechPort } from "./ports";

export class SpeechService implements SpeechUseCases {
  constructor(private port: SpeechPort) {}
  initialize() { return this.port.initialize(); }
  subscribe(listener: () => void) { return this.port.subscribe(listener); }
  snapshot() { return this.port.snapshot(); }
  detectVoicevox() { return this.port.detectVoicevox(); }
  selectEngine(engine: SpeechEngine) { this.port.selectEngine(engine); }
  selectVoice(id: string) { this.port.selectVoice(id); }
  roleVoice(lessonId: string, role: string) { return this.port.roleVoice(lessonId, role); }
  setRoleVoice(lessonId: string, role: string, id: string) { this.port.setRoleVoice(lessonId, role, id); }
  speak(text: string, onEnd: () => void, context?: Omit<SpeechLine, "text">) {
    return this.port.speak(text, onEnd, context);
  }
  play(lines: SpeechLine[], onEnd: () => void) { return this.port.play(lines, onEnd); }
  stop() { this.port.stop(); }
}
