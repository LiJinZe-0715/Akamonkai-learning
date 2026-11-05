import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import {test} from "../harness.mjs";
import {signingCertificates} from "../apk-file.mjs";

/**
 * Android 打包产物。
 *
 * 校验的不是 Java 代码，而是「装到手机上的那个包」：
 * 应用名会不会随系统语言切换、线上版本信息是不是由当前包生成的、
 * 线上包是否真的包含这些改动。这三件事都能在没有 SDK 的机器上验证。
 */

const read = file => fs.readFileSync(file, "utf8");

/**
 * 线上安装包的字节。
 *
 * 包随源码提交；缺了就跳过并说明，不制造 ENOENT。
 */
function publishedApk(build) {
    const file = `public/downloads/${build.apkName}`;
    // APK 随源码提交，正常检出里一定有它；缺了（比如只取了部分分支）就跳过这两条。
    if (!fs.existsSync(file)) {
        console.warn(`  · 跳过 APK 字节校验：${file} 不存在`);
        return null;
    }
    return fs.readFileSync(file);
}

/** 从 strings.xml 里取出 app_name 的值。 */
function appName(file) {
    const found = /<string\s+name="app_name"\s*>([^<]*)<\/string>/.exec(read(file));
    assert(found, `${file} 缺少 app_name`);
    return found[1];
}

const hasCjk = text => /[\u3400-\u9fff\uf900-\ufaff]/.test(text);

/** build.gradle 是版本号的唯一来源，其余文件都从它派生。 */
function buildConfig() {
    const source = read("android/app/build.gradle");
    const pick = (label, pattern) => {
        const found = pattern.exec(source);
        assert(found, `build.gradle 缺少 ${label}`);
        return found[1];
    };
    return {
        applicationId: pick("applicationId", /applicationId\s+'([^']+)'/),
        versionCode: Number(pick("versionCode", /versionCode\s+(\d+)/)),
        versionName: pick("versionName", /versionName\s+'([^']+)'/),
        // buildConfigField 'String', 'UPDATE_BASE_URL', '"https://..."' —— 值是套在双引号里的 Java 字符串。
        baseUrl: pick("UPDATE_BASE_URL", /'UPDATE_BASE_URL'\s*,\s*'"([^"]+)"'/),
        apkName: pick("UPDATE_APK_NAME", /'UPDATE_APK_NAME'\s*,\s*'"([^"]+)"'/),
    };
}

test("android:应用名随系统语言切换", [], () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    // 应用名必须走资源引用。写死字面量之后，再怎么加 values-zh 都切不过去。
    assert.match(manifest, /android:label="@string\/app_name"/, "清单应以 @string/app_name 作为应用名");

    const english = appName("android/app/src/main/res/values/strings.xml");
    const chinese = appName("android/app/src/main/res/values-zh/strings.xml");

    // 断言的是「哪一边该是什么语言」，不是具体文案——改名字不用改测试。
    assert(!hasCjk(english), `默认资源是英文系统的兜底，不应含中文：${english}`);
    assert(hasCjk(chinese), `values-zh 是中文系统的应用名，应为中文：${chinese}`);
    assert.notEqual(english, chinese, "两种语言的应用名不应相同");
});

test("android:壳的提示文字全部走资源，中英两份键一致", [], () => {
    const strings = file => new Map([...read(file).matchAll(/<string\s+name="([^"]+)"\s*>([^<]*)<\/string>/g)]
        .map(match => [match[1], match[2]]));
    const english = strings("android/app/src/main/res/values/strings.xml");
    const chinese = strings("android/app/src/main/res/values-zh/strings.xml");
    assert.deepEqual([...chinese.keys()].sort(), [...english.keys()].sort(), "values 与 values-zh 的键必须一致");
    // 带参数的提示两边占位符要一样，否则 getString 在某种语言下会少填或抛错。
    const placeholders = text => (text.match(/%\d+\$[sd]/g) ?? []).sort().join(",");
    for (const [key, text] of english)
        assert.equal(placeholders(chinese.get(key)), placeholders(text), `占位符不一致：${key}`);

    const folder = "android/app/src/main/java/app/study/mobile";
    for (const name of fs.readdirSync(folder).filter(item => item.endsWith(".java"))) {
        // 去掉注释再找：注释里写中文是允许的，字符串字面量不行。
        const code = read(`${folder}/${name}`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
        const literal = [...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)].find(match => hasCjk(match[1]));
        assert(!literal, `${name} 里有写死的中文提示，应放进 strings.xml：${literal?.[1]}`);
        for (const [, key] of code.matchAll(/R\.string\.(\w+)/g))
            assert(english.has(key), `${name} 引用了不存在的字符串 R.string.${key}`);
    }
});

test("android:线上版本信息与打包配置一致", [], () => {
    const build = buildConfig();
    const release = JSON.parse(read("public/downloads/version.json"));

    assert.equal(release.applicationId, build.applicationId, "version.json 的 applicationId 与 Gradle 不符");
    assert.equal(release.versionCode, build.versionCode, "version.json 的 versionCode 与 Gradle 不符");
    assert.equal(release.versionName, build.versionName, "version.json 的 versionName 与 Gradle 不符");
    // 版本号已经不参与任何判断（AppUpdates 比的是包自己的 sha256），留着纯数字点分
    // 只是不让它长成 1.0-beta 那种看起来像在比大小的东西。
    assert.match(release.versionName, /^\d+(?:\.\d+){0,2}$/, `versionName 必须是纯数字点分：${release.versionName}`);
    assert.equal(release.apkUrl, `${build.baseUrl}${build.apkName}`, "apkUrl 与 Gradle 里的更新地址不符");
    assert.match(release.sha256, /^[a-f0-9]{64}$/, "sha256 应是 64 位小写十六进制");

    // 哈希对不上说明 version.json 不是由这个包生成的，用户下到的包与声明的不是同一个。
    const apk = publishedApk(build);
    if (apk === null) return;
    assert.equal(createHash("sha256").update(apk).digest("hex"), release.sha256,
        "线上安装包的 sha256 与 version.json 不符，请重新执行 pnpm android:publish");
});

test("android:线上安装包用登记的证书签名", [], () => {
    const apk = publishedApk(buildConfig());
    if (apk === null) return;
    const {certificateSha256} = JSON.parse(read("android/release-signing.json"));
    assert.match(certificateSha256, /^[a-f0-9]{64}$/, "release-signing.json 的证书指纹应是 64 位小写十六进制");
    // 换了钥匙的包装不上已装的设备：只能卸载重装，学习记录跟着丢。
    const certificates = signingCertificates(apk);
    assert(certificates.includes(certificateSha256),
        `线上安装包的签名证书 ${certificates.map(item => item.slice(0, 8))} 不是登记的 ${certificateSha256.slice(0, 8)}`);
});

test("android:线上安装包内含两种语言的应用名", [], () => {
    const build = buildConfig();
    const apk = publishedApk(build);
    if (apk === null) return;
    const names = [
        ["默认（英文）", appName("android/app/src/main/res/values/strings.xml")],
        ["中文", appName("android/app/src/main/res/values-zh/strings.xml")],
    ];
    for (const [label, name] of names)
        // resources.arsc 以 UTF-8 存字符串，直接在包里找原始字节，不依赖 aapt2。
        assert(apk.includes(Buffer.from(name, "utf8")),
            `线上安装包缺少${label}应用名「${name}」，说明 APK 没跟着资源改动重新打包`);
});
