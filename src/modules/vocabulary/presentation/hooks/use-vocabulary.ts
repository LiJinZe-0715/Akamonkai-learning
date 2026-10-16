import {useMemo, useState} from "react";
import type {Word} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import type {WordFilter} from "../../../learning-progress/public";
import {useServices, useLanguage, useProgress, useProgressActions} from "../../../../presentation/StudyContext";

export function useVocabulary(source: readonly Word[], texts: TranslationCatalog) {
    const services = useServices();
    const {locale} = useLanguage();
    const progress = useProgress();
    const {markWord} = useProgressActions();
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<WordFilter>("all");
    const words = useMemo(() => services.wordStudy.search(source, texts, progress, locale, query, filter), [services, source, texts, progress, locale, query, filter]);
    return {progress, markWord, words, query, setQuery, filter, setFilter};
}
