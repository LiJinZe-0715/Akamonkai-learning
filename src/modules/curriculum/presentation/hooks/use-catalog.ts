import {useEffect, useState} from "react";
import type {Catalog} from "../../public";
import {useServices} from "../../../../presentation/StudyContext";

export function useCatalog() {
    const services = useServices();
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let isActive = true;
        services.curriculum.catalog().then(data => {
            if (isActive) setCatalog(data);
        }).catch(() => {
            if (isActive) setError(true);
        });
        return () => {
            isActive = false;
        };
    }, [services, attempt]);
    return {
        catalog, error, retry: () => {
            setError(false);
            setAttempt(n => n + 1);
        }
    };
}
