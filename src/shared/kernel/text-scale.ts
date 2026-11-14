/**
 * 全站文字倍率。
 *
 * 每个字号在 CSS 里都是 calc(基准px * var(--font-scale))，所以调这一个数
 * 就等于整站放大/缩小，行距、栏宽、分隔线都按同一比例走。
 */
/** 25% 到 250%，25% 一档：10 个停点，拖起来有明确的落点。 */
export const textScaleRange = {min: 0.25, max: 2.5, step: 0.25} as const;

/** 收到手滑的输入也只会落在范围内，且对齐到 25% 的格子。 */
export function clampTextScale(value: number) {
    if (!Number.isFinite(value)) return 1;
    const stepped = Math.round(value / textScaleRange.step) * textScaleRange.step;
    return Math.min(textScaleRange.max, Math.max(textScaleRange.min, Number(stepped.toFixed(2))));
}
