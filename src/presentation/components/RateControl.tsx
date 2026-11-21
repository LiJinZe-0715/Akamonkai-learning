import {useServices, useUi} from "../StudyContext";
import {speechRate} from "../../modules/speech/public";
import {useSpeechState} from "./speech-state";

/**
 * 语速滑杆：设置页和各课页的声优栏共用同一份实现，读写同一个用例层状态。
 *
 * 只放滑杆本身；「某些引擎不支持变速」这类说明由设置页补，课页保持精简。
 */
export function RateControl() {
    const services = useServices();
    const t = useUi();
    const state = useSpeechState();
    return <label className="speech-rate">
        {t("ui.speechRate")}
        <input type="range" min={speechRate.min} max={speechRate.max} step={speechRate.step}
               value={state.rate}
               aria-valuetext={state.rate.toFixed(2) + "×"}
               onChange={e => services.speech.setRate(Number(e.target.value))}/>
        <output>{state.rate.toFixed(2) + "×"}</output>
    </label>;
}
