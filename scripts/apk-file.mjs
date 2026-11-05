import {createHash} from "node:crypto";
import {readdirSync, readFileSync} from "node:fs";
import path from "node:path";
import {crc32} from "node:zlib";

/**
 * 不靠 Android SDK 读 APK。
 *
 * APK 就是 zip：中央目录不压缩，每个文件的名字、大小、CRC32 都能直接读出来；
 * v2/v3 签名块紧挨在中央目录前面，里面是签名证书的原始 DER。所以「包里装的是哪一版
 * 网页」和「包是用哪把钥匙签的」在 CI（没有 SDK）里也能回答。
 */

const endOfDirectory = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

function directoryOffset(apk) {
    const eocd = apk.lastIndexOf(endOfDirectory);
    if (eocd < 0) throw new Error("不是 zip 文件：找不到中央目录结尾");
    return {eocd, offset: apk.readUInt32LE(eocd + 16), count: apk.readUInt16LE(eocd + 10)};
}

/** 包内文件名 → {crc, size}。 */
export function apkEntries(apk) {
    const {offset, count} = directoryOffset(apk);
    const entries = new Map();
    let at = offset;
    for (let index = 0; index < count; index++) {
        if (apk.readUInt32LE(at) !== 0x02014b50) throw new Error("APK 中央目录损坏");
        const nameLength = apk.readUInt16LE(at + 28);
        const skip = apk.readUInt16LE(at + 30) + apk.readUInt16LE(at + 32);
        entries.set(apk.toString("utf8", at + 46, at + 46 + nameLength), {
            crc: apk.readUInt32LE(at + 16),
            size: apk.readUInt32LE(at + 24),
        });
        at += 46 + nameLength + skip;
    }
    return entries;
}

/** uint32 长度前缀的序列，逐项取出。 */
function* sequence(buffer) {
    for (let at = 0; at < buffer.length;) {
        const length = buffer.readUInt32LE(at);
        yield buffer.subarray(at + 4, at + 4 + length);
        at += 4 + length;
    }
}

const firstItem = buffer => sequence(buffer).next().value;

/**
 * 签名证书的 SHA-256（小写十六进制），与 `apksigner verify --print-certs` 打印的一致。
 * 同时读 v2（0x7109871a）与 v3（0xf05368c0）块；两者签的是同一张证书。
 */
export function signingCertificates(apk) {
    const {offset} = directoryOffset(apk);
    if (apk.toString("latin1", offset - 16, offset) !== "APK Sig Block 42")
        throw new Error("APK 没有 v2/v3 签名块");
    const size = Number(apk.readBigUInt64LE(offset - 24));
    const end = offset - 24;
    const digests = new Set();
    for (let at = offset - size - 8 + 8; at < end;) {
        const length = Number(apk.readBigUInt64LE(at));
        const id = apk.readUInt32LE(at + 8);
        if (id === 0x7109871a || id === 0xf05368c0) {
            for (const signer of sequence(firstItem(apk.subarray(at + 12, at + 8 + length)) ?? Buffer.alloc(0))) {
                const signedData = [...sequence(firstItem(signer))];
                for (const certificate of sequence(signedData[1]))
                    digests.add(createHash("sha256").update(certificate).digest("hex"));
            }
        }
        at += 8 + length;
    }
    if (!digests.size) throw new Error("APK 签名块里没有证书");
    return [...digests];
}

/** 目录下所有文件的相对路径，用 / 分隔。 */
function listFiles(folder, prefix = "") {
    return readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        return entry.isDirectory() ? listFiles(path.join(folder, entry.name), relative) : [relative];
    });
}

/**
 * 包里的网页与一份新构建的 dist 差在哪。
 *
 * HTML 不比：打包时会注入 CSP 与 native-bridge，且两边的 base 不同。downloads 不进包。
 * 其余文件（带哈希的 JS/CSS、全部内容 JSON）两边必须逐字节一致——vite 的 base 不影响
 * 资源哈希，所以 Pages 用的 dist 可以直接拿来比。
 */
export function compareWithBuild(apk, dist) {
    const entries = apkEntries(apk);
    const prefix = "assets/public/";
    const compared = relative => !relative.endsWith(".html") && !relative.startsWith("downloads/");
    const built = listFiles(dist).filter(compared);
    const changed = [], missing = [];
    for (const relative of built) {
        const entry = entries.get(prefix + relative);
        if (!entry) {
            missing.push(relative);
            continue;
        }
        const bytes = readFileSync(path.join(dist, relative));
        if (entry.size !== bytes.length || entry.crc !== crc32(bytes)) changed.push(relative);
    }
    const expected = new Set([...built, "native-bridge.js"]);
    const extra = [...entries.keys()]
        .filter(name => name.startsWith(prefix))
        .map(name => name.slice(prefix.length))
        .filter(relative => compared(relative) && !expected.has(relative));
    return {compared: built.length, changed, missing, extra};
}
