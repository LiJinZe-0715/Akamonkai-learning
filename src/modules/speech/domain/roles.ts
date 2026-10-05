export const sharedSpeakerRole = "我";
/** Shared self aliases retain the exact persisted role key; other roles belong to their lesson. */
export function roleVoiceKey(lessonId: string, role: string): string {
  const self = /^(我|私|わたし|僕|me)$/i.test(role);
  return JSON.stringify([self ? "shared" : lessonId, self ? "me" : role]);
}
