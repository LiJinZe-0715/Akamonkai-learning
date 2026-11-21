/**
 * 真题侧的兼容入口：地址解析已上移到全站共用的 siteMediaUrl，
 * 教材本文录音也用同一份。换域名只改 src/presentation/site-media.ts 一处。
 */
export {SITE_MEDIA_BASE as EXAM_MEDIA_BASE, siteMediaUrl as examMediaUrl} from "../../../../presentation/site-media";
