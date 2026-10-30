import {useEffect, useMemo, useRef, useState} from "react";
import type {Answers, Question} from "../../public";
import type {View} from "../../../curriculum/public";
import {useServices, useProgressActions, useFeedback} from "../../../../presentation/StudyContext";
import {assessmentPageSize} from "../data/assessment-pagination";

export function useAssessment(source: readonly Question[], lessonId: string, view: View) {
    const services = useServices();
    const {updateProgress} = useProgressActions();
    const {setMessage} = useFeedback();
    const draftKey = lessonId + ":" + view;
    const [restored] = useState(() => {
        const draft = services.drafts.restore(draftKey, source, assessmentPageSize);
        // A draft without answers carries no intent, so it must never be announced as resumed.
        return draft && Object.keys(draft.answers).length ? draft : undefined;
    });
    const [questions, setQuestions] = useState(() => restored?.questions ?? services.assessment.start(source));
    const [answers, setAnswers] = useState<Answers>(restored?.answers ?? {});
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const submissionPending = useRef(false);
    const [wrongOnly, setWrongOnly] = useState(restored?.wrongOnly ?? false);
    const [page, setPage] = useState(restored?.page ?? 0);
    const saveDraft = useRef<(() => void) | undefined>(undefined);
    useEffect(() => {
        if (restored) setMessage("ui.draftRestored");
    }, [restored, setMessage]);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const save = () => {
            clearTimeout(timer);
            const saved = submitted ? services.drafts.clear(draftKey) : services.drafts.save(draftKey, source, {
                questions, answers, page, wrongOnly
            });
            if (!saved) setMessage("ui.draftStorageError");
        };
        saveDraft.current = save;
        if (submitted) {
            save();
            return;
        }
        timer = setTimeout(save, 200);
        return () => clearTimeout(timer);
    }, [services, draftKey, source, questions, answers, page, wrongOnly, submitted, setMessage]);
    useEffect(() => {
        const flush = () => saveDraft.current?.();
        const hidden = () => { if (document.visibilityState === "hidden") flush(); };
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", hidden);
        return () => {
            flush();
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", hidden);
        };
    }, [draftKey]);
    const firstRender = useRef(true);
    useEffect(() => {
        // The debounced save above already covers the initial render.
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        saveDraft.current?.();
    }, [questions, page, wrongOnly]);

    const result = useMemo(() => services.assessment.grade(questions, answers), [services, questions, answers]);
    const scrollTop = () => window.scrollTo({top: 0, behavior: "auto"});
    const changePage = (next: number) => {
        setPage(next);
        scrollTop();
    };

    function restart(retryWrong: boolean) {
        setQuestions(retryWrong ? services.assessment.retry(questions, answers) : services.assessment.start(source));
        setWrongOnly(retryWrong);
        setAnswers({});
        setSubmitted(false);
        changePage(0);
    }

    async function submit() {
        if (submissionPending.current || !result.complete || !result.total) return;
        submissionPending.current = true;
        setSubmitting(true);
        try {
            if (!wrongOnly) await updateProgress(current => {
                const outcome = services.session.submit(questions, answers, current, lessonId, view);
                return outcome.status === "submitted" ? outcome.progress : current;
            });
            setSubmitted(true);
            changePage(0);
        } catch {
            setMessage("ui.storageError");
        } finally {
            submissionPending.current = false;
            setSubmitting(false);
        }
    }

    return {
        services, answers, setAnswers, submitted, submitting, wrongOnly, page, changePage, result, questions,
        pageSize: assessmentPageSize, pages: Math.ceil(questions.length / assessmentPageSize),
        visible: questions.slice(page * assessmentPageSize, (page + 1) * assessmentPageSize), restart, submit
    };
}
