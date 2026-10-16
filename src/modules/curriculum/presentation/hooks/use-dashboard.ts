import {useMemo, useState} from "react";
import type {Catalog} from "../../public";
import {useServices, useProgress} from "../../../../presentation/StudyContext";
import {libraryDisplay} from "../data/catalog-display";

export function useDashboard(catalog: Catalog) {
    const services = useServices();
    const progress = useProgress();
    const [bookId, setBook] = useState(() => {
        const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("book");
        return catalog.books.some(book => book.id === requested) ? requested! : "all";
    });
    const [query, setQuery] = useState("");
    const dashboard = useMemo(() => services.dashboard.overview(catalog, progress, bookId, query, libraryDisplay.recentResults), [services, catalog, progress, bookId, query]);
    return {...dashboard, bookId, setBook, query, setQuery, search: query.trim().toLowerCase()};
}
