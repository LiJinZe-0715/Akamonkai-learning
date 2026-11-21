import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLog} from './build-log.mjs';
import {
    assetName,
    contentType,
    createManifest,
    downloadUrl,
    mediaPathPattern,
    planPull,
    planUpload,
    validateManifest,
} from './media-manifest.mjs';

/**
 * 资源命令行：public/media/ 不入库，由 data/media/manifest.json 记录，
 * 文件本体存在 GitHub 发布页 resource。dev/build 之前先 pull 补齐。
 *
 *   node scripts/media.mjs manifest             扫描本地生成清单
 *   node scripts/media.mjs pull [--quiet]       按清单下载缺失资源
 *   node scripts/media.mjs verify               全量重算哈希比对清单
 *   node scripts/media.mjs publish [--dry-run]  上传新增/替换的资源到发布页
 *
 * 哈希缓存在 node_modules/.cache/（bytes + mtimeMs 没变就不重算），
 * 不能放进 public/，否则会被 vite 拷进网站和 APK。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = createLog('media');

const mediaRoot = path.join(root, 'public', 'media');
const manifestFile = path.join(root, 'data', 'media', 'manifest.json');
const cacheFile = path.join(root, 'node_modules/.cache/akamonkai-media.json');
const defaultRepository = 'LiJinZe-0715/Akamonkai-learning';
const defaultRelease = 'resource';

const arguments_ = process.argv.slice(2);
const command = arguments_[0];
const flags = new Set(arguments_.slice(1).filter(item => item.startsWith('--')));

const diskPath = relative => path.join(root, 'public', relative);
const megabytes = bytes => (bytes / 2 ** 20).toFixed(1) + ' MB';
const sha256Of = buffer => createHash('sha256').update(buffer).digest('hex');

function usage() {
    console.error('用法：node scripts/media.mjs <子命令> [选项]');
    console.error('  manifest             扫描 public/media/，生成 data/media/manifest.json');
    console.error('  pull [--quiet]       按清单下载缺失资源（最多 3 个并发）');
    console.error('  verify               忽略缓存全量重算哈希，与清单比对');
    console.error('  publish [--dry-run]  上传新增/替换的资源到 GitHub 发布页');
    process.exit(1);
}

/* ── 哈希缓存 ─────────────────────────────────────────────── */

function readCache() {
    try {
        return JSON.parse(readFileSync(cacheFile, 'utf8'));
    } catch {
        return {};
    }
}

function saveCache(cache) {
    mkdirSync(path.dirname(cacheFile), {recursive: true});
    writeFileSync(cacheFile, JSON.stringify(cache));
}

/** 遍历 public/media/：跳过隐藏文件，不合规则的文件警告后跳过。 */
function scanMedia() {
    const files = [];
    const walk = folder => {
        for (const entry of readdirSync(folder, {withFileTypes: true})) {
            if (entry.name.startsWith('.')) continue;
            const full = path.join(folder, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!entry.isFile()) continue;
            const relative = 'media/' + path.relative(mediaRoot, full).replaceAll('\\', '/');
            if (!mediaPathPattern.test(relative)) {
                log.warn(`跳过不符合规则的文件：${relative}`);
                continue;
            }
            files.push(relative);
        }
    };
    if (existsSync(mediaRoot)) walk(mediaRoot);
    return files.sort();
}

/** 本地文件的 sha256。bytes 和 mtimeMs 都没变就用缓存；verify 传 useCache: false 全量重算。 */
function localHashes(files, {useCache = true} = {}) {
    const cache = readCache();
    const result = {};
    let changed = false;
    for (const relative of files) {
        const stat = statSync(diskPath(relative));
        const cached = cache[relative];
        if (useCache && cached && cached.bytes === stat.size && cached.mtimeMs === stat.mtimeMs) {
            result[relative] = {sha256: cached.sha256};
            continue;
        }
        const sha256 = sha256Of(readFileSync(diskPath(relative)));
        result[relative] = {sha256};
        cache[relative] = {bytes: stat.size, mtimeMs: stat.mtimeMs, sha256};
        changed = true;
    }
    if (changed) saveCache(cache);
    return result;
}

/* ── 清单 ─────────────────────────────────────────────────── */

function loadManifest() {
    if (!existsSync(manifestFile))
        throw new Error(`清单不存在：${path.relative(root, manifestFile)}，请先运行 node scripts/media.mjs manifest`);
    let value;
    try {
        value = JSON.parse(readFileSync(manifestFile, 'utf8'));
    } catch (error) {
        throw new Error(`清单不是合法 JSON：${error.message}`);
    }
    return validateManifest(value);
}

/** 扫描本地生成新清单（不写盘）。repository/release 沿用旧清单，没有就用默认值。 */
function buildManifest() {
    const files = scanMedia();
    const hashes = localHashes(files);
    let repository = defaultRepository;
    let release = defaultRelease;
    if (existsSync(manifestFile)) {
        try {
            const old = JSON.parse(readFileSync(manifestFile, 'utf8'));
            repository = old.repository ?? repository;
            release = old.release ?? release;
        } catch {
            log.warn('旧清单读不出来，repository/release 用默认值');
        }
    }
    return createManifest({
        repository,
        release,
        files: files.map(relative => ({
            path: relative,
            bytes: statSync(diskPath(relative)).size,
            sha256: hashes[relative].sha256,
        })),
    });
}

function writeManifest(manifest) {
    mkdirSync(path.dirname(manifestFile), {recursive: true});
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
}

/* ── 网络 ─────────────────────────────────────────────────── */

const apiHeaders = token => ({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
});

/** 令牌顺序：GITHUB_TOKEN → GH_TOKEN → gh auth token。绝不打印、绝不写盘。 */
function resolveToken({required}) {
    const fromEnvironment = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (fromEnvironment) return fromEnvironment;
    const gh = spawnSync('gh', ['auth', 'token'], {encoding: 'utf8', windowsHide: true});
    if (!gh.error && gh.status === 0 && gh.stdout.trim()) return gh.stdout.trim();
    if (required)
        throw new Error('缺少 GitHub 令牌：设置 GITHUB_TOKEN，或安装 GitHub CLI 后运行 gh auth login');
    return null;
}

async function fetchRelease(manifest, token) {
    const url = `https://api.github.com/repos/${manifest.repository}/releases/tags/${manifest.release}`;
    const response = await fetch(url, {headers: apiHeaders(token)});
    if (!response.ok)
        throw new Error(`读取发布页失败（HTTP ${response.status}）：${manifest.repository} 的 ${manifest.release}`);
    return response.json();
}

async function retryOnce(label, task) {
    try {
        return await task();
    } catch (first) {
        log.warn(`${label}失败（${first.message}），重试一次`);
        return task();
    }
}

/* ── 子命令 ───────────────────────────────────────────────── */

async function pull() {
    const quiet = flags.has('--quiet');
    const manifest = loadManifest();
    const local = localHashes(scanMedia());
    const plan = planPull(manifest, local);
    if (plan.extra.length)
        log.warn(`本地有 ${plan.extra.length} 个文件不在清单里（不删除）：${plan.extra.join('、')}`);
    const total = Object.keys(manifest.files).length;
    if (!plan.download.length) {
        if (!quiet) log.info(`资源齐全（${total} 个）`);
        return;
    }

    log.info(`需要下载 ${plan.download.length}/${total} 个资源`);
    const queue = [...plan.download];
    const failures = [];
    const worker = async () => {
        while (queue.length) {
            const relative = queue.shift();
            try {
                await retryOnce(`下载 ${relative}`, () => downloadOne(manifest, relative));
            } catch (error) {
                failures.push({relative, reason: error.message});
            }
        }
    };
    await Promise.all(Array.from({length: Math.min(3, queue.length)}, worker));

    if (failures.length) {
        for (const {relative, reason} of failures) log.warn(`✗ ${relative}：${reason}`);
        log.warn(`共 ${failures.length} 个资源下载失败，网站会缺文件，构建中止`);
        process.exitCode = 1;
        return;
    }
    log.info(`下载完成（${plan.download.length} 个），资源齐全（${total} 个）`);
}

/** 单个文件：先写 .part，字节数和 sha256 都对才改名，并更新缓存。 */
async function downloadOne(manifest, relative) {
    const expected = manifest.files[relative];
    const target = diskPath(relative);
    const temp = target + '.part';
    mkdirSync(path.dirname(target), {recursive: true});
    try {
        const response = await fetch(downloadUrl(manifest, relative));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(temp, buffer);
        if (buffer.length !== expected.bytes)
            throw new Error(`字节数不符：期望 ${expected.bytes}，实际 ${buffer.length}`);
        const sha256 = sha256Of(buffer);
        if (sha256 !== expected.sha256) throw new Error('sha256 与清单不符');
        renameSync(temp, target);
        const stat = statSync(target);
        const cache = readCache();
        cache[relative] = {bytes: stat.size, mtimeMs: stat.mtimeMs, sha256};
        saveCache(cache);
        log.info(`↓ ${relative}  ${megabytes(expected.bytes)}`);
    } catch (error) {
        rmSync(temp, {force: true});
        throw error;
    }
}

function verify() {
    const manifest = loadManifest();
    const local = localHashes(scanMedia(), {useCache: false});
    const problems = [];
    for (const [relative, entry] of Object.entries(manifest.files)) {
        const mine = local[relative];
        if (!mine) problems.push(`缺失：${relative}`);
        else if (mine.sha256 !== entry.sha256) problems.push(`哈希不一致：${relative}`);
    }
    for (const relative of Object.keys(local))
        if (!manifest.files[relative]) problems.push(`多余：${relative}`);
    if (problems.length) {
        for (const problem of problems) log.warn(`✗ ${problem}`);
        log.warn(`共 ${problems.length} 处与清单不符`);
        process.exitCode = 1;
        return;
    }
    log.info(`校验通过（${Object.keys(manifest.files).length} 个，与清单完全一致）`);
}

async function publish() {
    const dryRun = flags.has('--dry-run');
    const manifest = buildManifest();
    const token = resolveToken({required: false});
    const release = await fetchRelease(manifest, token);
    const remote = release.assets.map(({id, name, size, digest}) => ({id, name, size, digest}));
    const plan = planUpload(manifest, remote);

    log.info(`发布计划：上传 ${plan.upload.length} 个、替换 ${plan.replace.length} 个、保留 ${plan.keep.length} 个`);
    for (const relative of plan.upload) log.info(`  上传 ${relative}`);
    for (const {path: relative} of plan.replace) log.info(`  替换 ${relative}`);
    if (plan.extra.length)
        log.warn(`发布页多出 ${plan.extra.length} 个附件（绝不删除）：${plan.extra.join('、')}`);
    if (dryRun) {
        log.info('（dry-run：只列计划，没有上传，也没有写清单）');
        return;
    }
    const uploadToken = resolveToken({required: true});
    const uploadAsset = async relative => {
        const name = assetName(relative);
        const url = `https://uploads.github.com/repos/${manifest.repository}/releases/${release.id}`
            + `/assets?name=${encodeURIComponent(name)}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {...apiHeaders(uploadToken), 'Content-Type': contentType(relative)},
            body: readFileSync(diskPath(relative)),
        });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}：${(await response.text()).slice(0, 200)}`);
        log.info(`↑ ${name}  ${megabytes(statSync(diskPath(relative)).size)}`);
    };

    for (const relative of plan.upload)
        await retryOnce(`上传 ${relative}`, () => uploadAsset(relative));
    for (const {path: relative, assetId} of plan.replace) {
        const removed = await fetch(
            `https://api.github.com/repos/${manifest.repository}/releases/assets/${assetId}`,
            {method: 'DELETE', headers: apiHeaders(uploadToken)},
        );
        if (!removed.ok && removed.status !== 404)
            throw new Error(`删除旧附件失败（HTTP ${removed.status}）：${relative}`);
        await retryOnce(`上传 ${relative}`, () => uploadAsset(relative));
    }

    const after = await fetchRelease(manifest, uploadToken);
    const byName = new Map(after.assets.map(asset => [asset.name, asset]));
    const problems = [];
    for (const [relative, entry] of Object.entries(manifest.files)) {
        const asset = byName.get(assetName(relative));
        if (!asset) problems.push(`发布页缺少附件：${relative}`);
        else if (asset.digest !== `sha256:${entry.sha256}`) problems.push(`附件 digest 与清单不符：${relative}`);
    }
    if (problems.length) {
        for (const problem of problems) log.warn(`✗ ${problem}`);
        throw new Error('发布页复核未通过，清单没有写盘');
    }
    writeManifest(manifest);
    log.info(`发布完成，清单已更新（${Object.keys(manifest.files).length} 个资源）`);
}

if (command === 'manifest') {
    const manifest = buildManifest();
    writeManifest(manifest);
    log.info(`清单已生成：${path.relative(root, manifestFile)}（${Object.keys(manifest.files).length} 个资源）`);
} else if (command === 'pull') {
    await pull();
} else if (command === 'verify') {
    verify();
} else if (command === 'publish') {
    await publish();
} else {
    usage();
}