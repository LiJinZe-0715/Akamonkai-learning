import {useEffect, useState} from "react";
import type {Exam} from "../../public";
import {useServices} from "../../../../presentation/StudyContext";

/** 加载一场真题。真题与教材各走各的读取口，这里不碰课的数据。 */
export function useExam(examId: string) {
    const services = useServices();
    const [exam, setExam] = useState<Exam | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        services.exams.exam(examId).then(data => {
            if (!active) return;
            setExam(data);
            setError(false);
        }).catch(() => {
            if (active) setError(true);
        });
        return () => {
            active = false;
        };
    }, [services, examId, attempt]);
    useEffect(() => {
        if (exam) document.title = exam.title + "｜赤門会日本語";
    }, [exam]);
    return {
        exam, error, retry: () => {
            setError(false);
            setAttempt(value => value + 1);
        }
    };
}
