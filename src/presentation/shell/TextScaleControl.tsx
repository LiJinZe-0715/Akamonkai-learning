import {useUi} from "../StudyContext";
import {textScaleRange} from "../../shared/kernel/text-scale";
import {useTextScale} from "./use-text-scale";

/** 设置页里的「放大倍率」：一条滑杆调全站文字倍率，旁边是当前百分比和复原。 */
export function TextScaleControl() {
    const t = useUi();
    const {value, custom, change, reset} = useTextScale();
    const percent = Math.round(value * 100);
    return (
        <div className="text-scale-setting">
            <input
                id="text-scale-range"
                type="range"
                min={Math.round(textScaleRange.min * 100)}
                max={Math.round(textScaleRange.max * 100)}
                step={Math.round(textScaleRange.step * 100)}
                value={percent}
                aria-labelledby="text-scale-label"
                onChange={event => change(Number(event.currentTarget.value) / 100)}
            />
            <output htmlFor="text-scale-range">{percent}%</output>
            <button type="button" className="text-scale-reset" onClick={reset} disabled={!custom}>
                {t("ui.textScaleReset")}
            </button>
        </div>
    );
}
