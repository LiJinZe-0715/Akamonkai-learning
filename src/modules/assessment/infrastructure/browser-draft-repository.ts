import type { DraftRepository } from "../application/draft-service";
const storageKey = (key: string) => "akamonkai.assessment-draft.v1:" + key;
export class BrowserDraftRepository implements DraftRepository {
  read(key: string): unknown {
    try { return JSON.parse(localStorage.getItem(storageKey(key)) ?? "null"); } catch { return null; }
  }
  write(key: string, value: unknown): boolean {
    try { localStorage.setItem(storageKey(key), JSON.stringify(value)); return true; } catch { return false; }
  }
  remove(key: string): boolean {
    try { localStorage.removeItem(storageKey(key)); return true; } catch { return false; }
  }
}
