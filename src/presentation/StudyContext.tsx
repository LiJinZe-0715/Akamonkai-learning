import {type Context, createContext, memo, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,} from "react";
import type {StudyServices as Services} from "../application/study-services";
import type {Locale, TranslationCatalog} from "../shared/kernel/text-types";
import type {Progress, ProgressChange} from "../modules/learning-progress/public";

const ServicesContext = createContext<Services | null>(null);
const LanguageContext = createContext<null | {
    locale: Locale;
    setLocale: (l: Locale) => void;
}>(null);
const ProgressContext = createContext<Progress | null>(null);
const ProgressActionsContext = createContext<null | {
    updateProgress: (p: Progress | ((latest: Progress) => Progress)) => Promise<boolean>;
    currentProgress: () => Progress;
    markWord: (id: string, field: "saved" | "mastered") => void;
    rememberLesson: (unitId: string, view: string) => void;
}>(null);
const FeedbackContext = createContext<null | {
    message: string;
    setMessage: (s: string) => void;
}>(null);

export function StudyProvider({
                                  services,
                                  children,
                              }: {
    services: Services;
    children: ReactNode;
}) {
    const [locale, setLanguage] = useState<Locale>(() =>
        services.localization.current(),
    );
    const [progress, setProgress] = useState(() => services.progress.load());
    const latest = useRef(progress);
    const [message, setMessage] = useState(() => services.progress.problem() === "corrupt" ? "ui.storageRecovered" : services.progress.problem() === "unavailable" ? "ui.storageError" : "");
    useEffect(() => {
        document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }, [locale]);
    const setLocale = useCallback((l: Locale) => {
        setLanguage(l);
        services.localization.select(l);
    }, [services]);
    const applyProgress = useCallback((change: ProgressChange) => {
        const merged = services.progress.merge(latest.current, change.progress);
        latest.current = merged;
        setProgress(merged);
        if (!change.persisted) setMessage("ui.storageError");
        return change.persisted;
    }, [services]);
    const updateProgress = useCallback(async (p: Progress | ((latest: Progress) => Progress)) => {
        return applyProgress(await services.progressCommands.replace(typeof p === "function" ? latest.current : p, typeof p === "function" ? p : undefined));
    }, [services, applyProgress]);
    const markWord = useCallback((id: string, field: "saved" | "mastered") => {
        void services.progressCommands.mark(latest.current, id, field).then(applyProgress).catch(() => setMessage("ui.storageError"));
    }, [services, applyProgress]);
    const currentProgress = useCallback(() => latest.current, []);
    const rememberLesson = useCallback((unitId: string, view: string) => {
        void services.progressCommands.remember(latest.current, unitId, view).then(change => {
            if (change) applyProgress(change);
        }).catch(() => setMessage("ui.storageError"));
    }, [services, applyProgress]);
    useEffect(() => services.progress.subscribe(() => {
        const merged = services.progress.merge(services.progress.load(), latest.current);
        latest.current = merged;
        setProgress(merged);
        if (services.progress.problem()) setMessage(services.progress.problem() === "corrupt" ? "ui.storageRecovered" : "ui.storageError");
    }), [services]);
    const language = useMemo(() => ({locale, setLocale}), [locale, setLocale]);
    const actions = useMemo(() => ({updateProgress, currentProgress, markWord, rememberLesson}),
        [updateProgress, currentProgress, markWord, rememberLesson]);
    const feedback = useMemo(() => ({message, setMessage}), [message]);
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
    return (id: string, params: Record<string, string | number> = {}) => {
        let text = services.localization.ui(id, locale);
        for (const [key, value] of Object.entries(params))
            text = text.replaceAll("{" + key + "}", String(value));
        return text;
    };
}

export const Text = memo(function Text({
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
