/**
 * 资源清单的纯逻辑：只做计算，不碰文件系统、不碰网络。
 *
 * 85 个固定资源从 public/media/ 移出 git，改存到 GitHub 发布页；上传与下载两边
 * 都靠这份入库的清单对齐。真正的读写与网络调用在 scripts/media.mjs，这里只导出
 * 它可以依赖的纯函数，所以不 import 任何 node: 模块。
 *
 * 附件不能带目录，发布页上的名字只能是路径最后一段（basename）。现有文件的
 * basename 互不相同，清单里一旦重名就等于两条资源抢同一个附件，必须报错。
 */

export const mediaPathPattern = /^media\/[a-z0-9./-]+\.(mp3|png|jpg|jpeg|webp)$/;

const sha256Pattern = /^[0-9a-f]{64}$/;
const repositoryPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const manifestKeys = ["repository", "release", "files"];
const entryKeys = ["bytes", "sha256"];
const fileKeys = ["path", ...entryKeys];

const contentTypes = new Map([
    ["mp3", "audio/mpeg"],
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
]);

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const extensionOf = relativePath => relativePath.slice(relativePath.lastIndexOf(".") + 1);

/** 报错时把收到的值也写出来，否则「哪一项错了」只能靠猜。 */
const show = value => (typeof value === "string" ? JSON.stringify(value) : String(value));

/** 校验路径并返回附件名（basename）。不合规则（不匹配正则或含 ".."）抛 Error，消息里带上这个路径。 */
export function assetName(relativePath) {
    if (typeof relativePath !== "string")
        throw new Error(`资源路径必须是字符串，收到 ${show(relativePath)}`);
    if (!mediaPathPattern.test(relativePath) || relativePath.includes(".."))
        throw new Error(`资源路径必须是不含 ".." 的站点相对路径（media/…）：${relativePath}`);
    return relativePath.slice(relativePath.lastIndexOf("/") + 1);
}

/** 按扩展名返回上传用的 Content-Type。路径先过 assetName 校验。 */
export function contentType(relativePath) {
    return contentTypes.get(extensionOf(assetName(relativePath)));
}

/**
 * 生成清单对象。files 是 [{path, bytes, sha256}] 数组（顺序任意）。
 * 返回值能通过 validateManifest，files 的键已排序。
 * 路径重复、附件名重名、bytes/sha256 不合法都抛 Error。
 */
export function createManifest({repository, release, files}) {
    if (!Array.isArray(files)) throw new Error(`files 必须是数组，收到 ${show(files)}`);
    const entries = new Map();
    const owners = new Map();
    for (const file of files) {
        if (!isObject(file)) throw new Error(`清单条目必须是对象，收到 ${show(file)}`);
        for (const key of Object.keys(file))
            if (!fileKeys.includes(key))
                throw new Error(`清单条目多了不该有的字段 ${key}：${file.path}`);
        const name = assetName(file.path);
        if (entries.has(file.path)) throw new Error(`资源路径重复：${file.path}`);
        if (owners.has(name))
            throw new Error(`附件名重复：${name}（${owners.get(name)} 与 ${file.path}）`);
        entries.set(file.path, {bytes: file.bytes, sha256: file.sha256});
        owners.set(name, file.path);
    }
    const manifest = {repository, release, files: {}};
    // 键序按字符串升序落库：清单是入库文件，diff 要稳定，不能跟着输入顺序变。
    for (const path of [...entries.keys()].sort()) manifest.files[path] = entries.get(path);
    return validateManifest(manifest);
}

/** 校验任意值是不是合法清单；合法就原样返回，不合法抛 Error，消息说明哪一项错了。 */
export function validateManifest(value) {
    if (!isObject(value)) throw new Error(`清单必须是对象，收到 ${show(value)}`);
    for (const key of Object.keys(value))
        if (!manifestKeys.includes(key)) throw new Error(`清单多了不该有的键 ${key}`);
    for (const key of manifestKeys)
        if (!Object.hasOwn(value, key)) throw new Error(`清单缺少 ${key}`);
    if (typeof value.repository !== "string" || !repositoryPattern.test(value.repository))
        throw new Error(`repository 必须形如 owner/name，收到 ${show(value.repository)}`);
    if (typeof value.release !== "string" || !value.release)
        throw new Error(`release 必须是非空字符串，收到 ${show(value.release)}`);
    if (!isObject(value.files)) throw new Error(`files 必须是对象，收到 ${show(value.files)}`);

    const owners = new Map();
    for (const [path, entry] of Object.entries(value.files)) {
        const name = assetName(path);
        // 附件名就是发布页上的唯一标识：重名会让两条资源抢同一个下载地址。
        if (owners.has(name))
            throw new Error(`附件名重复：${name}（${owners.get(name)} 与 ${path}）`);
        owners.set(name, path);
        if (!isObject(entry)) throw new Error(`清单条目必须是对象：${path}`);
        for (const key of Object.keys(entry))
            if (!entryKeys.includes(key)) throw new Error(`清单条目多了不该有的字段 ${key}：${path}`);
        for (const key of entryKeys)
            if (!Object.hasOwn(entry, key)) throw new Error(`清单条目缺少 ${key}：${path}`);
        if (!Number.isInteger(entry.bytes) || entry.bytes <= 0)
            throw new Error(`bytes 必须是正整数：${path}`);
        if (typeof entry.sha256 !== "string" || !sha256Pattern.test(entry.sha256))
            throw new Error(`sha256 必须是 64 位小写十六进制：${path}`);
    }
    return value;
}

/** 附件的公开下载地址；release 和附件名各自 encodeURIComponent。 */
export function downloadUrl(manifest, relativePath) {
    const name = assetName(relativePath);
    if (!isObject(manifest) || typeof manifest.repository !== "string" || !repositoryPattern.test(manifest.repository))
        throw new Error(`清单的 repository 不合法：${show(manifest?.repository)}`);
    if (typeof manifest.release !== "string" || !manifest.release)
        throw new Error(`清单的 release 不合法：${show(manifest.release)}`);
    return `https://github.com/${manifest.repository}/releases/download/` +
        `${encodeURIComponent(manifest.release)}/${encodeURIComponent(name)}`;
}

/**
 * 拉取计划。local 是 {路径: {sha256} | undefined}：本地已有且已算出哈希的文件
 * 给出 sha256，没有的文件不出现或为 undefined。
 */
export function planPull(manifest, local) {
    const present = local ?? {};
    const download = [];
    const ok = [];
    const extra = [];
    for (const path of Object.keys(manifest.files).sort()) {
        if (present[path]?.sha256 === manifest.files[path].sha256) ok.push(path);
        else download.push(path);
    }
    // 值为 undefined 说明本地没有这个文件，调用方的目录扫描顺带带上它时不该算「多出」。
    for (const [path, known] of Object.entries(present))
        if (known != null && !Object.hasOwn(manifest.files, path)) extra.push(path);
    return {download, ok, extra: extra.sort()};
}

/**
 * 上传计划。remote 是发布页现有附件 [{id, name, size, digest}]（digest 可能是 null）。
 * 只报告多余附件，绝不删除。
 */
export function planUpload(manifest, remote) {
    const assets = new Map();
    for (const asset of remote ?? []) if (!assets.has(asset.name)) assets.set(asset.name, asset);
    const upload = [];
    const replace = [];
    const keep = [];
    const used = new Set();
    for (const path of Object.keys(manifest.files).sort()) {
        const entry = manifest.files[path];
        const name = assetName(path);
        used.add(name);
        const asset = assets.get(name);
        if (!asset) {
            upload.push(path);
            continue;
        }
        if (asset.digest === `sha256:${entry.sha256}` && asset.size === entry.bytes) keep.push(path);
        else replace.push({path, assetId: asset.id});
    }
    const extra = [...assets.keys()].filter(name => !used.has(name)).sort();
    return {upload, replace, keep, extra};
}

/** 递归遍历任意 JSON 值，收集所有匹配 mediaPathPattern 的字符串，去重后升序返回。 */
export function findMediaReferences(value) {
    const found = new Set();
    const walk = node => {
        if (typeof node === "string") {
            if (mediaPathPattern.test(node)) found.add(node);
            return;
        }
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        if (node && typeof node === "object") for (const child of Object.values(node)) walk(child);
    };
    walk(value);
    return [...found].sort();
}
