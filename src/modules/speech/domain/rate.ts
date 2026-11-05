/** 朗读速度，作为 `rate` 传给设备声音。 */
export const speechRate = {min: 0.5, max: 1.5, step: 0.05, default: 1} as const;

/**
 * 句与句之间额外的停顿（毫秒），加在引擎按句号给的停顿之外。0 就是不加。
 */
export const speechPause = {min: 0, max: 5000, step: 50, default: 0} as const;

/** 把保存的或拖出来的停顿收进范围，并对齐到 50 毫秒一格。 */
export function clampSpeechPause(value: number): number {
    if (!Number.isFinite(value)) return speechPause.default;
    const clamped = Math.min(speechPause.max, Math.max(speechPause.min, value));
    return Math.round(clamped / speechPause.step) * speechPause.step;
}

/** 把存下来的或手输的速度限制在滑杆范围内。 */
export function clampSpeechRate(value: number): number {
    if (!Number.isFinite(value)) return speechRate.default;
    return Math.round(Math.min(speechRate.max, Math.max(speechRate.min, value)) * 100) / 100;
}
