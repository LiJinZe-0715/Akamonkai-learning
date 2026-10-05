import { useMemo, useState } from "react";
import type { Catalog } from "../../public";
import { useStudy } from "../../../../presentation/context";
import { libraryDisplay } from "../data/library";
export function useDashboard(catalog: Catalog) {
  const { progress, services } = useStudy();
  const [bookId, setBook] = useState("all");
  const [query, setQuery] = useState("");
  const dashboard = useMemo(() => services.dashboard.overview(catalog, progress, bookId, query, libraryDisplay.recentResults), [services, catalog, progress, bookId, query]);
  return { ...dashboard, bookId, setBook, query, setQuery, search: query.trim().toLowerCase() };
}
