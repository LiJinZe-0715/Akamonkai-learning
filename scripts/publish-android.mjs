import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLog} from './build-log.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = createLog('publish-android');
const apk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const downloads = path.join(root, 'public/downloads');
const published = path.join(downloads, 'Akamonkai-learning.apk');

const build = await log.step('读取打包结果', () => {
    if (!existsSync(apk)) throw Error('找不到 APK，先跑 pnpm android:build。');
    // 用实际 APK 构建产出的元数据，不用可能已被改动的 Gradle 源码。
    const metadata = JSON.parse(readFileSync(path.join(path.dirname(apk), 'output-metadata.json'), 'utf8'));
    const element = metadata.elements.find(item => item.outputFile === path.basename(apk));
    if (!element || !Number.isSafeInteger(element.versionCode) || element.versionCode < 1 || !element.versionName || !metadata.applicationId)
        throw Error('打包结果里的版本信息不完整，重新打包。');
    return {...element, applicationId: metadata.applicationId};
});

await log.step('写入 public/downloads', () => {
    mkdirSync(downloads, {recursive: true});
    copyFileSync(apk, published);
    const release = {
        applicationId: build.applicationId,
        versionCode: build.versionCode,
        versionName: build.versionName,
        apkUrl: 'https://lijinze-0715.github.io/Akamonkai-learning/downloads/Akamonkai-learning.apk',
        sha256: createHash('sha256').update(readFileSync(published)).digest('hex'),
    };
    writeFileSync(path.join(downloads, 'version.json'), JSON.stringify(release, null, 2) + '\n');
    log.info(`已发布 ${path.relative(root, published)}（sha256 ${release.sha256.slice(0, 8)}）`);
    log.info('把 public/downloads 和网站改动一起提交，推送后由 CI 部署。');
});
