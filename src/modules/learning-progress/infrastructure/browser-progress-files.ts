import type {ProgressFilePort} from "../application/progress-transfer-service";

export class BrowserProgressFiles implements ProgressFilePort {
    size(value: unknown): number {
        return this.file(value).size;
    }

    read(value: unknown): Promise<string> {
        return this.file(value).text();
    }

    download(serialized: string, filename = "akamonkai-progress.json"): void {
        const url = URL.createObjectURL(new Blob([serialized], {type: "application/json"}));
        try {
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    private file(value: unknown): File {
        if (!(value instanceof File)) throw new Error("Invalid progress file");
        return value;
    }
}
