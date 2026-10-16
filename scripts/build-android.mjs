import {execFileSync, execSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const env = {...process.env, PAGES_BASE_PATH: '/'};
const args = process.argv.slice(2);
if (!args.includes('--prepare-only') && (!env.JAVA_HOME || !(env.ANDROID_HOME || env.ANDROID_SDK_ROOT))) {
  throw Error('Set JAVA_HOME (JDK 17) and ANDROID_HOME (Android SDK 35) before building the APK.');
}
// pnpm appends build arguments to the final Vite command; the static exporter reads PAGES_BASE_PATH.
execSync('pnpm build --base=/', {cwd: root, env, stdio: 'inherit'});
const dist = path.join(root, 'dist');
if (!existsSync(path.join(dist, 'index.html'))) throw Error('Built website is missing index.html');
const assets = path.join(android, 'app/src/main/assets/public');
// The target is fixed beneath this repository, never user supplied.
rmSync(assets, {recursive: true, force: true});
mkdirSync(assets, {recursive: true});
// Published APKs belong to the website, never inside another APK.
cpSync(dist, assets, {
  recursive: true,
  filter: source => path.relative(dist, source).split(path.sep)[0] !== 'downloads',
});
cpSync(path.join(android, 'native-bridge.js'), path.join(assets, 'native-bridge.js'));
let pages = 0;
function prepare(folder) {
  for (const item of readdirSync(folder, {withFileTypes: true})) {
    const file = path.join(folder, item.name);
    if (item.isDirectory()) prepare(file);
    else if (item.name.endsWith('.html')) {
      let html = readFileSync(file, 'utf8');
      // Android already supplies CJK fonts. Remove remote font requests for fully offline startup.
      html = html.replace(/<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/gi, '');
      if (!/<head(?:\s[^>]*)?>/i.test(html)) throw Error(`Missing head: ${file}`);
      html = html.replace(/<head(?:\s[^>]*)?>/i, '$&<meta http-equiv="Content-Security-Policy" content="frame-src \'none\'; object-src \'none\'; base-uri \'self\'"><style>[data-android-download]{display:none!important}</style><script src="/native-bridge.js"></script>');
      writeFileSync(file, html);
      pages++;
    }
  }
}
prepare(assets);
console.log(`Prepared ${pages} offline HTML pages.`);
if (!args.includes('--prepare-only')) {
  const signing = path.join(android, '.signing/debug.keystore');
  if (!existsSync(signing)) {
    mkdirSync(path.dirname(signing), {recursive: true});
    const keytool = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
    execFileSync(keytool, ['-genkeypair', '-keystore', signing, '-storepass', 'android', '-keypass', 'android',
      '-alias', 'androiddebugkey', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
      '-dname', 'CN=Android Debug,O=Android,C=US'], {stdio: 'inherit'});
  }
  if (process.platform === 'win32') execSync('gradlew.bat assembleDebug', {cwd: android, env, stdio: 'inherit'});
  else execFileSync('sh', ['gradlew', 'assembleDebug'], {cwd: android, env, stdio: 'inherit'});
  const apk = path.join(android, 'app/build/outputs/apk/debug/app-debug.apk');
  const jar = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar');
  const packaged = new Set(execFileSync(jar, ['tf', apk], {encoding: 'utf8'}).split(/\r?\n/));
  function verify(folder, prefix = 'assets/public') {
    for (const item of readdirSync(folder, {withFileTypes: true})) {
      if (item.name.startsWith('.')) continue;
      const entry = `${prefix}/${item.name}`;
      if (item.isDirectory()) verify(path.join(folder, item.name), entry);
      else if (!packaged.has(entry)) throw Error(`APK omitted web asset: ${entry}`);
    }
  }
  verify(assets);
  console.log(`APK verified: ${apk}`);
}
