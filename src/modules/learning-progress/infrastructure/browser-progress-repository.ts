import type { ProgressRepository } from "../application/ports";
import { validateProgress, type Progress } from "../domain/progress";
const key = "akamonkai.progress.v1", recoveryKey = "akamonkai.progress.recovery.v1";
export class BrowserProgressRepository implements ProgressRepository {
  read(): unknown {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch { return raw; }
    } catch {
      return undefined;
    }
  }
  write(p: Progress) {
    try {
      const original = localStorage.getItem(key);
      if (original !== null) {
        let valid = false;
        try { valid = validateProgress(JSON.parse(original)); } catch { /* Retain damaged JSON verbatim. */ }
        if (!valid) localStorage.setItem(recoveryKey, original);
      }
      localStorage.setItem(key, JSON.stringify(p));
      return true;
    } catch {
      return false;
    }
  }
  async exclusive<T>(task: (writable: boolean) => T): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(key, () => task(true));
    // Preserve in-memory study/export when the browser cannot protect cross-tab writes.
    return task(false);
  }
  subscribe(listener: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const changed = (event: StorageEvent) => { if (event.storageArea === window.localStorage && (event.key === key || event.key === null)) listener(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }
  recovery(): string | undefined {
    try {
      const current = localStorage.getItem(key);
      if (current !== null && !validateProgress(this.read())) return current;
      return localStorage.getItem(recoveryKey) ?? undefined;
    } catch { return undefined; }
  }
}
