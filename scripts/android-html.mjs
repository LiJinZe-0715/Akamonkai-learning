/**
 * 注入到 APK 内每个 HTML 的 <head>。
 *
 * script-src 只允许本站与内联（index.html 的首屏主题脚本必须内联），connect-src 只允许
 * 本站：内容 JSON、version.json 都是同源请求，没有任何跨域调用。style-src 故意不设，
 * 因为 React 的 style 属性需要它保持默认。
 *
 * 注入有两类失败是"静默"的：正则没命中（页面照常发布，只是没有 CSP）、重复注入（叠加
 * 出两个 CSP 与两次 bridge 脚本）。所以这里既做幂等，也在返回前断言标记真的写进去了。
 */
export const injectedHead = '<meta http-equiv="Content-Security-Policy" content="frame-src \'none\'; object-src \'none\'; base-uri \'self\'; script-src \'self\' \'unsafe-inline\'; connect-src \'self\'">'
    + '<style>[data-android-download]{display:none!important}</style>'
    + '<script src="/native-bridge.js"></script>';

export const injectedMarker = "data-android-download]{display:none";

export function injectAndroidHead(html, file = "index.html") {
    if (!/<head(?:\s[^>]*)?>/i.test(html)) throw new Error(`Missing head: ${file}`);
    if (html.includes(injectedMarker)) return html;
    const next = html.replace(/<head(?:\s[^>]*)?>/i, (tag) => tag + injectedHead);
    if (!next.includes(injectedMarker) || !next.includes('src="/native-bridge.js"'))
        throw new Error(`Android head injection failed: ${file}`);
    return next;
}