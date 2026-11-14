import type {DraftRepository} from "../application/ports";

const prefix = "akamonkai.assessment-draft.v1:";
const storageKeyFor = (key: string) => prefix + key;

export class BrowserDraftRepository implements DraftRepository {
    read(key: string): unknown {
        try {
            return JSON.parse(localStorage.getItem(storageKeyFor(key)) ?? "null");
        } catch {
            return null;
        }
    }

    write(key: string, value: unknown): boolean {
        try {
            localStorage.setItem(storageKeyFor(key), JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    removeAll(): boolean {
        try {
            // 先收集再删：边遍历边删会让 localStorage.key(i) 的下标错位。
            const keys: string[] = [];
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (key?.startsWith(prefix)) keys.push(key);
            }
            keys.forEach(key => localStorage.removeItem(key));
            return true;
        } catch {
            return false;
        }
    }

    remove(key: string): boolean {
        try {
            localStorage.removeItem(storageKeyFor(key));
            return true;
        } catch {
            return false;
        }
    }
}
