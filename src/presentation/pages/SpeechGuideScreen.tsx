import {type ReactNode} from "react";
import {useUi} from "../StudyContext";
import {androidEngineUrl, windowsEngineUrl} from "../components/speech-engine-link";

/**
 * 怎么给设备装上日语声音。
 *
 * 网站只用系统报出来的声音，自己不启动引擎，所以这一页只做一件事：
 * 装好日语 TTS 引擎、设为首选、下载语音数据，再回来检查声音列表。
 *
 * 两端缺日语的原因不一样，装法也不一样：手机是根本没有日语引擎，Windows 是自带的那
 * 把嗓子太机械。所以两套步骤都留着，读者按自己那一端走。
 */
function Step({title, body, children}: { title: string; body: string; children?: ReactNode }) {
    return <li>
        <div>
            <h3>{title}</h3>
            <p>{body}</p>
            {children}
        </div>
    </li>;
}

export function SpeechGuideScreen() {
    const t = useUi();
    return <article className="guide">
        <header className="guide-header">
            <span className="section-kicker">{t("ui.guideKicker")}</span>
            <h1>{t("ui.guideTitle")}</h1>
            <p className="guide-intro">{t("ui.guideIntro")}</p>
            <div className="guide-meta">
                <span>{t("ui.guideMetaNote")}</span>
                <a className="guide-back" href="./?page=settings">{t("ui.guideBack")}</a>
            </div>
        </header>

        <p className="guide-panel-lead">{t("ui.guidePhoneIntro")}</p>
        <section className="guide-steps" aria-labelledby="guide-steps-phone">
            <h2 id="guide-steps-phone">{t("ui.guidePhoneStepsTitle")}</h2>
            <ol>
                <Step title={t("ui.guidePhoneStep1Title")} body={t("ui.guidePhoneStep1Body")}>
                    {androidEngineUrl &&
                        <a className="guide-action" href={androidEngineUrl} target="_blank" rel="noreferrer">
                            {t("ui.downloadEngineAndroid")}
                        </a>}
                </Step>
                <Step title={t("ui.guidePhoneStep2Title")} body={t("ui.guidePhoneStep2Body")}/>
                <Step title={t("ui.guidePhoneStep3Title")} body={t("ui.guidePhoneStep3Body")}/>
                <Step title={t("ui.guidePhoneStep4Title")} body={t("ui.guidePhoneStep4Body")}/>
            </ol>
        </section>

        <p className="guide-panel-lead">{t("ui.guideWindowsIntro")}</p>
        <section className="guide-steps" aria-labelledby="guide-steps-windows">
            <h2 id="guide-steps-windows">{t("ui.guideWindowsStepsTitle")}</h2>
            <ol>
                <Step title={t("ui.guideWindowsStep1Title")} body={t("ui.guideWindowsStep1Body")}>
                    {windowsEngineUrl &&
                        <a className="guide-action" href={windowsEngineUrl} target="_blank" rel="noreferrer">
                            {t("ui.downloadEngineWindows")}
                        </a>}
                </Step>
                <Step title={t("ui.guideWindowsStep2Title")} body={t("ui.guideWindowsStep2Body")}/>
                <Step title={t("ui.guideWindowsStep3Title")} body={t("ui.guideWindowsStep3Body")}/>
                <Step title={t("ui.guideWindowsStep4Title")} body={t("ui.guideWindowsStep4Body")}/>
            </ol>
        </section>

        <section className="guide-faq" aria-labelledby="guide-faq">
            <h2 id="guide-faq">{t("ui.guideFaqTitle")}</h2>
            <dl>
                <dt>{t("ui.guideFaq4Q")}</dt>
                <dd>{t("ui.guideFaq4A")}</dd>
                <dt>{t("ui.guideFaq2Q")}</dt>
                <dd>{t("ui.guideFaq2A")}</dd>
                <dt>{t("ui.guideFaqWindowsQ")}</dt>
                <dd>{t("ui.guideFaqWindowsA")}</dd>
            </dl>
        </section>
    </article>;
}
