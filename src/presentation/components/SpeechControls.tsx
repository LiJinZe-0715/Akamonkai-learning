import {useEffect, useSyncExternalStore} from "react";
import {useServices, useUi} from "../StudyContext";
import {SPEECH_RATE} from "../../modules/speech/public";

export function useSpeechState() {
    const services = useServices();
    return useSyncExternalStore(services.speech.subscribe.bind(services.speech), services.speech.snapshot.bind(services.speech), services.speech.snapshot.bind(services.speech));
}

export function VoiceSelect({role, lessonId}: { role?: string; lessonId?: string }) {
    const services = useServices();
    const t = useUi();
    const state = useSpeechState();
    const device = state.engine === "device";
    const voices = device ? state.deviceVoices : state.voicevoxVoices;
    const value = role ? services.speech.roleVoice(lessonId ?? "", role) : device ? state.selectedDevice : state.selectedVoicevox;
    return <label>{role ?? t("ui.speechVoice")}
        <select value={value} disabled={!voices.length} onChange={e => role
            ? services.speech.setRoleVoice(lessonId ?? "", role, e.target.value)
            : services.speech.selectVoice(e.target.value)}>
            {role && <option value="">{t("ui.speechDefault")}</option>}
            {!role && !voices.length && <option
                value="">{t(device && state.deviceStatus === "loading" ? "ui.speechLoading" : "ui.speechNoVoices")}</option>}
            {voices.map(v => <option key={v.id}
                                     value={v.id}>{v.name}{device ? ` (${t(v.local ? "ui.speechLocal" : "ui.speechOnline")})` : ""}</option>)}
        </select>
    </label>;
}

export function SpeechControls() {
    const services = useServices();
    const t = useUi();
    const state = useSpeechState();
    useEffect(() => services.speech.initialize(), [services]);
    return <section className="speech-controls" aria-label={t("ui.speechSettings")}>
        <div className="button-row">
            <label>{t("ui.speechEngine")}<select value={state.engine}
                                                 onChange={e => services.speech.selectEngine(e.target.value === "voicevox" ? "voicevox" : "device")}>
                <option value="device">{t("ui.speechDevice")}</option>
                {state.voicevoxVoices.length > 0 && <option value="voicevox">VOICEVOX</option>}
            </select></label>
            <VoiceSelect/>
            <button disabled={state.detecting}
                    onClick={() => void services.speech.detectVoicevox()}>{t(state.detecting ? "ui.voicevoxDetecting" : "ui.voicevoxDetect")}</button>
            <button disabled={!state.playing} onClick={() => services.speech.stop()}>{t("ui.stop")}</button>
        </div>
        <div className="button-row">
            <label>{t("ui.speechRate")}
                <input type="range" min={SPEECH_RATE.min} max={SPEECH_RATE.max} step={SPEECH_RATE.step}
                       value={state.rate}
                       aria-valuetext={state.rate.toFixed(2) + "×"}
                       onChange={e => services.speech.setRate(Number(e.target.value))}/>
            </label>
            <output>{state.rate.toFixed(2)}×</output>
            {/* Remount on a changed address so the field follows detection without
                becoming a controlled input that fights the user's typing. */}
            <label className="speech-address">{t("ui.voicevoxUrl")}
                <input type="text" key={state.engineUrl} defaultValue={state.engineUrl}
                       placeholder="127.0.0.1:50021" spellCheck={false}
                       onBlur={e => services.speech.setEngineUrl(e.target.value)}
                       onKeyDown={e => {
                           if (e.key === "Enter") e.currentTarget.blur();
                       }}/>
            </label>
            {/* Without this, a wrong address stays sticky and the built-in list is
                never tried again; clearing the field is the only way back. */}
            {state.engineUrl && <button type="button"
                                       onClick={() => services.speech.setEngineUrl("")}>{t("ui.voicevoxAuto")}</button>}
        </div>
        {state.engine === "device" && state.deviceStatus !== "ready" &&
            <p role="status">{t(state.deviceStatus === "unsupported" ? "ui.speechUnsupported" : state.deviceStatus === "loading" ? "ui.speechLoading" : "ui.speechNoJapanese")}</p>}
        {state.notice && <p role="status">{t(state.notice)}</p>}
        <small>{t("ui.voicevoxLocalHint")}</small>
    </section>;
}
