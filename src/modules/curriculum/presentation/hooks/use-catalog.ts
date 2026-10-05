import { useEffect, useState } from "react";
import type { Catalog } from "../../public";
import { useStudy } from "../../../../presentation/context";
export function useCatalog() {
  const { services } = useStudy();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    services.curriculum.catalog().then(data => { if (active) setCatalog(data); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [services, attempt]);
  return { catalog, error, retry: () => { setError(false); setAttempt(n => n + 1); } };
}
