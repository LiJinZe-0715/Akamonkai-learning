import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = mkdtempSync(path.join(tmpdir(), 'study-update-'));
try {
    mkdirSync(path.join(temporary, 'scripts'));
    cpSync(path.join(root, 'scripts/publish-android.mjs'), path.join(temporary, 'scripts/publish-android.mjs'));
    const script = path.join(temporary, 'scripts/publish-android.mjs');
    assert.notEqual(spawnSync(process.execPath, [script]).status, 0, 'Missing APK must fail');
    const buildFolder = path.join(temporary, 'android/app/build/outputs/apk/debug');
    mkdirSync(buildFolder, {recursive: true});
    const bytes = Buffer.from('test APK bytes');
    writeFileSync(path.join(buildFolder, 'app-debug.apk'), bytes);
    const metadata = {applicationId: 'app.study.fixture', elements: [{outputFile: 'app-debug.apk', versionCode: 7, versionName: '2.3.4'}]};
    const metadataFile = path.join(buildFolder, 'output-metadata.json');
    writeFileSync(metadataFile, JSON.stringify(metadata));
    execFileSync(process.execPath, [script]);
    const release = JSON.parse(readFileSync(path.join(temporary, 'public/downloads/version.json')));
    assert.equal(release.versionCode, 7);
    assert.equal(release.versionName, '2.3.4');
    assert.equal(release.applicationId, 'app.study.fixture');
    assert.equal(release.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(new URL(release.apkUrl).protocol, 'https:');
    assert.deepEqual(readFileSync(path.join(temporary, 'public/downloads', path.basename(new URL(release.apkUrl).pathname))), bytes);
    metadata.elements[0].versionCode = 0;
    writeFileSync(metadataFile, JSON.stringify(metadata));
    assert.notEqual(spawnSync(process.execPath, [script]).status, 0, 'Invalid build version must fail');
    assert.equal(JSON.parse(readFileSync(path.join(temporary, 'public/downloads/version.json'))).versionCode, 7, 'Invalid metadata must not replace published release');
    console.log('Update publication checks passed');
} finally {
    rmSync(temporary, {recursive: true, force: true});
}
