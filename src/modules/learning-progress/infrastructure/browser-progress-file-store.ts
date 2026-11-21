import type {ProgressFileStore} from "../application/ports";

export class BrowserProgressFileStore implements ProgressFileStore {
    size(file: unknown): number {
        return this.selectedFile(file).size;
    }

    read(file: unknown): Promise<string> {
        return this.selectedFile(file).text();
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

    private selectedFile(value: unknown): File {
        if (!(value instanceof File)) throw new Error("Invalid progress file");
        return value;
    }
}
