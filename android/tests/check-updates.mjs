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
const folder = mkdtempSync(path.join(tmpdir(), 'study-update-tests-'));
const run = (exe, args) => execFileSync(exe, args, {stdio: 'inherit'});
try {
    const classes = path.join(folder, 'classes');
    const dex = path.join(folder, 'dex');
    mkdirSync(classes); mkdirSync(dex);
    run(path.join(java, 'bin', windows ? 'javac.exe' : 'javac'), ['-encoding', 'UTF-8', '-classpath', androidJar, '-d', classes,
        path.join(root, 'android/app/src/main/java/app/study/mobile/AppUpdates.java'),
        path.join(root, 'android/app/build/generated/source/buildConfig/debug/app/study/mobile/BuildConfig.java'),
        path.join(root, 'android/tests/UpdateCheckTest.java')]);
    const files = [];
    function collect(directory) {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) collect(file); else if (file.endsWith('.class')) files.push(file);
        }
    }
    collect(classes);
    run(path.join(java, 'bin', windows ? 'java.exe' : 'java'), ['-cp', path.join(sdk, 'build-tools/35.0.0/lib/d8.jar'),
        'com.android.tools.r8.D8', '--min-api', '26', '--lib', androidJar, '--output', dex, ...files]);
    run(adb, ['push', path.join(dex, 'classes.dex'), '/data/local/tmp/study-updates-test.dex']);
    run(adb, ['shell', 'CLASSPATH=/data/local/tmp/study-updates-test.dex', 'app_process', '/', 'app.study.mobile.UpdateCheckTest']);
} finally {
    rmSync(folder, {recursive: true, force: true});
}
