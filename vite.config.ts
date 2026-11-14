import {createHash} from "node:crypto";
import {existsSync, readdirSync, readFileSync} from "node:fs";
import path from "node:path";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

/** public/content 的指纹：文件名 + 字节。内容一变它就变，运行时拿它给 JSON 请求破缓存。 */
function contentVersion(folder = path.resolve("public/content")) {
    if (!existsSync(folder)) return "";
    const hash = createHash("sha256");
    const walk = (directory: string, prefix: string) => {
        for (const entry of readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            const relative = prefix + entry.name;
            if (entry.isDirectory()) walk(path.join(directory, entry.name), relative + "/");
            else hash.update(relative).update("\0").update(readFileSync(path.join(directory, entry.name)));
        }
    };
    walk(folder, "");
    return hash.digest("hex").slice(0, 12);
}

export default defineConfig(({mode}) => ({
    base: mode === "production" ? "/Akamonkai-learning/" : "/",
    plugins: [react()],
    define: {__CONTENT_VERSION__: JSON.stringify(contentVersion())},
    build: {target: "es2022", emptyOutDir: true},
    server: {port: 4173},
}));
