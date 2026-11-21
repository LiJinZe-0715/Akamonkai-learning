import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const java = process.env.JAVA_HOME;
if (!sdk || !java) throw Error('Set ANDROID_HOME and JAVA_HOME; start an Android emulator/device first.');
const windows = process.platform === 'win32';
const adb = path.join(sdk, 'platform-tools', windows ? 'adb.exe' : 'adb');
const androidJar = path.join(sdk, 'platforms/android-35/android.jar');
// 不要写死 build-tools 版本：SDK 里只保留机器上装过的那一个。
const buildToolsVersion = readdirSync(path.join(sdk, 'build-tools'))
    .sort((left, right) => {
        const a = left.split('.').map(Number), b = right.split('.').map(Number);
        for (let index = 0; index < Math.max(a.length, b.length); index++) {
            const order = (b[index] ?? 0) - (a[index] ?? 0);
            if (order !== 0) return order;
        }
        return 0;
    })[0];
if (!buildToolsVersion) throw Error('No Android build-tools installed');
const d8Jar = path.join(sdk, 'build-tools', buildToolsVersion, 'lib', 'd8.jar');
const folder = mkdtempSync(path.join(tmpdir(), 'study-update-tests-'));
const run = (exe, args) => execFileSync(exe, args, {stdio: 'inherit'});
try {
    const classes = path.join(folder, 'classes');
    const dex = path.join(folder, 'dex');
    mkdirSync(classes); mkdirSync(dex);
    // 目标版本 17，与 app 的 sourceCompatibility 一致。更新的 JDK 会产出
    // 打包附带的 d8 读不了的 class 文件版本。
    run(path.join(java, 'bin', windows ? 'javac.exe' : 'javac'), ['-encoding', 'UTF-8', '-source', '17', '-target', '17',
        '-Xlint:-options', '-classpath', androidJar, '-d', classes,
        path.join(root, 'android/app/src/main/java/app/study/mobile/AppUpdates.java'),
        path.join(root, 'android/app/build/generated/source/buildConfig/release/app/study/mobile/BuildConfig.java'),
        path.join(root, 'android/tests/UpdateCheckTest.java')]);
    const files = [];
    function collect(directory) {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) collect(file); else if (file.endsWith('.class')) files.push(file);
        }
    }
    collect(classes);
    run(path.join(java, 'bin', windows ? 'java.exe' : 'java'), ['-cp', d8Jar,
        'com.android.tools.r8.D8', '--min-api', '26', '--lib', androidJar, '--output', dex, ...files]);
    run(adb, ['push', path.join(dex, 'classes.dex'), '/data/local/tmp/study-updates-test.dex']);
    run(adb, ['shell', 'CLASSPATH=/data/local/tmp/study-updates-test.dex', 'app_process', '/', 'app.study.mobile.UpdateCheckTest']);
} finally {
    rmSync(folder, {recursive: true, force: true});
}
