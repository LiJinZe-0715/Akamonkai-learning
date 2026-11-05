/**
 * 浏览器报出的声音里，哪些能读日语。
 *
 * 读日语的页面用不上英语或中文声音，放出来只会让人按错读音去听，
 * 所以引擎标成其他语言的声音，在给读者看之前就全部丢掉。
 *
 * 唯一的例外是引擎完全没标注语言的声音。Android 的 TTS 桥经常把
 * `lang` 报成空串，而它们往往是手机上唯一的日语声音：丢掉之后，
 * 一台只有日语的设备就只剩空列表。既然无法证明它们不是日语，就排在
 * 已标注的声音后面保留下来，并标成「未标注」而不是「日语」。
 */
const japaneseTag = /^ja(?:[-_]|$)/i;

export interface ReportedVoice {
    lang?: string;
}

/** 引擎明确说它是日语。 */
export function taggedJapanese(voice: ReportedVoice) {
    return japaneseTag.test((voice.lang ?? "").trim());
}

/** 引擎没说明语言，所以它仍可能是日语。 */
export function untagged(voice: ReportedVoice) {
    return !(voice.lang ?? "").trim();
}

/**
 * 值得列出来的声音，日语在前；组内保持引擎给出的顺序。
 *
 * 标成其他语言的声音一律排除——这是页面承诺过的过滤规则，
 * 读者按播放前不必再去核对语言后缀。
 */
export function japaneseVoices<T extends ReportedVoice>(voices: readonly T[]): T[] {
    return [...voices.filter(taggedJapanese), ...voices.filter(untagged)];
}
