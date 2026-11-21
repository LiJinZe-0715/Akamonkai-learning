import {spawn} from 'node:child_process';
import {appendFileSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * 构建脚本的日志：出了问题能追到是哪一步、哪条命令、什么原因。
 *
 * - 每个脚本按「步骤」跑，记下开始、结束、耗时；失败时报出步骤名、原因和日志位置。
 * - 子进程（pnpm build、Gradle、keytool…）的输出一边照常打到终端，一边写进日志文件，
 *   终端关了也查得到。
 * - 一次 ship 串起来的几个脚本写同一份日志（文件路径经环境变量传给子进程）。
 * - 日志在 logs/ 下（不进仓库），只留最近 20 份。
 *
 *   const log = createLog('build-android');
 *   await log.step('打包网页', () => log.run('pnpm build --base=/', {cwd: root}));
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const logFolder = path.join(root, 'logs');
const keep = 20;
/** 这一次运行的日志文件；子进程沿用同一份。 */
const fileVariable = 'AKAMONKAI_BUILD_LOG';
/** 父进程已经把子进程的终端输出抄进日志了：子进程自己就别再写一遍，免得重复。 */
const teedVariable = 'AKAMONKAI_BUILD_LOG_TEED';

const pad = value => String(value).padStart(2, '0');
const clock = (date = new Date()) =>
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
const stamp = (date = new Date()) =>
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
const seconds = started => ((Date.now() - started) / 1000).toFixed(1) + 's';

/** 只留最近 keep 份日志，按文件名（时间戳）排序。 */
function prune(folder) {
    let files;
    try {
        files = readdirSync(folder).filter(name => name.endsWith('.log')).sort();
    } catch {
        return;
    }
    for (const name of files.slice(0, Math.max(0, files.length - keep))) rmSync(path.join(folder, name), {force: true});
}

export function createLog(name, {folder = logFolder} = {}) {
    const inherited = process.env[fileVariable];
    const teed = process.env[teedVariable] === '1';
    const file = inherited || path.join(folder, `${name}-${stamp()}.log`);
    if (!inherited) {
        mkdirSync(path.dirname(file), {recursive: true});
        prune(path.dirname(file));
    }
    // 子进程（ship 调起的 build-android 等）沿用这一份。
    process.env[fileVariable] = file;
    delete process.env[teedVariable];

    const write = text => {
        if (teed) return;
        const lines = String(text).replace(/\r?\n$/, '').split(/\r?\n/);
        try {
            appendFileSync(file, lines.map(line => `${clock()} [${name}] ${line}`).join('\n') + '\n');
        } catch { /* 写不了日志不该让构建失败。 */ }
    };
    const relative = path.relative(root, file);
    let current = null;
    let reported = false;

    /** 失败只报一次：步骤里抛出的错误一路冒到进程级处理器，不能报两遍。 */
    const report = error => {
        if (reported) return;
        reported = true;
        const where = current ? `步骤「${current}」` : '';
        write(`✗ ${where}失败：${error?.stack ?? error}`);
        console.error(`\n✗ [${name}] ${where}失败：${error?.message ?? error}`);
        console.error(`  完整日志：${relative}`);
    };
    process.on('uncaughtException', error => {
        report(error);
        process.exit(1);
    });
    process.on('unhandledRejection', error => {
        report(error);
        process.exit(1);
    });
    process.on('exit', code => write(code === 0 ? '✓ 结束' : `✗ 退出码 ${code}`));
    write(`开始：node ${process.version}，参数 ${JSON.stringify(process.argv.slice(2))}，目录 ${process.cwd()}`);

    const log = {
        file,
        info(message) {
            console.log(message);
            write(message);
        },
        warn(message) {
            console.warn(message);
            write('⚠ ' + message);
        },
        /** 跑一步：记录开始、结束和耗时；失败时记下是哪一步，再把错误往上抛。 */
        async step(title, task) {
            const previous = current;
            current = title;
            const started = Date.now();
            console.log(`▶ ${title}`);
            write(`▶ ${title}`);
            try {
                const result = await task();
                write(`✓ ${title}（${seconds(started)}）`);
                console.log(`✓ ${title}（${seconds(started)}）`);
                current = previous;
                return result;
            } catch (error) {
                write(`✗ ${title}（${seconds(started)}）`);
                report(error);
                throw error;
            }
        },
        /**
         * 跑一条命令。tee 为真时输出一边打到终端、一边抄进日志；为假时直接交给终端，
         * 用于自己也写这份日志的子脚本（ship 调起的 build-android 等）。
         */
        run(command, {cwd = root, env = process.env, tee = true} = {}) {
            const started = Date.now();
            write(`$ ${command}（目录 ${path.relative(root, cwd) || '.'}）`);
            return new Promise((resolve, reject) => {
                const child = spawn(command, {
                    cwd, shell: true, windowsHide: true,
                    env: {...env, [fileVariable]: file, ...(tee ? {[teedVariable]: '1'} : {})},
                    stdio: tee ? ['inherit', 'pipe', 'pipe'] : 'inherit',
                });
                if (tee) {
                    const copy = (target, chunk) => {
                        target.write(chunk);
                        if (!teed) try {
                            appendFileSync(file, chunk);
                        } catch { /* 同上：日志写不了不影响构建。 */ }
                    };
                    child.stdout.on('data', chunk => copy(process.stdout, chunk));
                    child.stderr.on('data', chunk => copy(process.stderr, chunk));
                }
                child.on('error', error => reject(new Error(`命令启动失败：${command}（${error.message}）`)));
                child.on('close', code => {
                    write(`$ 退出码 ${code}（${seconds(started)}）：${command}`);
                    if (code === 0) resolve();
                    else reject(new Error(`命令失败（退出码 ${code}）：${command}`));
                });
            });
        },
    };
    return log;
}
