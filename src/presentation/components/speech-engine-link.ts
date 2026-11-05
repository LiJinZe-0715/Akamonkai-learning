import type {UiTextId} from "../../modules/localization/public";
/**
 * 怎么给设备装上日语声音。
 *
 * 页面不自带、也不启动任何引擎，只读系统已经报出来的声音。各平台缺日语的
 * 原因不同——手机通常根本没有日语 TTS 引擎，Windows 则自带一个听着很机械的
 * ——所以各有各的安装方式。
 *
 * 链接写成空字符串就不会在页面上生成按钮，撤下的链接不会变成死链。
 */
export const androidEngineUrl = "https://github.com/LiJinZe-0715/TTS-Japanese/releases/download/1.0/VoiceVox_TTS.apk";
export const windowsEngineUrl = "https://github.com/LiJinZe-0715/SAPI-Japanese/releases/download/1.0.0/VoicevoxSapiSetup.exe";

/** 把下载变成可用声音的操作指引。 */
export const engineGuideHref = "./?page=speech";

/** 手机端：Android 壳，或在手机浏览器里打开的网站。 */
export function phoneClient(): boolean {
    if (typeof window === "undefined") return false;
    if ("AndroidSpeech" in window) return true;
    return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Windows 桌面：唯一能把系统声音换成更好一个的平台。 */
export function desktopClient(): boolean {
    if (phoneClient()) return false;
    return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

/** Android 的「文字转语音」设置页：装引擎、选默认、下语音包都在这里。 */
export function openTtsSettings(): void {
    const bridge = (window as { akamonkaiAndroid?: { openTtsSettings(): void } }).akamonkaiAndroid;
    if (bridge?.openTtsSettings) {
        bridge.openTtsSettings();
        return;
    }
    // 手机浏览器没有桥，交给系统：Chrome 认 intent: 协议。
    window.location.href = "intent:#Intent;action=com.android.settings.TTS_SETTINGS;end";
}

/** 只有 Android 才有这一页。 */
export function ttsSettingsAvailable(): boolean {
    if (typeof window === "undefined") return false;
    if ("akamonkaiAndroid" in window) return true;
    return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/** 这台设备该给哪种安装方式；没有合适的就什么都不给。 */
export function engineOffer(): { url: string; label: UiTextId } | null {
    if (phoneClient()) return androidEngineUrl ? {url: androidEngineUrl, label: "ui.downloadEngineAndroid"} : null;
    if (desktopClient()) return windowsEngineUrl ? {url: windowsEngineUrl, label: "ui.downloadEngineWindows"} : null;
    return null;
}
