/**
 * Speaking speed, shared by every engine: the device voices take it as `rate`,
 * the VOICEVOX engine as `speedScale`. One number, so switching engines does not
 * silently change the pace.
 */
export const SPEECH_RATE = {min: 0.5, max: 1.5, step: 0.05, default: 1} as const;

/** Keeps a stored or typed speed inside the slider's range. */
export function clampSpeechRate(value: number): number {
    if (!Number.isFinite(value)) return SPEECH_RATE.default;
    return Math.round(Math.min(SPEECH_RATE.max, Math.max(SPEECH_RATE.min, value)) * 100) / 100;
}
