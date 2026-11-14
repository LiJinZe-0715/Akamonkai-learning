import {useEffect, useState} from "react";
import type {Lesson, LessonSummary, View} from "../../public";
import {useServices, useProgressActions} from "../../../../presentation/StudyContext";
import {viewTitle} from "../data/view-labels";

export function useLesson(summary: LessonSummary, view: View, bookId: string) {
    const services = useServices();
    const {rememberLesson} = useProgressActions();
    const [lesson, setLesson] = useState<Lesson | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let isActive = true;
        services.curriculum.lesson(summary.id).then(data => {
            if (isActive) {
                setLesson(data);
                setError(false);
            }
        }).catch(() => {
            if (isActive) setError(true);
        });
        document.title = summary.title + "・" + viewTitle(bookId, view) + "｜赤門会日本語";
        return () => {
            isActive = false;
        };
    }, [services, summary.id, summary.title, bookId, view, attempt]);
    useEffect(() => {
        if (lesson && !error) rememberLesson(summary.id, view);
    }, [lesson, error, rememberLesson, summary.id, view]);
    return {
        lesson, error, retry: () => {
            setError(false);
            setAttempt(n => n + 1);
        }
    };
}
