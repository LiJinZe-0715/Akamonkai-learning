import {useServices, useUi} from "../StudyContext";
import {speechStatusText, useSpeechState} from "./speech-state";

/**
 * 声音下拉：不给 role 时选的是整页默认声音，给了 role 则是某个对话角色的专属声音。
 * 两种模式共用一份设备声音列表，区别只在读写的配置键。
 */
export function VoiceSelect({role, lessonId}: { role?: string; lessonId?: string }) {
    const services = useServices();
    const t = useUi();
    const state = useSpeechState();
    const voices = state.voices;
    const value = role ? services.speech.roleVoice(lessonId ?? "", role) : state.selectedVoice;
    return <label>{role ?? t("ui.speechVoice")}
        <select value={value} disabled={!voices.length} onChange={e => role
            ? services.speech.setRoleVoice(lessonId ?? "", role, e.target.value)
            : services.speech.selectVoice(e.target.value)}>
            {role && <option value="">{t("ui.speechDefault")}</option>}
            {!role && !voices.length && <option
                value="">{t(speechStatusText(state) || "ui.speechNoVoices")}</option>}
            {/* 列表里剩下的都能读日语，只看名字就足够区分。 */}
            {voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
        </select>
    </label>;
}
