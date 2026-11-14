import {clampTextScale, textScaleRange} from "../kernel/text-scale";

/**
 * 文字倍率存在本机。
 *
 * `null` 表示「没调过，跟着默认走」：默认倍率由 CSS 的媒体查询决定
 * （手机 1×、桌面 1.5×），这里不复制一份，免得两边各说各话。
 */
export class BrowserTextScale {
    current(): number | null {
        try {
            const raw = localStorage.getItem("akamonkai.text-scale");
            if (!raw) return null;
            const value = Number(raw);
            if (!Number.isFinite(value) || value < textScaleRange.min || value > textScaleRange.max) return null;
            return clampTextScale(value);
        } catch {
            return null;
        }
    }

    select(scale: number | null) {
        try {
            if (scale === null) localStorage.removeItem("akamonkai.text-scale");
            else localStorage.setItem("akamonkai.text-scale", String(clampTextScale(scale)));
        } catch { /* 存储不可用时本次仍然生效，只是记不住。 */
        }
    }
}
