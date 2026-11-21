/**
 * 站点媒体地址。
 *
 * App 的页面源是 appassets.androidplatform.net，相对路径会指向包里没有的资源，
 * 所以音频（真题听力、教材本文录音）统一从 Pages 取。与 scripts/android-html.mjs
 * 的 media-src、version.json 的 apkUrl 同源，由 scripts/suites/android.mjs 守住。
 */
export const SITE_MEDIA_BASE = "https://lijinze-0715.github.io/Akamonkai-learning/";

/** 网页端用站点内相对路径，App 壳内拼成站点绝对地址。 */
export function siteMediaUrl(relative: string): string {
    const inShell = typeof window !== "undefined" && "akamonkaiAndroid" in window;
    return inShell ? SITE_MEDIA_BASE + relative : relative;
}
