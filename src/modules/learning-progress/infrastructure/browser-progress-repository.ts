import type {ProgressRepository} from "../application/ports";
import {type Progress, validateProgress} from "../domain/progress";

const progressKey = "akamonkai.progress.v1", recoveryKey = "akamonkai.progress.recovery.v1";

export class BrowserProgressRepository implements ProgressRepository {
    /** 本标签页最近一次检查过的取值结论，写入时不必重复解析。 */
    private inspected?: { raw: string; valid: boolean };

    read(): unknown {
        try {
            const raw = localStorage.getItem(progressKey);
            if (raw === null) return null;
            try {
                return JSON.parse(raw);
            } catch {
                return raw;
            }
        } catch {
            return undefined;
        }
    }

    write(progress: Progress) {
        try {
            const serialized = JSON.stringify(progress);
            const original = localStorage.getItem(progressKey);
            if (original !== null && original !== serialized && !this.isStoredValid(original))
                localStorage.setItem(recoveryKey, original);
            localStorage.setItem(progressKey, serialized);
            this.inspected = {raw: serialized, valid: true};
            return true;
        } catch {
            return false;
        }
    }

    private isStoredValid(raw: string) {
        if (this.inspected?.raw === raw) return this.inspected.valid;
        let valid = false;
        try {
            valid = validateProgress(JSON.parse(raw));
        } catch { /* 损坏的 JSON 原样保留。 */
        }
        this.inspected = {raw, valid};
        return valid;
    }

    async exclusive<T>(task: (writable: boolean) => T): Promise<T> {
        if (typeof navigator !== "undefined" && navigator.locks)
            return navigator.locks.request(progressKey, () => task(true));
        // 浏览器无法保证跨标签页写入安全时，仍保留内存里的学习与导出。
        return task(false);
    }

    subscribe(listener: () => void): () => void {
        if (typeof window === "undefined") return () => {
        };
        const changed = (event: StorageEvent) => {
            if (event.storageArea === window.localStorage && (event.key === progressKey || event.key === null)) listener();
        };
        window.addEventListener("storage", changed);
        return () => window.removeEventListener("storage", changed);
    }

    recovery(): string | undefined {
        try {
            const current = localStorage.getItem(progressKey);
            if (current !== null && !validateProgress(this.read())) return current;
            return localStorage.getItem(recoveryKey) ?? undefined;
        } catch {
            return undefined;
        }
    }
}
