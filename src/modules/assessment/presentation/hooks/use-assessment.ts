import { useEffect, useMemo, useRef, useState } from "react";
import type { Answers } from "../../public";
import type { LessonBundle, View } from "../../../curriculum/public";
import { useStudy } from "../../../../presentation/context";
import { assessmentPageSize } from "../data/pagination";
export function useAssessment(lesson: LessonBundle, view: View) {
  const { services, updateProgress, setMessage } = useStudy();
  const source = useMemo(() => services.session.source(lesson, view), [services, lesson, view]);
  const draftKey = lesson.id + ":" + view;
  const [restored] = useState(() => services.drafts.restore(draftKey, source, assessmentPageSize));
  const [questions, setQuestions] = useState(() => restored?.questions ?? services.assessment.start(source));
  const [answers, setAnswers] = useState<Answers>(restored?.answers ?? {});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const [wrongOnly, setWrongOnly] = useState(restored?.wrongOnly ?? false);
  const [page, setPage] = useState(restored?.page ?? 0);
  useEffect(() => { if (restored) setMessage("ui.draftRestored"); }, [restored, setMessage]);
  useEffect(() => {
    const saved = submitted ? services.drafts.clear(draftKey) : services.drafts.save(draftKey, source, { questions, answers, page, wrongOnly });
    if (!saved) setMessage("ui.draftStorageError");
  }, [services, draftKey, source, questions, answers, page, wrongOnly, submitted, setMessage]);
  const result = services.assessment.grade(questions, answers);
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "auto" });
  const changePage = (next: number) => { setPage(next); scrollTop(); };
  function restart(retryWrong: boolean) {
    setQuestions(retryWrong ? services.assessment.retry(questions, answers) : services.assessment.start(source));
    setWrongOnly(retryWrong);
    setAnswers({}); setSubmitted(false); changePage(0);
  }
  async function submit() {
    if (submissionPending.current || !result.complete || !result.total) return;
    submissionPending.current = true;
    setSubmitting(true);
    try {
      if (!wrongOnly) await updateProgress(current => {
        const outcome = services.session.submit(questions, answers, current, lesson.id, view);
        return outcome.status === "submitted" ? outcome.progress : current;
      });
      setSubmitted(true); changePage(0);
    } catch { setMessage("ui.storageError"); }
    finally { submissionPending.current = false; setSubmitting(false); }
  }
  return { services, answers, setAnswers, submitted, submitting, wrongOnly, page, changePage, result, questions,
    pageSize: assessmentPageSize, pages: Math.ceil(questions.length / assessmentPageSize),
    visible: questions.slice(page * assessmentPageSize, (page + 1) * assessmentPageSize), restart, submit };
}
