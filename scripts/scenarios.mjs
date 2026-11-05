import fs from "node:fs";
import assert from "node:assert/strict";

/**
 * 场景清单。
 *
 * 这里几乎不手写枚举值：视图、等级、语言、设备状态、导入/提交结果、主题
 * 全部从真实源码里提取。契约新增一个取值，清单立刻多一项，
 * 没写对应用例就覆盖不到 100%，构建直接失败。
 *
 * 手写的只有「失败分支」这类代码里没有枚举可依的场景（存储配额满、坏 JSON 等）。
 */

const read = file => fs.readFileSync(file, "utf8");

/** 从源码里抠出一段字符串字面量，契约改了这里就跟着改。 */
function literals(file, pattern, label) {
    const source = read(file);
    const match = pattern.exec(source);
    assert(match, `无法从 ${file} 提取${label}，源码结构可能变了`);
    return [...match[0].matchAll(/"([^"]+)"/g)].map(item => item[1]);
}

const CATALOG_DOMAIN = "src/modules/curriculum/domain/catalog.ts";
const SPEECH_CONTRACTS = "src/modules/speech/application/contracts.ts";
const PROGRESS_CONTRACTS = "src/modules/learning-progress/application/contracts.ts";
const SESSION_CONTRACTS = "src/application/study-session-service.ts";
const TEXT_TYPES = "src/shared/kernel/text-types.ts";
const THEME = "src/shared/kernel/theme.ts";

export const views = literals(CATALOG_DOMAIN, /const viewOrder: readonly View\[\] = \[[^\]]*\];/, "视图清单");
export const levels = literals(CATALOG_DOMAIN, /export const libraryLevels = \[[^\]]*\] as const;/, "库等级");
export const locales = literals(TEXT_TYPES, /export type Locale = [^;]+;/, "语言");
export const deviceStatuses = literals(SPEECH_CONTRACTS, /deviceStatus: [^;]+;/, "语音设备状态");
export const importStatuses = literals(PROGRESS_CONTRACTS, /export type ImportOutcome = .*$/m, "导入结果");
export const submissionStatuses = literals(SESSION_CONTRACTS, /export type Submission = .*$/m, "提交结果");
export const themes = literals(THEME, /export type Theme = [^;]+;/, "主题");

/** 路由级页面。视图级页面由 views 派生，不在这里重复。 */
const pages = ["catalog", "book", "lesson", "guide"];

/** 课的模块组合：普通课、纯汉字课、汉字与词表并存的课。 */
const unitShapes = [
    ["plain", "普通课（有词表、无汉字）"],
    ["kanji-group", "纯汉字课（只有汉字模块）"],
    ["absorbed-kanji", "汉字与词表并存的课"],
];

const routes = [
    ["valid", "合法路由"],
    ["missing", "缺少路由参数"],
    ["invalid", "非法路由参数"],
    ["legacy", "旧版单字路由明确拒绝"],
    ["focus", "返回定位到上次课"],
    ["cross-book", "跨教材定位"],
];

const progressStates = [
    ["empty", "全新进度"],
    ["resuming", "有上次学习位置"],
    ["stale", "上次位置已失效"],
    ["results", "有考试成绩"],
    ["marks", "有单词标记"],
    ["legacy-character", "旧版单字成绩被忽略，不复活已删内容"],
];

const storageStates = [
    ["healthy", "存储正常"],
    ["quota", "写入失败（配额满/被禁用）"],
    ["corrupt", "存储里是损坏数据"],
    ["absent", "存储为空"],
];

const importCases = [
    ["older-backup", "导入比当前更旧的备份"],
    ["oversized", "导入超过体积上限的文件"],
    ["read-failure", "读取文件时抛错"],
    ["malformed", "导入畸形 JSON 或错误版本"],
];

const exportCases = [
    ["success", "导出进度文件"],
    ["blocked", "下载被拦截后仍释放 Blob URL"],
];

const speechCases = [
    ["offline-preference", "优先选择本地日语语音"],
    ["role-fallback", "角色语音缺失时回退"],
    ["rate-clamp", "语速越界后夹紧"],
    ["ssr", "服务端渲染环境无 window"],
    ["android-device", "安卓壳内强制使用系统语音"],
    ["continuous", "整篇连读时把句子并成一段"],
    ["punctuation-pause", "标点与括号原样交给引擎，只把振假名换成假名"],
    ["prewarm", "第一次播放前先把语音引擎热起来"],
    ["windows-engine", "Windows 给出本地语音引擎的安装入口"],
];

const assessmentCases = [
    ["all-correct", "全部答对"],
    ["partial", "部分答错"],
    ["alternate", "多选题的其它正确选项"],
    ["retry-wrong", "只练错题"],
    ["double-submit", "重复提交只记一次"],
    ["dynamic-vocabulary", "单词测验现场生成且打乱"],
    ["seeded-shuffle", "固定题答案位置分散"],
];

const draftCases = [
    ["debounced", "输入停顿后自动保存"],
    ["background", "切到后台立即落盘"],
    ["pagehide", "页面隐藏时落盘"],
    ["cleared", "提交后清空草稿"],
    ["signature-reuse", "改答案不重建题目签名"],
];

const architectureCases = [
    ["domain-purity", "domain 层不碰框架与浏览器"],
    ["application-purity", "application 层不碰浏览器"],
    ["boundary", "跨模块只走公开入口"],
    ["cycle", "不存在循环依赖"],
    ["content-import", "源码不直接 import 内容数据"],
    ["layer-access", "表现层不直连 domain，模块外只走 public"],
];

const contentCases = [
    ["structure", "目录与课一一对应，模块结构合法"],
    ["texts", "每条译文引用都有中日英"],
    ["questions", "每题都有可判定的答案"],
    ["translation", "英文译文保留日文原句"],
    ["grouping", "汉字按固定字数分课，不重不漏"],
    ["unique-ids", "课、题目、单词 ID 全局唯一"],
    ["question-owner", "固定题挂在对应的条目下"],
    ["example-dialogues", "文法例句里的 A/B 对话拆成 Dialogue"],
];

const kanjiCases = [
    ["textbook-isolation", "两本汉字教材分课独立、编号连续"],
    ["character-detail", "汉字详情：画数、音训读、例词、例句"],
    ["reading-test", "汉字读音题与歧义读音"],
    ["source-photos", "汉字结构化字段（画数、读音、特别读音）完整"],
];

const decodeCases = [
    ["valid", "合法数据往返不变"],
    ["missing-translation", "缺少译文必须拒绝"],
    ["identity", "身份不匹配必须拒绝"],
    ["schema", "版本不符必须拒绝"],
    ["duplicate", "重复条目必须拒绝"],
    ["malformed", "字段类型错误必须拒绝"],
];

const portCases = [
    ["coalesce", "并发请求合并为一次"],
    ["retry", "失败后可以重试"],
    ["traversal", "拒绝路径穿越"],
    ["failure", "网络失败与超时明确报错"],
];

const concurrencyCases = [
    ["stale-writes", "两个陈旧页面并发写都保留"],
    ["queued-toggles", "排队操作基于最新值执行"],
    ["persist-failure", "落盘失败保留内存态"],
];

/** 全文检索：索引覆盖、两端查询、排序与边界。 */
const searchCases = [
    ["index", "索引覆盖教材里的每个课次"],
    ["ja", "日文查询命中例句"],
    ["zh", "中文查询命中词义"],
    ["rank", "完全相同排在包含匹配之前"],
    ["empty", "空查询与纯空格不返回结果"],
    ["decode", "结构损坏的索引被拒绝"],
];

/** 组装成 {id, group, description} 列表。 */
export function scenarioList() {
    const entries = [];
    const add = (group, id, description) => entries.push({id, group, description});

    for (const page of pages) for (const locale of locales) add("页面", `page:${page}:${locale}`, `${page} 页面 · ${locale}`);
    for (const view of views) for (const locale of locales) add("视图", `view:${view}:${locale}`, `${view} 视图 · ${locale}`);
    for (const [id, description] of unitShapes) add("单元形态", `unit:${id}`, description);
    for (const level of levels) add("教材等级", `level:${level}`, `教材库按 ${level} 分组`);
    for (const [id, description] of routes) add("路由", `route:${id}`, description);
    for (const [id, description] of progressStates) add("进度", `progress:${id}`, description);
    for (const [id, description] of storageStates) add("存储", `storage:${id}`, description);
    for (const status of importStatuses) add("导入", `import:${status}`, `导入结果为 ${status}`);
    for (const [id, description] of importCases) add("导入", `import:${id}`, description);
    for (const [id, description] of exportCases) add("导出", `export:${id}`, description);
    for (const status of deviceStatuses) add("语音", `speech:${status}`, `设备语音状态 ${status}`);
    for (const [id, description] of speechCases) add("语音", `speech:${id}`, description);
        for (const status of submissionStatuses) add("答题", `assessment:${status}`, `提交结果为 ${status}`);
    for (const [id, description] of assessmentCases) add("答题", `assessment:${id}`, description);
    for (const [id, description] of draftCases) add("草稿", `draft:${id}`, description);
    for (const [id, description] of architectureCases) add("架构", `arch:${id}`, description);
    for (const [id, description] of contentCases) add("内容", `content:${id}`, description);
    for (const [id, description] of kanjiCases) add("汉字", `kanji:${id}`, description);
    for (const [id, description] of decodeCases) add("解码", `decode:${id}`, description);
    for (const [id, description] of portCases) add("端口", `port:${id}`, description);
    for (const [id, description] of concurrencyCases) add("并发", `concurrency:${id}`, description);
    for (const [id, description] of searchCases) add("检索", `search:${id}`, description);

    return entries;
}
