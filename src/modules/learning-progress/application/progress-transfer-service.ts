import type {Progress} from "../domain/progress";
import type {ImportOutcome, ProgressTransferUseCases, ProgressUseCases} from "./contracts";
import type {ProgressFileStore} from "./ports";

/** 进度文件正常只有几十 KB；2 MB 已经远超任何合理备份，超过多半是选错了文件。 */
const maxImportBytes = 2_000_000;

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
        let serialized: string;
        try {
            if (this.files.size(file) > maxImportBytes) return {status: "invalid-file", reason: "too-large"};
            serialized = await this.files.read(file);
        } catch {
            // 选中的不是文件，或者读的过程中断了：对用户都是「这份文件打不开」。
            return {status: "invalid-file", reason: "unreadable"};
        }
        try {
            return {
                status: "imported",
                progress: this.progress.import(serialized, typeof existing === "function" ? existing() : existing)
            };
        } catch {
            // 能打开但不是本应用的备份：JSON 语法坏了，或者字段校验没过。
            // 这里不退化成抛异常——导入是用户操作，失败只该换一句提示，不该炸页面。
            return {status: "invalid-file", reason: "not-progress"};
        }
    }
}
