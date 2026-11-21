import {type Context, createContext, memo, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,} from "react";
import type {StudyServices as Services} from "../application/study-services";
import type {Locale, TranslationCatalog} from "../shared/kernel/text-types";
import type {Progress, ProgressChange} from "../modules/learning-progress/public";
import type {UiTextId} from "../modules/localization/public";

const ServicesContext = createContext<Services | null>(null);
const LanguageContext = createContext<null | {
    locale: Locale;
    setLocale: (next: Locale) => void;
}>(null);
const ProgressContext = createContext<Progress | null>(null);
const ProgressActionsContext = createContext<null | {
    updateProgress: (progress: Progress | ((latest: Progress) => Progress)) => Promise<boolean>;
    currentProgress: () => Progress;
    markWord: (id: string, field: "saved" | "mastered") => void;
    rememberLesson: (unitId: string, view: string) => void;
    clearProgress: () => Promise<boolean>;
}>(null);
/** `notice` 是 UI 文案 ID，不是已经渲染好的消息。 */
const FeedbackContext = createContext<null | {
    notice: UiTextId | "";
    setNotice: (id: UiTextId | "") => void;
}>(null);

export function StudyProvider({
                                  services,
                                  children,
                              }: {
    services: Services;
    children: ReactNode;
}) {
    const [locale, applyLocale] = useState<Locale>(() =>
        services.localization.current(),
    );
    const [progress, setProgress] = useState(() => services.progress.load());
    const latest = useRef(progress);
    const [notice, setNotice] = useState<UiTextId | "">(() => {
        const problem = services.progress.problem();
        return problem === "corrupt" ? "ui.storageRecovered" : problem === "unavailable" ? "ui.storageError" : "";
    });
    useEffect(() => {
        document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }, [locale]);
    const setLocale = useCallback((next: Locale) => {
        applyLocale(next);
        services.localization.select(next);
    }, [services]);
    const applyProgress = useCallback((change: ProgressChange) => {
        const merged = services.progress.merge(latest.current, change.progress);
        latest.current = merged;
        setProgress(merged);
        if (!change.persisted) setNotice("ui.storageError");
        return change.persisted;
    }, [services]);
    const updateProgress = useCallback(async (progress: Progress | ((latest: Progress) => Progress)) => {
        return applyProgress(await services.progressCommands.replace(typeof progress === "function" ? latest.current : progress, typeof progress === "function" ? progress : undefined));
    }, [services, applyProgress]);
    const markWord = useCallback((id: string, field: "saved" | "mastered") => {
        void services.progressCommands.mark(latest.current, id, field).then(applyProgress).catch(() => setNotice("ui.storageError"));
    }, [services, applyProgress]);
    const currentProgress = useCallback(() => latest.current, []);
    const rememberLesson = useCallback((unitId: string, view: string) => {
        void services.progressCommands.remember(latest.current, unitId, view).then(change => {
            if (change) applyProgress(change);
        }).catch(() => setNotice("ui.storageError"));
    }, [services, applyProgress]);
    // 清空后的进度代数更高，applyProgress 里的合并会让它整体胜出，内存里的旧记录不会回流。
    const clearProgress = useCallback(async () =>
        applyProgress(await services.progressCommands.clear(latest.current)), [services, applyProgress]);
    // 朗读服务要在应用一启动就初始化：声音列表、偏好设置和引擎预热都在这里。只挂在设置页时，
    // 直接打开课文页的读者永远拿不到声音列表，每个朗读键都只会提示「不支持日语朗读」。
    useEffect(() => services.speech.initialize(), [services]);
    useEffect(() => services.progress.subscribe(() => {
        const merged = services.progress.merge(services.progress.load(), latest.current);
        latest.current = merged;
        setProgress(merged);
        if (services.progress.problem()) setNotice(services.progress.problem() === "corrupt" ? "ui.storageRecovered" : "ui.storageError");
    }), [services]);
    const language = useMemo(() => ({locale, setLocale}), [locale, setLocale]);
    const actions = useMemo(() => ({updateProgress, currentProgress, markWord, rememberLesson, clearProgress}),
        [updateProgress, currentProgress, markWord, rememberLesson, clearProgress]);
    const feedback = useMemo(() => ({notice, setNotice}), [notice]);
    return <ServicesContext.Provider value={services}>
        <LanguageContext.Provider value={language}>
            <ProgressActionsContext.Provider value={actions}>
                <ProgressContext.Provider value={progress}>
                    <FeedbackContext.Provider value={feedback}>{children}</FeedbackContext.Provider>
                </ProgressContext.Provider>
            </ProgressActionsContext.Provider>
        </LanguageContext.Provider>
    </ServicesContext.Provider>;
}

function useRequiredContext<T>(context: Context<T | null>): T {
    const value = useContext(context);
    if (!value) throw Error("Missing study provider");
    return value;
}

export const useServices = () => useRequiredContext(ServicesContext);
export const useLanguage = () => useRequiredContext(LanguageContext);
export const useProgress = () => useRequiredContext(ProgressContext);
export const useProgressActions = () => useRequiredContext(ProgressActionsContext);
export const useFeedback = () => useRequiredContext(FeedbackContext);

export function useUi() {
    const services = useServices();
    const {locale} = useLanguage();
    return (id: UiTextId, params: Record<string, string | number> = {}) => {
        let text = services.localization.uiText(id, locale);
        for (const [key, value] of Object.entries(params))
            text = text.replaceAll("{" + key + "}", String(value));
        return text;
    };
}

export const TranslatedText = memo(function TranslatedText({
                                                               id,
                                                               catalog,
                                                           }: {
    id: string;
    catalog: TranslationCatalog;
}) {
    const services = useServices();
    const {locale} = useLanguage();
    return (
        <span lang={locale === "zh" ? "zh-CN" : "en"} data-content-id={id}>
      {services.localization.text(catalog, id, locale)}
    </span>
    );
});
