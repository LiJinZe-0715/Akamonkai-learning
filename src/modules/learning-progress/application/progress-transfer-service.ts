import type {Progress} from "../domain/progress";
import type {ImportOutcome, ProgressTransferUseCases, ProgressUseCases} from "./contracts";
import type {ProgressFileStore} from "./ports";

export class ProgressTransferService implements ProgressTransferUseCases {
    constructor(private readonly progress: ProgressUseCases, private readonly files: ProgressFileStore) {
    }

    export(progress: Progress): void {
        this.files.download(this.progress.export(progress));
    }

    exportRecovery(): void {
        const original = this.progress.recovery();
        if (original !== undefined) this.files.download(original, "akamonkai-progress-recovery.json");
    }

    async import(file: unknown, existing: Progress | (() => Progress)): Promise<ImportOutcome> {
        try {
            if (this.files.size(file) > 2e6) return {status: "invalid-file"};
            const serialized = await this.files.read(file);
            return {
                status: "imported",
                progress: this.progress.import(serialized, typeof existing === "function" ? existing() : existing)
            };
        } catch {
            return {status: "invalid-file"};
        }
    }
}
