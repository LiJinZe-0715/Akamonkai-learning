/** 共用的自称呼别名保留原有的持久化角色键；其他角色归属各自课次。 */
export function roleVoiceKey(lessonId: string, role: string): string {
    const self = /^(我|私|わたし|僕|me)$/i.test(role);
    return JSON.stringify([self ? "shared" : lessonId, self ? "me" : role]);
}
