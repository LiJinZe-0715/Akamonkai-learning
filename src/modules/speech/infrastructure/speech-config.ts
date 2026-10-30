/**
 * Candidate addresses for a local VOICEVOX-compatible engine.
 *
 * 50021 is the VOICEVOX default. The others cover the common compatible engines
 * (AivisSpeech, COEIROINK's VOICEVOX mode, a second VOICEVOX instance), so a user
 * who changed the port does not have to touch any config. A manually entered
 * address always wins over this list.
 */
export const speechConfiguration = {
    engineUrls: ["http://127.0.0.1:50021", "http://127.0.0.1:50022", "http://127.0.0.1:10101"],
    storageKey: "akamonkai-speech-v1",
} as const;
