# 赤门会日语学习

一个纯前端、离线可用的日语学习应用：把几本日语教材的内容整理成可逐课学习的单词本、文法、汉字与测验，配朗读、收藏和进度记录。同时打包为 Android App。

没有后端。所有内容在构建时编译成静态 JSON，学习记录保存在浏览器（或 WebView）本地，可导入导出。

## 功能

- **逐课学习**：按教材 → 课次/学习日 → 单元逐级进入，单元内提供「单词、文法、汉字、测验」等学习模式。
- **测验**：词汇选择题、读音题、文法题按单元内容自动生成，固定题目来自教材原题；提交后给分并记录错题。
- **收藏与掌握**：任意词条可标记「收藏 / 已掌握」，跨教材共享。
- **朗读**：浏览器语音合成，可切换引擎、语速、角色；支持本地 VOICEVOX（需自行启动服务）。
- **进度**：继续上次学习、最近练习记录、整体统计；数据存本地，可导出/导入 JSON，多标签页写入有保护。
- **界面**：中文 / English 切换，深色 / 浅色主题，移动端优先布局。
- **Android App**：WebView 壳 + 原生 TTS 桥接，支持应用内检查更新。

## 学习内容

| 分组 | 教材 | 单元数 |
| --- | --- | ---: |
| 初级～初中级（N5～N3） | みんなの日本語 初級Ⅰ・Ⅱ | 52 |
| | 片假名练习 | 35 |
| | 1日15分の漢字練習 | 540 |
| | Topic シリーズ（Topic 1–6） | 14 |
| JLPT文法总结 | 日本語能力試験 N2 文法・類似表現 | 15 |
| 新中级（N2） | 中級を学ぼう（第1–8課 ＋ 漢字練習） | 16 |
| | 中級漢字700 | 200 |
| | TRY! 日本語能力試験 N2 | 6 |
| | 日本語総まとめ N2 語彙 | 12 |

合计 **890 个单元**、6,559 条词汇、3,536 道固定题目，另有独立的动词活用参考资料。两本汉字教材按单个汉字组织，阅读时每 20 字合成一课；中級を学ぼう 的漢字練習按课合成一组（176 字、394 个词），并附 8 篇本文（125 句，逐句中・英对照）。

## 快速开始

需要 Node 24 或 26、pnpm 12。

```bash
pnpm install
pnpm dev          # 编译内容并启动开发服务器（127.0.0.1:4173）
```

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 编译内容 → 启动 Vite 开发服务器 |
| `pnpm check` | 跑全部内容与行为校验（构建前必过） |
| `pnpm build` | 校验 → 编译内容 → 类型检查 → 打包到 `dist/` |
| `pnpm preview` | 预览 `dist/` |
| `pnpm android:build` | 打包 Web 资源并构建 APK |
| `pnpm android:test` | 跑 Android 侧单元测试 |
| `pnpm android:publish` | 把 APK 与版本信息发布到网站下载目录 |

改了 `data/content/` 下的 JSON 后需要重新编译内容（`node scripts/build-content.mjs` 或重跑 `pnpm dev`），页面不会直接热加载源数据。

## 项目结构

```text
index.html              入口
src/                    应用源码（按模块分层：domain / application / infrastructure / presentation）
  modules/              教材与课程、测评、文法、词汇、汉字、语音、进度、文案
  presentation/         外壳、主题、通用组件
data/content/           内容数据源（教材、词汇、文案、参考资料）
scripts/                内容编译、校验、Android 构建与发布脚本
android/                Android 工程（WebView + 原生 TTS + 更新检查）
public/                 静态资源与构建产物内容（public/content 为生成目录）
dist/                   构建输出
```

源码按模块划分，依赖方向为 presentation → application → domain，infrastructure 实现 application 定义的端口。`scripts/check.mjs` 会用 AST 扫全部 import 与关键字，拦截越界引用（例如 domain 里出现 React、application 里出现 `fetch`、UI 里出现文件适配器）。

## 技术栈

React 19 + TypeScript + Vite 8。样式以手写 CSS 为主（CSS 变量驱动深浅主题），Tailwind 作为构建插件引入。没有后端、没有状态管理库、没有 UI 框架。内容在构建期由 `scripts/compile-content.mjs` 编译成静态 JSON，运行时按需请求并缓存。

## 部署

推送到 `main` 后由 GitHub Actions 自动构建并发布到 GitHub Pages（`.github/workflows/deploy-pages.yml`）。生产构建的 `base` 为 `/Akamonkai-learning/`，部署到其他路径或域名需同步修改 `vite.config.ts` 与 Android 的更新地址。

## Android App

- 原生壳在 `android/`，`MainActivity` 加载打包进 assets 的网页，`NativeSpeech` 提供系统 TTS，`AppUpdates` 检查新版本。
- 打包前先 `pnpm build`，`pnpm android:build` 会把 `dist/` 拷进 `android/app/src/main/assets/public/` 并调用 Gradle。
- 发布新版本要手动抬高 `android/app/build.gradle` 的 `versionCode`（当前 5），再 `pnpm android:build` + `pnpm android:publish`，把生成的 APK 与 `version.json` 一起提交部署。
- 签名文件保留在 `android/.signing/`，覆盖安装才能保留学习记录。

## 质量保障

`pnpm check` 是一个自研校验套件，覆盖：内容结构与译文完整性、ID 唯一性、题目可作答、评分与多答案、模块边界、主题与持久化、语音流程、汉字分组与教材隔离、SSR 渲染（中英双语）。任何一条不过，`pnpm build` 不会产出包。
