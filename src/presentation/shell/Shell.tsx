import {type ReactNode, useEffect, useState} from "react";
import {useLanguage, useFeedback, useUi} from "../StudyContext";
import {SpeechControls} from "../components/SpeechControls";
import {Icon} from "../components/Icon";
import {destinations} from "./data/navigation";
import {useProgressTools} from "./use-progress-tools";
import {useTheme} from "./use-theme";

export function Shell({children}: { children: ReactNode }) {
    const {locale, setLocale} = useLanguage();
    const {message, setMessage} = useFeedback();
    const {download, downloadRecovery, hasRecovery, importFile} = useProgressTools();
    const t = useUi();
    const {theme, selectTheme} = useTheme();
    const [active, setActive] = useState("today");
    const lessonPage = typeof window !== "undefined" && ["unit", "book"].some(key => new URLSearchParams(window.location.search).has(key));
    useEffect(() => {
        const update = () => {
            const target = window.location.hash.slice(1);
            setActive(previous => destinations.some(item => item.id === target) ? target : lessonPage ? "catalog" : target ? previous : "today");
        };
        update();
        window.addEventListener("hashchange", update);
        return () => window.removeEventListener("hashchange", update);
    }, [lessonPage]);
    const navigation = (className: string) => <nav className={className} aria-label={t("ui.mainNavigation")}>
        {destinations.map(item => <a key={item.id} href={item.id === "settings" ? "#settings" : "./#" + item.id}
                                     aria-current={active === item.id ? "location" : undefined}
                                     onClick={() => setActive(item.id)}><Icon
            name={item.icon}/><span>{t(item.text)}</span></a>)}
    </nav>;
    return <>
        <a className="skip-link" href="#main">{t("ui.skipContent")}</a>
        <header className="site-header">
            <div className="header-inner">
                <a className="brand" href="./" lang="ja" translate="no"><span className="seal">赤</span><span><strong>赤門会<span
                    className="brand-japanese"> 日本語</span></strong><small>日本語の学びを、毎日。</small></span></a>
                {navigation("desktop-nav")}
                <div className="header-actions">
                    <button className="theme-toggle"
                            aria-label={t(theme === "light" ? "ui.switchToDark" : "ui.switchToLight")}
                            title={t(theme === "light" ? "ui.switchToDark" : "ui.switchToLight")}
                            onClick={() => selectTheme(theme === "light" ? "dark" : "light")}><span
                        aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span></button>
                    <div className="language-switch" aria-label="Language">
                        <button lang="zh-CN" aria-pressed={locale === "zh"} onClick={() => setLocale("zh")}>中文
                        </button>
                        <button lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
                    </div>
                </div>
            </div>
        </header>
        <main id="main" className="app-main">
            <div className="android-download" data-android-download>
                <div><strong>{t("ui.androidApp")}</strong><p>{t("ui.androidAppHint")}</p></div>
                <a href="./downloads/Akamonkai-learning.apk" download="Akamonkai-learning.apk">{t("ui.downloadAndroid")}</a>
            </div>{message && <div role="status" className="notice">{t(message)}
            <button aria-label={t("ui.close")} onClick={() => setMessage("")}>×</button>
        </div>}{children}</main>
        <footer className="site-footer">
            <section id="settings" className="settings-section">
                <div className="settings-heading"><Icon name="settings"/><h2>{t("ui.settings")}</h2></div>
                <div className="theme-settings"><span id="appearance-label">{t("ui.appearance")}</span>
                    <div className="button-row" role="group" aria-labelledby="appearance-label">
                        <button aria-pressed={theme === "light"}
                                onClick={() => selectTheme("light")}>{t("ui.dayMode")}</button>
                        <button aria-pressed={theme === "dark"}
                                onClick={() => selectTheme("dark")}>{t("ui.nightMode")}</button>
                    </div>
                </div>
                <details className="speech-settings">
                    <summary>{t("ui.speechSettings")}<Icon name="chevron"/></summary>
                    <SpeechControls/></details>
                <details className="progress-tools">
                    <summary>{t("ui.dataTools")}<Icon name="chevron"/></summary>
                    <p>{t("ui.localOnly")}</p>
                    <div className="button-row">
                        <button onClick={download}>{t("ui.export")}</button>
                        <label className="file-button">{t("ui.import")}<input type="file"
                                                                              accept=".json,application/json"
                                                                              onChange={async e => {
                                                                                  const file = e.target.files?.[0];
                                                                                  if (!file) return;
                                                                                  const input = e.currentTarget;
                                                                                  try {
                                                                                      await importFile(file);
                                                                                  } finally {
                                                                                      input.value = "";
                                                                                  }
                                                                              }}/></label>{hasRecovery &&
                        <button onClick={downloadRecovery}>{t("ui.exportRecovery")}</button>}</div>
                </details>
            </section>
            <div className="footer-attribution"><strong lang="ja" translate="no">赤門会日本語</strong>
                <p>{t("ui.sourceNote")}</p><a href="./attribution.txt" lang="ja" translate="no">資料の出典・ライセンス
                    ↗</a></div>
        </footer>
        {navigation("mobile-nav")}
    </>;
}
