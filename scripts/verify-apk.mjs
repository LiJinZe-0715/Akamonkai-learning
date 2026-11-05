import {existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compareWithBuild, signingCertificates} from "./apk-file.mjs";
import {createLog} from "./build-log.mjs";

/**
 * 仓库里的 APK 是不是当前源码打出来的、是不是那把钥匙签的。
 *
 *   node scripts/verify-apk.mjs --dist=dist   拿现成的 dist 比（CI：pnpm build 之后）
 *   node scripts/verify-apk.mjs               自己编内容、vite build 到临时目录再比
 *   --strict                                  网页比包新也算失败
 *
 * 签名证书对不上永远是失败：换了钥匙，已装的设备无法覆盖安装，只能卸载、丢记录。
 * 网页比包新默认只警告：网站可以先上线，App 等下一次 android:ship 再跟上。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apkFile = path.join(root, "public/downloads/Akamonkai-learning.apk");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const distArgument = args.find(arg => arg.startsWith("--dist="))?.slice("--dist=".length);
const log = createLog("verify-apk");
/** CI 里加上 GitHub 的注解前缀，结果会挂在 Actions 页面上。 */
const annotate = (level, text) => log.info(process.env.GITHUB_ACTIONS ? `::${level}::${text}` : text);

if (!existsSync(apkFile)) {
    log.info(`跳过：${path.relative(root, apkFile)} 不存在`);
    process.exit(0);
}
const apk = readFileSync(apkFile);

await log.step("核对签名证书", () => {
    const pinned = JSON.parse(readFileSync(path.join(root, "android/release-signing.json"), "utf8")).certificateSha256;
    const certificates = signingCertificates(apk);
    if (!certificates.includes(pinned)) {
        const message = `APK 签名证书 ${certificates.map(item => item.slice(0, 8)).join(",")} 不是登记的 ${pinned.slice(0, 8)}`
            + "（android/release-signing.json）。已装的设备无法覆盖安装这个包。";
        annotate("error", message);
        throw Error(message);
    }
    log.info(`✓ 签名证书 ${pinned.slice(0, 8)} 与登记一致`);
});

let dist = distArgument ? path.resolve(root, distArgument) : null;
let temporary = null;
try {
    if (!dist) {
        temporary = mkdtempSync(path.join(tmpdir(), "akamonkai-verify-"));
        dist = temporary;
        // 以前这两步的输出直接丢掉，失败时只剩一句「命令失败」；现在照样打出来、记进日志。
        await log.step("重新编译内容", () => log.run(`"${process.execPath}" "${path.join(root, "scripts/build-content.mjs")}"`));
        await log.step("重新构建网页到临时目录", () => log.run(
            `"${process.execPath}" "${path.join(root, "node_modules/vite/bin/vite.js")}" build --outDir "${dist}" --emptyOutDir`));
    }
    await log.step("逐文件比对 APK 与当前构建", () => {
        const {compared, changed, missing, extra} = compareWithBuild(apk, dist);
        const problems = [
            ...missing.map(item => `包里缺 ${item}`),
            ...changed.map(item => `包里的 ${item} 与当前构建不同`),
            ...extra.map(item => `包里多出 ${item}`),
        ];
        if (!problems.length) {
            log.info(`✓ APK 内的 ${compared} 个网页文件与当前构建一致`);
            return;
        }
        const shown = problems.slice(0, 12).join("；") + (problems.length > 12 ? `；…共 ${problems.length} 处` : "");
        annotate(strict ? "error" : "warning", `APK 落后于当前源码（${problems.length} 处）：${shown}。`
            + "App 用户看不到这些改动，检查更新也不会提示；跑 pnpm android:ship 后一起提交。");
        if (strict) throw Error(`APK 落后于当前源码（${problems.length} 处）`);
    });
} finally {
    if (temporary) rmSync(temporary, {recursive: true, force: true});
}
