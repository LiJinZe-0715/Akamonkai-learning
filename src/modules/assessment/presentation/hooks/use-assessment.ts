import {useEffect, useMemo, useRef, useState} from "react";
import type {Answers, Question} from "../../public";
import type {View} from "../../../curriculum/public";
import {useServices, useProgressActions, useFeedback} from "../../../../presentation/StudyContext";

export function useAssessment(source: readonly Question[], lessonId: string, view: View) {
    const services = useServices();
    const {updateProgress} = useProgressActions();
    const {setNotice} = useFeedback();
    const draftKey = lessonId + ":" + view;
    const [restored] = useState(() => {
        const draft = services.drafts.restore(draftKey, source);
        // 没有答案的草稿不代表用户有作答意图，不能提示「已恢复」。
        return draft && Object.keys(draft.answers).length ? draft : undefined;
    });
    const [questions, setQuestions] = useState(() => restored?.questions ?? services.assessment.start(source));
    const [answers, setAnswers] = useState<Answers>(restored?.answers ?? {});
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const submissionPending = useRef(false);
    const [wrongOnly, setWrongOnly] = useState(restored?.wrongOnly ?? false);
    // 每道题都能单独核对；整份题目只提交一次。
    const [revealed, setRevealed] = useState<Record<string, true>>({});
    const saveDraft = useRef<(() => void) | undefined>(undefined);
    useEffect(() => {
        if (restored) setNotice("ui.draftRestored");
    }, [restored, setNotice]);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const save = () => {
            clearTimeout(timer);
            const saved = submitted ? services.drafts.clear(draftKey) : services.drafts.save(draftKey, source, {
                questions, answers, wrongOnly
            });
            if (!saved) setNotice("ui.draftStorageError");
        };
        saveDraft.current = save;
        if (submitted) {
            save();
            return;
        }
        timer = setTimeout(save, 200);
        return () => clearTimeout(timer);
    }, [services, draftKey, source, questions, answers, wrongOnly, submitted, setNotice]);
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
        // 上面的防抖保存已经覆盖首次渲染。
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        saveDraft.current?.();
    }, [questions, wrongOnly]);

    const result = useMemo(() => services.assessment.grade(questions, answers), [services, questions, answers]);
    const scrollTop = () => window.scrollTo({top: 0, behavior: "auto"});

    function reveal(id: string) {
        setRevealed(current => ({...current, [id]: true}));
    }

    function restart(retryWrong: boolean) {
        setQuestions(retryWrong ? services.assessment.retry(questions, answers) : services.assessment.start(source));
        setWrongOnly(retryWrong);
        setAnswers({});
        setRevealed({});
        setSubmitted(false);
    }

    async function submit() {
        if (submissionPending.current || !result.complete || !result.total) return;
        submissionPending.current = true;
        setSubmitting(true);
        try {
            if (!wrongOnly) await updateProgress(current => {
                const outcome = services.studySession.submit(questions, answers, current, lessonId, view);
                return outcome.status === "submitted" ? outcome.progress : current;
            });
            setSubmitted(true);
            setRevealed(Object.fromEntries(questions.map(question => [question.id, true])));
            scrollTop();
        } catch {
            setNotice("ui.storageError");
        } finally {
            submissionPending.current = false;
            setSubmitting(false);
        }
    }

    return {
        services, answers, setAnswers, submitted, submitting, wrongOnly, revealed, reveal, result, questions,
        restart, submit
    };
}
