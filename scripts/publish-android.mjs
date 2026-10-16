import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) throw Error('APK not found. Run pnpm android:build first.');
// Use metadata from the actual APK build, not potentially changed Gradle source.
const metadata = JSON.parse(readFileSync(path.join(path.dirname(apk), 'output-metadata.json'), 'utf8'));
const build = metadata.elements.find(item => item.outputFile === path.basename(apk));
if (!build || !Number.isSafeInteger(build.versionCode) || build.versionCode < 1 || !build.versionName || !metadata.applicationId)
    throw Error('Invalid APK build metadata. Rebuild the APK.');
const downloads = path.join(root, 'public/downloads');
mkdirSync(downloads, {recursive: true});
const published = path.join(downloads, 'Akamonkai-learning.apk');
copyFileSync(apk, published);
const release = {
    applicationId: metadata.applicationId,
    versionCode: build.versionCode,
    versionName: build.versionName,
    apkUrl: 'https://lijinze-0715.github.io/Akamonkai-learning/downloads/Akamonkai-learning.apk',
    sha256: createHash('sha256').update(readFileSync(published)).digest('hex'),
};
writeFileSync(path.join(downloads, 'version.json'), JSON.stringify(release, null, 2) + '\n');
console.log(`Published APK and update information: ${published}`);
console.log('Commit public/downloads with the website changes, then deploy the website.');
