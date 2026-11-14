import type {UiTextId} from "../../modules/localization/public";
import {useServices, useUi} from "../StudyContext";
import {speechPause} from "../../modules/speech/public";
import {RateControl} from "./RateControl";
import {VoiceSelect} from "./VoiceSelect";
import {speechStatusText, useSpeechState} from "./speech-state";
import {desktopClient, engineGuideHref, engineOffer, openTtsSettings, phoneClient, ttsSettingsAvailable} from "./speech-engine-link";

/** 手机可能报出很长一份列表，检查结果只展示可读的一小段。 */
const listedVoices = 8;

/**
 * 只读的引擎检查：系统提供了什么，以及是不是日语。
 * 声音带本地/在线标记，所以「日语怎么没声」在这里能查到原因。
 */
function SpeechDiagnostics() {
    const services = useServices();
    const t = useUi();
    const state = useSpeechState();
    const voices = state.voices;
    const shown = voices.slice(0, listedVoices);
    const message = speechStatusText(state);
    const japanese = voices.filter(voice => voice.japanese).length;
    const hint = engineHint();
    const platform = state.deviceStatus === "unsupported" ? t("ui.speechUnsupported") : "Web Speech API";
    return <section className="speech-diagnostics" aria-label={t("ui.speechEngine")}>
        <dl>
            <dt>{t("ui.speechEngine")}</dt>
            <dd>{platform}</dd>
            <dt>{t("ui.speechDevice")}{voices.length > 0 &&
                <span className="speech-count">{voices.length}</span>}</dt>
            <dd>{voices.length ? <ul className="speech-voice-list">
                {shown.map(voice => <li key={voice.id}
                                        aria-current={voice.id === state.selectedVoice ? "true" : undefined}>
                    <span className="speech-voice-name">{voice.name}</span>
                    {voice.lang && <code>{voice.lang}</code>}
                    {voice.japanese === false &&
                        <span className="speech-voice-tag speech-voice-other">{t("ui.speechUntagged")}</span>}
                    <span className="speech-voice-tag">{t(voice.local ? "ui.speechLocal" : "ui.speechOnline")}</span>
                </li>)}
                {voices.length > shown.length && <li className="speech-voice-more" aria-hidden="true">…</li>}
            </ul> : <span aria-hidden="true">—</span>}</dd>
        </dl>
        {message && <p role="status">{t(message)}</p>}
        {/* 手机的引擎常常是页面开着时才装好的，所以给一次重新检查的机会。 */}
        {state.deviceStatus !== "unsupported" && <div className="button-row speech-actions">
            <button type="button"
                    onClick={() => services.speech.refreshVoices()}>{t("ui.speechRecheck")}</button>
            {voices.length > japanese && <span
                className="speech-hint">{t("ui.speechVoiceSummary", {count: japanese, total: voices.length})}</span>}
        </div>}
        {/* 过滤是静默进行的，这里说明一共滤掉了多少个声音。 */}
        {state.hiddenVoices > 0 && <p className="speech-hint">{t("ui.speechHidden", {count: state.hiddenVoices})}</p>}
        {/* 一个日语声音都找不到时，指出这一端该去哪里补——手机和 Windows 补的地方不一样。 */}
        {(state.deviceStatus === "empty" || state.deviceStatus === "no-japanese") && hint &&
            <p className="speech-hint">{t(hint)}</p>}
    </section>;
}

/** 这一端缺日语声音时该看哪里；两端都不认识时不给提示，免得指错路。 */
function engineHint(): UiTextId | "" {
    if (phoneClient()) return "ui.speechPhoneHint";
    return desktopClient() ? "ui.speechWindowsHint" : "";
}

/**
 * 这台设备从哪里获得日语声音。只有手机和 Windows 需要：其他桌面平台用系统
 * 自带的声音读，页面不会替它安装任何东西。入口始终保留，已经能听到日语的
 * 读者也可以换成更好的声音。
 */
function EngineDownload() {
    const t = useUi();
    const offer = engineOffer();
    if (!offer) return null;
    return <section className="engine-download" aria-label={t("ui.engineDownload")}>
        <div><strong>{t("ui.engineDownload")}</strong><p>{t("ui.engineDownloadHint")}</p></div>
        <div className="engine-download-actions">
            <a className="engine-download-get" href={offer.url} target="_blank"
               rel="noreferrer">{t(offer.label)}</a>
            <a className="engine-download-how" href={engineGuideHref}>{t("ui.guideOpen")}</a>
            {ttsSettingsAvailable() &&
                <button type="button" className="engine-download-settings"
                        onClick={openTtsSettings}>{t("ui.speechOpenSettings")}</button>}
        </div>
    </section>;
}

/** 播放设置保持精简：声音、语速，然后是声音检查。 */
export function SpeechControls() {
    const services = useServices();
    const t = useUi();
    const state = useSpeechState();
    return <section className="speech-controls" aria-label={t("ui.speechSettings")}>
        <div className="button-row">
            <VoiceSelect/>
            <RateControl/>
            <label>{t("ui.speechPause")}
                <input type="range" min={speechPause.min} max={speechPause.max} step={speechPause.step}
                       value={state.pause}
                       aria-valuetext={state.pause + " ms"}
                       onChange={e => services.speech.setPause(Number(e.target.value))}/>
            </label>
            <output>{state.pause + " ms"}</output>
            {state.playing && <button onClick={() => services.speech.stop()}>{t("ui.stop")}</button>}
        </div>
        {/* 网页端只能把 rate 交给系统声音，个别引擎会直接忽略；Android 壳在播放端变速，不受此限。 */}
        <p className="speech-hint">{t("ui.speechRateHint")}</p>
        <SpeechDiagnostics/>
        <EngineDownload/>
    </section>;
}
