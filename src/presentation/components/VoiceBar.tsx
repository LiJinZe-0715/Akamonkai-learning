import {useUi} from "../StudyContext";
import {RateControl} from "./RateControl";
import {VoiceSelect} from "./VoiceSelect";

/**
 * 页面级声优栏：所有带朗读按钮的页签共用这一个入口。
 *
 * roles 有值就按角色各配一个声音（对话页、带 A/B 对话例句的文法页）；
 * defaultVoice 打开时再并排放一个整页默认声音，给没有角色的单行例句用。
 * 语速是全局设置，但每个页签都要能直接调，所以和声音下拉放在同一条控件里。
 */
export function VoiceBar({roles, lessonId, defaultVoice = false}: {
    roles?: readonly string[];
    lessonId?: string;
    defaultVoice?: boolean;
}) {
    const t = useUi();
    const selects = <>
        {(!roles?.length || defaultVoice) && <VoiceSelect/>}
        {roles?.map(role => <VoiceSelect key={role} role={role} lessonId={lessonId}/>)}
    </>;
    if (!roles?.length) {
        return <div className="speech-controls speech-voice-bar">
            <div className="button-row">{selects}<RateControl/></div>
        </div>;
    }
    return (
        <section className="speech-controls speech-roles" aria-label={t("ui.speechRoles")}>
            <div className="button-row">{selects}<RateControl/></div>
            <small>{t("ui.speechRoleHint")}</small>
        </section>
    );
}
