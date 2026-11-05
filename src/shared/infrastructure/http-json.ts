export type JsonReader = (path: string) => Promise<unknown>;

/** Vite 在构建期注入的内容指纹（见 vite.config.ts）；测试环境里没有它。 */
declare const __CONTENT_VERSION__: string | undefined;

/**
 * 内容 JSON 的文件名不带哈希，Pages 会缓存 10 分钟：发版后新 JS 可能拿到旧 JSON，
 * 解码器拒收就整页「加载失败」。带上内容指纹，内容一变 URL 就变。
 */
function withVersion(url: string) {
    const version = typeof __CONTENT_VERSION__ === "string" ? __CONTENT_VERSION__ : "";
    return version ? url + (url.includes("?") ? "&" : "?") + "v=" + version : url;
}

/**
 * 相对路径按文档所在目录解析，而不是按 URL 结尾的形式解析：
 * /app、/app/ 和 /app/index.html 都必须落到 /app/content/...。
 */
function resolvePath(path: string) {
    const relative = path.replace(/^\/+/, "");
    if (typeof document === "undefined" || !document.baseURI) return relative;
    const base = new URL(document.baseURI);
    const current = base.pathname;
    if (!current.endsWith("/")) {
        // 浏览器把相对路径按「不带斜杠的 URL 的父目录」解析，但这样的 URL
        // 只有在末段看起来像文件时才表示文件，否则它表示的是目录。
        const last = current.slice(current.lastIndexOf("/") + 1);
        base.pathname = last.includes(".") ? current.slice(0, current.lastIndexOf("/") + 1) : current + "/";
    }
    return new URL(relative, base).href;
}

export async function readJson(path: string, timeoutMs = 15000): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                controller.abort();
                reject(new Error("Content request timed out"));
            }, timeoutMs);
        });
        const request = fetch(withVersion(resolvePath(path)), {signal: controller.signal}).then(response => {
            if (!response.ok) throw new Error("Content could not be loaded");
            return response.json();
        });
        return await Promise.race([request, timeout]);
    } finally {
        clearTimeout(timer);
    }
}
