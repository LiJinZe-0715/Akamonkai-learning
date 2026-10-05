import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { StudyServices as Services } from "../application/study-services";
import type { Locale, TranslationCatalog } from "../shared/kernel/types";
import type { Progress, ProgressChange } from "../modules/learning-progress/public";
const Context = createContext<null | {
  services: Services;
  locale: Locale;
  setLocale: (l: Locale) => void;
  progress: Progress;
  updateProgress: (p: Progress | ((latest: Progress) => Progress)) => Promise<boolean>;
  currentProgress: () => Progress;
  markWord: (id: string, field: "saved" | "mastered") => void;
  rememberLesson: (unitId: string, view: string) => void;
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
  const setLocale = (l: Locale) => {
    setLanguage(l);
    services.localization.select(l);
  };
  const applyProgress = useCallback((change: ProgressChange) => {
    const merged = services.progress.import(services.progress.export(change.progress), latest.current);
    latest.current = merged;
    setProgress(merged);
    if (!change.persisted) setMessage("ui.storageError");
    return change.persisted;
  }, [services]);
  const updateProgress = useCallback(async (p: Progress | ((latest: Progress) => Progress)) => {
    return applyProgress(await services.progressCommands.replace(typeof p === "function" ? latest.current : p, typeof p === "function" ? p : undefined));
  }, [services, applyProgress]);
  const markWord = (id: string, field: "saved" | "mastered") => {
    void services.progressCommands.mark(latest.current, id, field).then(applyProgress).catch(() => setMessage("ui.storageError"));
  };
  const currentProgress = useCallback(() => latest.current, []);
  const rememberLesson = useCallback((unitId: string, view: string) => {
    void services.progressCommands.remember(latest.current, unitId, view).then(change => { if (change) applyProgress(change); }).catch(() => setMessage("ui.storageError"));
  }, [services, applyProgress]);
  useEffect(() => services.progress.subscribe(() => {
    const merged = services.progress.import(services.progress.export(latest.current), services.progress.load());
    latest.current = merged;
    setProgress(merged);
    if (services.progress.problem()) setMessage(services.progress.problem() === "corrupt" ? "ui.storageRecovered" : "ui.storageError");
  }), [services]);
  return (
    <Context.Provider
      value={{
        services,
        locale,
        setLocale,
        progress,
        updateProgress,
        currentProgress,
        markWord,
        rememberLesson,
        message,
        setMessage,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStudy() {
  const value = useContext(Context);
  if (!value) throw Error("Missing study provider");
  return value;
}
export function useUi() {
  const { services, locale } = useStudy();
  return (id: string, params: Record<string, string | number> = {}) => {
    let text = services.localization.ui(id, locale);
    for (const [key, value] of Object.entries(params))
      text = text.replaceAll("{" + key + "}", String(value));
    return text;
  };
}
export function Text({
  id,
  catalog,
}: {
  id: string;
  catalog: TranslationCatalog;
}) {
  const { services, locale } = useStudy();
  return (
    <span lang={locale === "zh" ? "zh-CN" : "en"} data-content-id={id}>
      {services.localization.text(catalog, id, locale)}
    </span>
  );
}
