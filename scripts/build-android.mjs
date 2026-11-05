import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {injectAndroidHead} from './android-html.mjs';
import {signingCertificates} from './apk-file.mjs';
import {createLog} from './build-log.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const env = process.env;
const args = process.argv.slice(2);
const log = createLog('build-android');
const dist = path.join(root, 'dist');
const assets = path.join(android, 'app/src/main/assets/public');

/** 只写内容真的变了的文件：Gradle 的增量打包据此少做事。 */
function syncTree(source, target, skip) {
  let written = 0;
  mkdirSync(target, {recursive: true});
  for (const entry of readdirSync(source, {withFileTypes: true})) {
    if (skip(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      written += syncTree(from, to, skip);
      continue;
    }
    const next = readFileSync(from);
    let same = false;
    try {
      same = readFileSync(to).equals(next);
    } catch { /* 目标不存在，照写。 */ }
    if (!same) {
      writeFileSync(to, next);
      written++;
    }
  }
  return written;
}

/** 目录下所有文件的相对路径，用 / 分隔，跨平台一致。 */
function listFiles(folder, prefix = '') {
  const out = [];
  for (const entry of readdirSync(folder, {withFileTypes: true})) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(folder, entry.name), relative));
    else out.push(relative);
  }
  return out;
}

/**
 * 删掉目标树里源树已经没有的文件。
 *
 * syncTree 只写不删，所以 dist 里消失的文件会一直留在安卓 assets 里，
 * 最后原样进 APK——和 Gradle 挖空条目一样，都是看不见的死字节：目录里数得出、
 * 但没有任何地方引用它。这里只删文件，不动目录，也不碰这棵树以外的东西。
 */
function pruneTree(folder, keep) {
  const removed = listFiles(folder).filter(relative => !keep.has(relative));
  for (const relative of removed) rmSync(path.join(folder, relative));
  return removed;
}

/** 递归处理 assets 里的每个 HTML：去掉在线字体，注入 CSP 与原生桥。 */
function prepare(folder) {
  let pages = 0;
  for (const item of readdirSync(folder, {withFileTypes: true})) {
    const file = path.join(folder, item.name);
    if (item.isDirectory()) pages += prepare(file);
    else if (item.name.endsWith('.html')) {
      let html = readFileSync(file, 'utf8');
      // Android already supplies CJK fonts. Remove remote font requests for fully offline startup.
      html = html.replace(/<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/gi, '');
      html = injectAndroidHead(html, file);
      writeFileSync(file, html);
      pages++;
    }
  }
  return pages;
}

await log.step('检查打包环境', () => {
  if (!args.includes('--prepare-only') && (!env.JAVA_HOME || !(env.ANDROID_HOME || env.ANDROID_SDK_ROOT)))
    throw Error('没有设 JAVA_HOME（JDK 17+）或 ANDROID_HOME（Android SDK 35）。');
  log.info(`JAVA_HOME=${env.JAVA_HOME ?? '（未设）'}  ANDROID_HOME=${env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? '（未设）'}`);
});

// pnpm 把参数接在脚本最后一条命令（vite build）后面：APK 从站点根目录提供页面。
await log.step('构建网页（校验 → 内容 → 类型检查 → vite）', async () => {
  await log.run('pnpm build --base=/', {cwd: root});
  if (!existsSync(path.join(dist, 'index.html'))) throw Error('构建出的网页缺少 dist/index.html');
});

await log.step('同步网页到 App 资源', () => {
  // dist 每次都由 vite 清空重建（emptyOutDir），这里只需同步进 assets 并清掉 assets 的残留。
  // Published APKs belong to the website, never inside another APK.
  const written = syncTree(dist, assets, name => name === 'downloads');
  // assets 是 dist 的副本，外加一份 native-bridge.js；多出来的都是历史残留。
  const keptInAssets = new Set([...listFiles(dist), 'native-bridge.js']);
  const droppedFromAssets = pruneTree(assets, keptInAssets);
  const bridgeSource = path.join(android, 'native-bridge.js');
  const bridgeTarget = path.join(assets, 'native-bridge.js');
  const next = readFileSync(bridgeSource);
  let same = false;
  try {
    same = readFileSync(bridgeTarget).equals(next);
  } catch { /* 目标不存在，照写。 */ }
  if (!same) writeFileSync(bridgeTarget, next);
  log.info(`更新 ${written} 个文件${droppedFromAssets.length ? `，删掉 ${droppedFromAssets.length} 个旧文件` : ''}`);
});

await log.step('给页面注入 CSP 与原生桥', () => log.info(`处理 ${prepare(assets)} 个页面`));

if (!args.includes('--prepare-only')) {
  const signing = path.join(android, '.signing/debug.keystore');
  const pinFile = path.join(android, 'release-signing.json');
  const newKey = args.includes('--new-signing-key');
  const apk = path.join(android, 'app/build/outputs/apk/release/app-release.apk');

  await log.step('检查签名钥匙', async () => {
    if (existsSync(signing)) return;
    // 钥匙只在这台机器上（.signing 不进仓库）。发过版之后再自动生成一把，打出来的包
    // 签名就变了：已装的设备无法覆盖安装，只能卸载——学习记录随 localStorage 一起没了。
    if (existsSync(pinFile) && !newKey)
      throw Error(`找不到签名钥匙 ${path.relative(root, signing)}。\n`
        + '  已经发过版，必须用原来那把：从备份恢复到这个位置再打包。\n'
        + '  确定要换钥匙（所有已装设备都得卸载重装）才加 --new-signing-key。');
    mkdirSync(path.dirname(signing), {recursive: true});
    const keytool = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
    await log.run(`"${keytool}" -genkeypair -keystore "${signing}" -storepass android -keypass android`
      + ' -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"');
  });

  await log.step('Gradle 打包（assembleRelease）', async () => {
    // Gradle 的增量打包会复用上一次的 APK 文件：删掉的条目只从中央目录里消失，
    // 数据仍然占着位置，形成几百 KB 的空洞——文件大小一点没变，字节却是死的。
    // 删掉旧包逼它整份重写，代价只有一两秒。
    if (existsSync(apk)) rmSync(apk);
    // 写全路径：设了 NoDefaultCurrentDirectoryInExePath 的环境里，cmd 不在当前目录找程序。
    await log.run(process.platform === 'win32'
      ? `"${path.join(android, 'gradlew.bat')}" assembleRelease` : 'sh gradlew assembleRelease', {cwd: android});
  });

  await log.step('校验 APK（版本号、包内文件、签名证书）', () => {
    // AppUpdates only understands numeric display versions, so a stray suffix would
    // silently disable the in-app update check.
    const metadata = JSON.parse(readFileSync(path.join(path.dirname(apk), 'output-metadata.json'), 'utf8'));
    const build = metadata.elements?.find(item => item.outputFile === path.basename(apk));
    if (!build || !/^[0-9]+(?:\.[0-9]+){0,2}$/.test(String(build.versionName)))
      throw Error('versionName 必须是纯数字（如 7 或 7.0），现在是 ' + JSON.stringify(build?.versionName));
    const jar = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar');
    const packaged = new Set(execFileSync(jar, ['tf', apk], {encoding: 'utf8'}).split(/\r?\n/));
    const verify = (folder, prefix = 'assets/public') => {
      for (const item of readdirSync(folder, {withFileTypes: true})) {
        if (item.name.startsWith('.')) continue;
        const entry = `${prefix}/${item.name}`;
        if (item.isDirectory()) verify(path.join(folder, item.name), entry);
        else if (!packaged.has(entry)) throw Error(`APK 里缺网页文件：${entry}`);
      }
    };
    verify(assets);
    // 签名必须是登记过的那张证书。不对就把包删掉，免得接着被 publish 发出去。
    const certificates = signingCertificates(readFileSync(apk));
    const pinned = existsSync(pinFile) ? JSON.parse(readFileSync(pinFile, 'utf8')).certificateSha256 : null;
    if (newKey || !pinned) {
      writeFileSync(pinFile, JSON.stringify({certificateSha256: certificates[0]}, null, 2) + '\n');
      log.warn(`已登记新的签名证书 ${certificates[0].slice(0, 8)}（${path.relative(root, pinFile)}），随这一版一起提交。`
        + '\n  旧证书签的包装在设备上的，必须卸载后才能装新包。');
    } else if (!certificates.includes(pinned)) {
      rmSync(apk);
      throw Error(`APK 签名证书 ${certificates[0].slice(0, 8)} 不是登记的 ${pinned.slice(0, 8)}（${path.relative(root, pinFile)}）。`
        + '\n  .signing/debug.keystore 被换过：从备份恢复原来的钥匙再打包。包已删除，不会被发布。');
    }
    log.info(`APK 已校验：${path.relative(root, apk)}`);
  });

  // 刚打的包还没写进 public/downloads：单独跑 android:build 时提醒一声。忘了发布的话，
  // CI 的 verify-apk 也会报「APK 落后于当前源码」，但那要等推送之后。
  const release = JSON.parse(readFileSync(path.join(root, 'public/downloads/version.json'), 'utf8'));
  const fresh = createHash('sha256').update(readFileSync(apk)).digest('hex');
  // ship 会紧接着发布，这句提醒只对单独跑 android:build 的人有用。
  if (release.sha256 !== fresh && !args.includes('--then-publish'))
    log.warn('这个包还没发布：public/downloads 里仍是上一个（' + release.sha256.slice(0, 8)
      + '），刚打的是 ' + fresh.slice(0, 8) + '。\n  跑 node scripts/publish-android.mjs，否则线上和 App 里都还是旧代码。');
}
