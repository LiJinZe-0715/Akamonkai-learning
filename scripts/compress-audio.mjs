import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLog} from './build-log.mjs';

/**
 * 听力音频瘦身：对话录音不需要 192/128 kbps 立体声，转成单声道 64 kbps。
 * 原始文件一个字节都不动，产物写到 work/audio/（不入库），体积对得上再决定往哪搬。
 *
 *   node scripts/compress-audio.mjs                     转默认三个目录
 *   node scripts/compress-audio.mjs --dir=manabo        只转一个（可重复）
 *   node scripts/compress-audio.mjs --bitrate=48k --force
 *   node scripts/compress-audio.mjs --dry-run           只列清单，不调 ffmpeg
 *
 * ffmpeg 找的顺序：--ffmpeg= 参数 → FFMPEG_PATH 环境变量 → node_modules/ffmpeg-static → PATH。
 * 已经转过的文件按 mtime 跳过（源文件没动就不重转），--force 覆盖。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = createLog('compress-audio');

const defaults = ['生中继音频1', '生中继音频2', 'manabo'];
const arguments_ = process.argv.slice(2);
const option = name => arguments_.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const flags = new Set(arguments_.filter(item => item.startsWith('--') && !item.includes('=')));

const sources = arguments_.filter(item => item.startsWith('--dir=')).map(item => path.resolve(root, item.slice(6)));
const folders = sources.length ? sources : defaults.map(name => path.join(root, name));
const outputRoot = path.resolve(root, option('out') ?? 'work/audio');
const bitrate = option('bitrate') ?? '64k';
const force = flags.has('--force');
const dryRun = flags.has('--dry-run');

/** 参数给错的路径直接说清楚，别让用户猜是哪个目录不存在。 */
const missing = folders.filter(folder => !existsSync(folder));
if (missing.length) {
    console.error(`✗ 目录不存在：${missing.map(folder => path.relative(root, folder)).join('、')}`);
    process.exit(1);
}

function resolveFfmpeg() {
    const explicit = option('ffmpeg') ?? process.env.FFMPEG_PATH;
    if (explicit) return explicit;
    const bundled = path.join(root, 'node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (existsSync(bundled)) return bundled;
    return 'ffmpeg';
}

const ffmpeg = resolveFfmpeg();
if (!dryRun) {
    const probe = spawnSync(ffmpeg, ['-hide_banner', '-version'], {windowsHide: true, encoding: 'utf8'});
    if (probe.error || probe.status !== 0) {
        console.error(`✗ 找不到可用的 ffmpeg（试过 ${ffmpeg}）。`);
        console.error('  装一个：winget install Gyan.FFmpeg，或 --ffmpeg=<路径> 指定已有的二进制。');
        process.exit(1);
    }
}

const mib = bytes => (bytes / 2 ** 20).toFixed(2) + ' MiB';
const audioFiles = folder =>
    readdirSync(folder, {withFileTypes: true})
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right, 'ja'));

/** 单文件转码。失败要带上文件名和 ffmpeg 自己的报错，不能只剩一句「命令失败」。 */
function transcode(from, to) {
    return new Promise((resolve, reject) => {
        const child = spawn(ffmpeg, [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-i', from,
            // 封面图之类的元数据顺手丢掉，省几十 KB，也不影响播放。
            '-map_metadata', '-1',
            // 显式 0.5/0.5 降混：-ac 1 走的是 0.707/0.707 矩阵，等于整体 +3 dB，
            // 峰值顶到 0 dBFS 会削波。aformat 先把单声道源补成双声道，两条路都走这个混音。
            '-af', 'aformat=channel_layouts=stereo,pan=mono|c0=0.5*FL+0.5*FR',
            '-c:a', 'libmp3lame', '-b:a', bitrate,
            to,
        ], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
        let reason = '';
        child.stderr.on('data', chunk => {
            reason += chunk;
        });
        child.on('error', error => reject(new Error(`ffmpeg 启动失败：${error.message}`)));
        child.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`转换失败（退出码 ${code}）：${reason.trim() || '无输出'}`));
        });
    });
}

/** 每个目录单独统计，最后再有总计，好判断哪一批值得搬。 */
const results = [];
for (const folder of folders) {
    const name = path.relative(root, folder);
    const target = path.join(outputRoot, path.basename(folder));
    const files = audioFiles(folder);
    if (!files.length) {
        log.warn(`${name}：没有 mp3，跳过`);
        continue;
    }
    mkdirSync(target, {recursive: true});
    let before = 0;
    let after = 0;
    let converted = 0;
    let skipped = 0;
    const heavier = [];

    await log.step(`${name}（${files.length} 个）`, async () => {
        for (const [index, file] of files.entries()) {
            const from = path.join(folder, file);
            const to = path.join(target, file);
            const inputSize = statSync(from).size;
            before += inputSize;
            const fresh = existsSync(to) && !force && statSync(to).mtimeMs >= statSync(from).mtimeMs;
            if (fresh) {
                skipped += 1;
                after += statSync(to).size;
                continue;
            }
            if (dryRun) {
                after += inputSize;
                continue;
            }
            await transcode(from, to);
            const outputSize = statSync(to).size;
            after += outputSize;
            converted += 1;
            if (outputSize >= inputSize * 0.95) heavier.push(file);
            const count = `[${String(index + 1).padStart(String(files.length).length)}/${files.length}]`;
            log.info(`${count} ${file}  ${mib(inputSize)} → ${mib(outputSize)}`);
        }
    });

    if (heavier.length) {
        log.warn(`${name}：${heavier.length} 个文件转完没变小（${heavier.slice(0, 5).join('、')}`
            + `${heavier.length > 5 ? '…' : ''}），原文件本来就压得很狠，保留原样即可`);
    }
    results.push({name, count: files.length, converted, skipped, before, after});
}

const totalBefore = results.reduce((sum, item) => sum + item.before, 0);
const totalAfter = results.reduce((sum, item) => sum + item.after, 0);
const saved = totalBefore ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : '0';
log.info('');
log.info(dryRun ? '（dry-run：只列清单，没有真正转码）' : `产物目录：${path.relative(root, outputRoot)}`);
for (const item of results) {
    log.info(`${item.name.padEnd(12)} ${String(item.count).padStart(3)} 个  ${mib(item.before).padStart(10)} → `
        + `${mib(item.after).padStart(10)}` + (item.skipped ? `（跳过 ${item.skipped} 个已转过的）` : ''));
}
log.info(`${'合计'.padEnd(12)} ${String(results.reduce((sum, item) => sum + item.count, 0)).padStart(3)} 个  `
    + `${mib(totalBefore).padStart(10)} → ${mib(totalAfter).padStart(10)}  省 ${saved}%`);
