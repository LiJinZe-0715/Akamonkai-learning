import type {ReactNode} from "react";
import {useUi} from "../StudyContext";
import {SpeechControls} from "../components/SpeechControls";
import {TextScaleControl} from "../shell/TextScaleControl";
import {useTheme} from "../shell/use-theme";

type AndroidShell = { checkUpdates?: () => void };

/** App 壳里才有原生的更新检查；网页版改为给出 APK 下载。 */
function androidShell(): AndroidShell | undefined {
    if (typeof window === "undefined") return undefined;
    return (window as { akamonkaiAndroid?: AndroidShell }).akamonkaiAndroid;
}

/** 设置页的一个模块：和首页、教材库一样的粗线标题，下面是一行行设置。 */
function Module({id, title, children}: { id: string; title: string; children: ReactNode }) {
    return <section className="settings-module" aria-labelledby={id}>
        <div className="dashboard-section-heading"><h2 id={id}>{title}</h2></div>
        {children}
    </section>;
}

/** 一行设置：左边说明，右边控件。 */
function Row({label, labelId, children, ...rest}: {
    label: ReactNode;
    labelId?: string;
    children: ReactNode;
    "data-android-download"?: boolean
}) {
    return <div className="setting-row" {...rest}>
        <div className="setting-label" id={labelId}>{label}</div>
        <div className="setting-control">{children}</div>
    </div>;
}

/** 设置页：App（下载 / 检查更新）、显示、朗读引擎。语言切换在顶栏齿轮旁，学习记录的备份在首页。 */
export function SettingsScreen() {
    const t = useUi();
    const {theme, selectTheme} = useTheme();
    const shell = androidShell();
    return <div id="settings" className="settings-page">
        <div className="dashboard-section-heading"><h1>{t("ui.settings")}</h1></div>

        <Module id="app-settings-title" title={t("ui.androidApp")}>
            {shell?.checkUpdates
                ? <Row label={<p>{t("ui.checkUpdatesHint")}</p>}>
                    <div className="button-row">
                        <button onClick={() => shell.checkUpdates?.()}>{t("ui.checkUpdates")}</button>
                    </div>
                </Row>
                : <Row label={<p>{t("ui.androidAppHint")}</p>} data-android-download>
                    <a className="setting-link-button" href="./downloads/Akamonkai-learning.apk"
                       download="Akamonkai-learning.apk">{t("ui.downloadAndroid")}</a>
                </Row>}
        </Module>

        <Module id="display-title" title={t("ui.displaySettings")}>
            <Row label={t("ui.appearance")} labelId="appearance-label">
                <div className="button-row" role="group" aria-labelledby="appearance-label">
                    <button aria-pressed={theme === "light"} onClick={() => selectTheme("light")}>{t("ui.dayMode")}</button>
                    <button aria-pressed={theme === "dark"} onClick={() => selectTheme("dark")}>{t("ui.nightMode")}</button>
                </div>
            </Row>
            <Row label={t("ui.textScale")} labelId="text-scale-label">
                <TextScaleControl/>
            </Row>
        </Module>

        <Module id="speech-settings-title" title={t("ui.speechSettings")}>
            <div className="settings-speech"><SpeechControls/></div>
        </Module>
    </div>;
}
