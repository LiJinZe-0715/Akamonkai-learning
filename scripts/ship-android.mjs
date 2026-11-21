import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLog} from './build-log.mjs';

/**
 * 一条命令走完「打包 → 写进 public/downloads → 暂存 APK 与 version.json」。
 *
 * 更新走 GitHub Pages 上的 public/downloads/Akamonkai-learning.apk，不再使用 Release，
 * 也不再维护 latest tag：APK 和 version.json 跟源码一起提交，push 即发布。
 *
 *   pnpm android:ship            打包 → 发布 → git add public/downloads/{apk,version.json}
 *   pnpm android:ship --verify   核对本地包与 version.json 是否一致
 *   pnpm android:ship --no-build 跳过打包，只重发已打好的包（调试用）
 *
 * 顺序不能反：先出包（产物），再写 version.json（记录产物），最后一起提交。
 * 这一次调起的几个脚本写同一份日志（logs/ship-android-*.log），出错时直接翻它。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const downloads = path.join(root, 'public/downloads');
const apk = path.join(downloads, 'Akamonkai-learning.apk');
const versionFile = path.join(downloads, 'version.json');
const args = process.argv.slice(2);
const log = createLog('ship-android');

const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const readVersion = () => JSON.parse(readFileSync(versionFile, 'utf8'));

/** 子脚本自己也写这份日志，输出直接交给终端，不再抄一遍。 */
const script = (name, extra = []) =>
    log.run(`"${process.execPath}" "${path.join(root, 'scripts', name)}" ${extra.join(' ')}`.trim(), {cwd: root, tee: false});

async function verify() {
    await log.step('核对本地包与 version.json', () => {
        if (!existsSync(apk)) throw Error(`找不到 ${path.relative(root, apk)}，先跑 pnpm android:build`);
        const version = readVersion();
        const local = sha256(apk);
        log.info(`本地包：      ${local}`);
        log.info(`version.json：${version.sha256}`);
        log.info(`apkUrl：      ${version.apkUrl}`);
        if (local !== version.sha256) throw Error('本地包与 version.json 的 sha256 不一致，请重新跑 pnpm android:ship');
        if (!String(version.apkUrl ?? '').endsWith('/downloads/Akamonkai-learning.apk'))
            throw Error('version.json 的 apkUrl 不是 Pages 下载地址');
    });
    // 签名证书与「包是不是当前源码打的」：重新编一份网页逐文件比。
    await log.step('核对签名证书与网页文件', () => script('verify-apk.mjs', ['--strict']));
}

async function ship() {
    // 把 build-android 认得的 flag 透传下去，否则 --new-signing-key 在 ship 里会被吞掉。
    const buildFlags = ['--then-publish'];
    if (args.includes('--new-signing-key')) buildFlags.push('--new-signing-key');
    if (!args.includes('--no-build')) await log.step('打包 APK', () => script('build-android.mjs', buildFlags));
    await log.step('发布到 public/downloads', () => script('publish-android.mjs'));
    await log.step('暂存 APK 与 version.json', () =>
        log.run(`git add "${path.relative(root, apk)}" "${path.relative(root, versionFile)}"`, {cwd: root}));
    const version = readVersion();
    log.info('\n下一步：git commit && git push');
    log.info('  APK 与 version.json 已暂存，会随这一次 push 一起上线；CI 用仓库里的包校验 version.json。');
    log.info('  核对：pnpm android:ship --verify');
    log.info(`  本版 sha256：${version.sha256}`);
    log.info(`  日志：${path.relative(root, log.file)}`);
}

if (args.includes('--verify')) await verify();
else await ship();
