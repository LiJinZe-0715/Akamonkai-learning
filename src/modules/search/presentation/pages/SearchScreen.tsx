import {useEffect, useMemo, useState} from "react";
import type {SearchHit, SearchIndex} from "../../public";
import {useServices, useUi} from "../../../../presentation/StudyContext";
import {Icon} from "../../../../presentation/components/Icon";

const hrefOf = (hit: SearchHit) => "./?unit=" + encodeURIComponent(hit.unit.id) + "&view=" + hit.view;

function Result({hit}: { hit: SearchHit }) {
    return <a className="search-result" href={hrefOf(hit)}>
        <span className="search-result-head">
            <small lang="ja" translate="no">{hit.unit.bookTitle} · {hit.unit.group}</small>
            <strong lang="ja" translate="no">{hit.unit.title}</strong>
        </span>
        <span className="search-result-ja" lang="ja" translate="no">{hit.ja}</span>
        {hit.zh && <span className="search-result-zh" lang="zh-CN">{hit.zh}</span>}
        <Icon name="arrow"/>
    </a>;
}

export function SearchScreen() {
    const services = useServices();
    const t = useUi();
    const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
    const [index, setIndex] = useState<SearchIndex | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let cancelled = false;
        services.search.load().then(value => {
            if (!cancelled) setIndex(value);
        }).catch(() => {
            if (!cancelled) setFailed(true);
        });
        return () => {
            cancelled = true;
        };
    }, [services]);
    const hits = useMemo(() => index ? services.search.search(index, query) : [], [index, query, services]);
    const trimmed = query.trim();
    const change = (value: string) => {
        setQuery(value);
        const url = "./?page=search" + (value ? "&q=" + encodeURIComponent(value) : "");
        window.history.replaceState(null, "", url);
    };
    return <section className="search-page" id="search" aria-labelledby="search-title">
        <div className="search-hero">
            <h1 id="search-title">{t("ui.searchTitle")}</h1>
            <p>{t("ui.searchIntro")}</p>
        </div>
        <form className="library-search search-field" role="search"
              onSubmit={event => event.preventDefault()}>
            <Icon name="search"/>
            <input type="search" value={query} autoFocus autoComplete="off"
                   aria-label={t("ui.searchTitle")} placeholder={t("ui.searchPlaceholder")}
                   onChange={event => change(event.target.value)}/>
        </form>
        {failed && <p className="empty-state" role="alert">{t("ui.searchUnavailable")}</p>}
        {!failed && !index && <p className="empty-state" role="status">{t("ui.loading")}</p>}
        {index && !trimmed && <p className="search-hint">{t("ui.searchHint")}</p>}
        {index && trimmed &&
            <p className="search-count">{t("ui.searchCount", {count: hits.length})}</p>}
        {index && trimmed && !hits.length && <p className="empty-state" role="status">{t("ui.searchEmpty")}</p>}
        {index && hits.length > 0 && <div className="search-results">
            {hits.map(hit => <Result key={hit.unit.id + hit.kind + hit.ja + hit.zh} hit={hit}/>)}
        </div>}
    </section>;
}
