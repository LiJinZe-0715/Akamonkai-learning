export type JsonReader = (path: string) => Promise<unknown>;

/**
 * Resolve against the document's directory, not against whatever the URL happens to end with.
 * `/app`, `/app/` and `/app/index.html` must all reach `/app/content/...`.
 */
function resolvePath(path: string) {
    const relative = path.replace(/^\/+/, "");
    if (typeof document === "undefined" || !document.baseURI) return relative;
    const base = new URL(document.baseURI);
    const current = base.pathname;
    if (!current.endsWith("/")) {
        // The browser resolves relatives against the parent of a slash-free URL, but such a URL
        // names a directory unless its last segment looks like a file.
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
        const request = fetch(resolvePath(path), {signal: controller.signal}).then(response => {
            if (!response.ok) throw new Error("Content could not be loaded");
            return response.json();
        });
        return await Promise.race([request, timeout]);
    } finally {
        clearTimeout(timer);
    }
}
