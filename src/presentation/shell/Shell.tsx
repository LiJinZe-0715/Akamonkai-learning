import type {ReactNode} from "react";
import {useFeedback, useLanguage, useUi} from "../StudyContext";
import {Icon} from "../components/Icon";
import {currentPage, navItems, pageHref} from "./data/navigation";

/** 顶栏（品牌、标签、右上角齿轮）+ 正文 + 手机底部标签栏。设置在独立的设置页里。 */
export function Shell({children}: { children: ReactNode }) {
    const {notice, setNotice} = useFeedback();
    const {locale, setLocale} = useLanguage();
    const t = useUi();
    const active = typeof window === "undefined" ? "home" : currentPage(window.location.search);
    const nav = (className: string) => <nav className={className} aria-label={t("ui.mainNavigation")}>
        {navItems.map(item => <a key={item.id} href={pageHref(item.id)}
                                 aria-current={active === item.id ? "page" : undefined}><Icon
            name={item.icon}/><span>{t(item.text)}</span></a>)}
    </nav>;
    return <>
        <a className="skip-link" href="#main">{t("ui.skipContent")}</a>
        <header className="site-header">
            <div className="header-inner">
                <a className="brand" href="./" lang="ja" translate="no"><span className="seal">赤</span><span><strong>赤門会<span
                    className="brand-japanese"> 日本語</span></strong><small>日本語の学びを、毎日。</small></span></a>
                {nav("desktop-nav")}
                <div className="header-actions">
                    <div className="language-switch" role="group" aria-label={t("ui.language")}>
                        <button lang="zh-CN" aria-pressed={locale === "zh"} onClick={() => setLocale("zh")}>中文</button>
                        <button lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
                    </div>
                    <a className="settings-link" href={pageHref("settings")} aria-label={t("ui.settings")}
                       title={t("ui.settings")}
                       aria-current={active === "settings" ? "page" : undefined}><Icon name="settings"/></a>
                </div>
            </div>
        </header>
        <main id="main" className="app-main">
            {notice && <div role="status" className="notice">{t(notice)}
                <button aria-label={t("ui.close")} onClick={() => setNotice("")}>×</button>
            </div>}{children}</main>
        {nav("mobile-nav")}
    </>;
}
