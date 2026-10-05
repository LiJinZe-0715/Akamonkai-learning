import { useEffect, useSyncExternalStore } from "react";
import { useStudy, useUi } from "../context";
export function useSpeechState() {
  const { services } = useStudy();
  return useSyncExternalStore(services.speech.subscribe.bind(services.speech), services.speech.snapshot.bind(services.speech), services.speech.snapshot.bind(services.speech));
}
export function VoiceSelect({ role, lessonId }: { role?: string; lessonId?: string }) {
  const { services } = useStudy();
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
      {!role && !voices.length && <option value="">{t(device && state.deviceStatus === "loading" ? "ui.speechLoading" : "ui.speechNoVoices")}</option>}
      {voices.map(v => <option key={v.id} value={v.id}>{v.name}{device ? ` (${t(v.local ? "ui.speechLocal" : "ui.speechOnline")})` : ""}</option>)}
    </select>
  </label>;
}
export function SpeechControls() {
  const { services } = useStudy();
  const t = useUi();
  const state = useSpeechState();
  useEffect(() => services.speech.initialize(), [services]);
  return <section className="speech-controls" aria-label={t("ui.speechSettings")}>
    <div className="button-row">
      <label>{t("ui.speechEngine")}<select value={state.engine} onChange={e => services.speech.selectEngine(e.target.value === "voicevox" ? "voicevox" : "device")}>
        <option value="device">{t("ui.speechDevice")}</option>
        {state.voicevoxVoices.length > 0 && <option value="voicevox">VOICEVOX</option>}
      </select></label>
      <VoiceSelect />
      <button disabled={state.detecting} onClick={() => void services.speech.detectVoicevox()}>{t(state.detecting ? "ui.voicevoxDetecting" : "ui.voicevoxDetect")}</button>
      <button disabled={!state.playing} onClick={() => services.speech.stop()}>{t("ui.stop")}</button>
    </div>
    {state.engine === "device" && state.deviceStatus !== "ready" && <p role="status">{t(state.deviceStatus === "unsupported" ? "ui.speechUnsupported" : state.deviceStatus === "loading" ? "ui.speechLoading" : "ui.speechNoJapanese")}</p>}
    {state.notice && <p role="status">{t(state.notice)}</p>}
    <small>{t("ui.voicevoxLocalHint")}</small>
  </section>;
}
