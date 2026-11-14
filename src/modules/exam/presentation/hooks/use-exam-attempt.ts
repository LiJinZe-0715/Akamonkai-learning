import {useEffect, useMemo, useRef, useState} from "react";
import {examQuestions, examScoredQuestions, type Exam, type ExamAnswers} from "../../public";
import {grade} from "../../../assessment/public";
import {useFeedback, useProgressActions, useServices} from "../../../../presentation/StudyContext";
import {assessmentResultId} from "../../../learning-progress/public";

const allRevealed = (ids: readonly string[]) =>
    Object.fromEntries(ids.map(id => [id, true] as const)) as Record<string, true>;

/**
 * 一场真题的作答状态：答案、单题核对、成绩提交，外加本地草稿。
 * 草稿与教材测验共用一套存储（同一前缀），清空学习记录时会一并清掉。
 */
export function useExamAttempt(exam: Exam) {
    const services = useServices();
    const {updateProgress} = useProgressActions();
    const {setNotice} = useFeedback();
    const questions = useMemo(() => examQuestions(exam), [exam]);
    // 草稿与展开核对用全卷题；判分、交卷条件只用计分题，无音源的聴解占位题不算。
    const scoredQuestions = useMemo(() => examScoredQuestions(exam), [exam]);
    const [restored] = useState(() => {
        const draft = services.examDrafts.restore(exam.id, questions);
        // 空进度不算作答意图：恢复提示不能凭一条空记录弹出来。
        return draft && (Object.keys(draft.answers).length || draft.revealed.length) ? draft : undefined;
    });
    const [answers, setAnswers] = useState<ExamAnswers>(restored?.answers ?? {});
    const [revealed, setRevealed] = useState<Record<string, true>>(() =>
        allRevealed(restored?.revealed ?? []));
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const submissionPending = useRef(false);
    const result = useMemo(() => grade(scoredQuestions, answers), [scoredQuestions, answers]);

    useEffect(() => {
        if (restored) setNotice("ui.draftRestored");
    }, [restored, setNotice]);

    const saveDraft = useRef<(() => void) | undefined>(undefined);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const save = () => {
            clearTimeout(timer);
            const saved = submitted
                ? services.examDrafts.clear(exam.id)
                : services.examDrafts.save(exam.id, questions, {
                    answers, revealed: Object.keys(revealed),
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
    }, [services, exam.id, questions, answers, revealed, submitted, setNotice]);

    // 关页面／切后台时立刻落盘，不能等 200 ms 的防抖。
    useEffect(() => {
        const flush = () => saveDraft.current?.();
        const hidden = () => {
            if (document.visibilityState === "hidden") flush();
        };
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", hidden);
        return () => {
            flush();
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", hidden);
        };
    }, [exam.id]);

    async function submit() {
        // 空卷也会被判成 complete；没有 total 时不能提交，否则 record(0, 0) 会抛错，
        // 用户看到的却是「存储错误」。
        if (submissionPending.current || !result.complete || !result.total) return;
        submissionPending.current = true;
        setSubmitting(true);
        try {
            await updateProgress(current =>
                services.progress.record(current, assessmentResultId(exam.id, "exam"), result.correct, result.total));
            setSubmitted(true);
            setRevealed(allRevealed(scoredQuestions.map(question => question.id)));
            window.scrollTo({top: 0, behavior: "auto"});
        } catch {
            setNotice("ui.storageError");
        } finally {
            submissionPending.current = false;
            setSubmitting(false);
        }
    }

    function restart() {
        services.examDrafts.clear(exam.id);
        setAnswers({});
        setRevealed({});
        setSubmitted(false);
        window.scrollTo({top: 0, behavior: "auto"});
    }

    return {scoredQuestions, answers, setAnswers, revealed, setRevealed, submitted, submitting, result, submit, restart};
}
