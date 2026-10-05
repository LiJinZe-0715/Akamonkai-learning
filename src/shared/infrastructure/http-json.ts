export type JsonReader = (path: string) => Promise<unknown>;
export async function readJson(path: string, timeoutMs = 15000): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Content request timed out")); }, timeoutMs);
    });
    const request = fetch(path.replace(/^\/+/, ""), { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Content could not be loaded");
      return response.json();
    });
    return await Promise.race([request, timeout]);
  } finally { clearTimeout(timer); }
}
