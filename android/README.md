# 赤门会日语学习 Android

Android 8.0 及以上的个人试用 APK。课程和页面内置在安装包中，断网也能阅读、搜索和练习；设备日语朗读由 Android TextToSpeech 提供。先在手机的文字转语音设置中安装日语声音，离线朗读请选择离线声音。网络声音仍需要联网。

App 沿用现有网页界面和业务逻辑，使用独立且固定的本地 HTTPS 来源。网站与 App 的记录不会自动互通；原项目支持导入导出时，可通过 JSON 手动迁移。清除 App 数据或卸载会删除本机记录。内容更新需要重新构建并安装新版 APK。

## 构建

需要 Node.js、项目锁定的 pnpm、JDK 17，以及 Android SDK 35 / Build Tools 36.0.0。设置 `JAVA_HOME` 和 `ANDROID_HOME`，在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm android:build
```

构建命令先检查和构建网页，再把页面复制到 `android/app/src/main/assets/public/`。随后运行 Gradle Wrapper 生成 `android/app/build/outputs/apk/debug/app-debug.apk`。可使用 Android Studio 打开 `android/`。Windows 在 `android/` 中运行 `gradlew.bat assembleDebug`；macOS/Linux 运行 `sh gradlew assembleDebug`。

首次构建自动生成 `android/.signing/debug.keystore`，只用于个人试用，不进入 Git。请保留该文件：覆盖安装新版必须使用同一个签名。发布到应用商店前需要单独配置正式签名和发布构建，并完成真机测试。

## Android 适配

- 本地 HTTPS 资源支持课程请求、目录路由、localStorage 和 Web Locks。
- 系统返回键退回上个页面，首页返回会询问是否退出；键盘与系统栏不遮挡内容。
- 日语朗读接到系统语音，进入后台停止朗读。暂停后继续会重读当前句，Android TTS 不提供句中暂停。
- 原项目的 JSON 备份使用系统文件保存／选择器，无需申请访问整个存储的权限。
- 外部链接交给浏览器；网页字体在离线时使用 Android 自带中日文字体。
- VOICEVOX 不包含在 APK 中；电脑上的 `127.0.1` 引擎不能直接从手机访问。App 默认使用设备日语声音。

## 提交

提交 `android/` 的源码、Gradle Wrapper、`scripts/build-android.mjs` 和 `package.json`。不要提交 SDK、构建缓存、复制的课程页面、APK 或 `.signing/`。

网站 APK 下载副本 `public/downloads/Akamonkai-learning.apk` 是需提交的发布资源；本页所说不提交 APK，是指 `android/app/build/` 中的构建输出。运行 `pnpm android:publish` 更新网站下载副本。

## 检查更新

App 顶部提供“检查更新”。每次冷启动也会在后台检查，只有发现新版才提示；网络或网站不可用时不影响离线学习。用户确认后通过浏览器下载 APK，再由 Android 确认覆盖安装。

每次发布修改 `android/app/build.gradle` 的 `versionCode`（必须递增）和 `versionName`，依次运行 `pnpm android:build`、`pnpm android:publish`。后者从本次构建元数据生成 `public/downloads/version.json`，与 APK 一起提交并部署。保留原签名；覆盖安装保留记录，卸载则会删除记录。

检查地址：`https://lijinze-0715.github.io/Akamonkai-learning/downloads/version.json`。更换网站域名时同步修改 Gradle 的 `UPDATE_BASE_URL` 与发布脚本中的 `apkUrl`。旧 1.0.0 没有检查入口，需先手动安装一次带检查更新功能的 0.1。

验证更新发布：`node android/tests/update-publish.test.mjs`。构建后，连接 Android 模拟器或设备并运行 `node android/tests/check-updates.mjs`，检查版本比较和下载地址校验。

版本由维护者手动管理，不读取 Git 提交次数、提交哈希、标签或 package.json 版本。当前显示版本为 `0.3`，内部 `versionCode` 为 `4`。后续发布由你手动设置显示版本，并将 `versionCode` 递增为 `5`、`6` 等；构建与发布脚本不会自行增加版本号。`version.json` 由脚本复制实际 APK 的版本信息，无需单独手改。

检查更新仅按 `versionName` 的数字段从左到右比较：`0.2 > 0.1`、`0.10 > 0.9`、`1.0 > 0.99`；不作小数或字符串比较，不以 `versionCode` 或 Git 信息判断新版。当前发布使用两段版本号，比较逻辑兼容之前三段版本号（缺少的末段按 0 处理）。`versionCode` 仍需随正式发布手动递增，用于满足 Android 覆盖安装要求。
