import {useMemo, useState} from "react";
import type {Catalog} from "../../public";
import {useServices, useProgress} from "../../../../presentation/StudyContext";
import {libraryDisplay} from "../data/library-display";

export function useDashboard(catalog: Catalog) {
    const services = useServices();
    const progress = useProgress();
    // 教材按级别筛选：书库本身已经按级别分组，而一份长到需要滚动的
    // 书单从来就不是好用的筛选项。
    const [level, setLevel] = useState(() => {
        const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("level");
        return catalog.books.some(book => book.level === requested) ? requested! : "all";
    });
    const [query, setQuery] = useState("");
    const dashboard = useMemo(
        () => services.dashboard.overview(catalog, progress, level, query, libraryDisplay.recentLimit),
        [services, catalog, progress, level, query],
    );
    return {...dashboard, level, setLevel, query, setQuery};
}
