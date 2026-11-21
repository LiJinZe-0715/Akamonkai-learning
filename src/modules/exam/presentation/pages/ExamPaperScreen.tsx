import {Fragment, useEffect, useMemo, useRef} from "react";
import type {Exam, ExamModule, ExamQuestion} from "../../public";
import {examSections} from "../../public";
import {isCorrect} from "../../../assessment/public";
import type {Catalog} from "../../../curriculum/public";
import {ExamSectionView, moduleTitles, range, sectionHeading} from "../components/ExamSectionView";
import {ExamQuestionCard} from "../components/ExamQuestionCard";
import {useExam} from "../hooks/use-exam";
import {useExamAttempt} from "../hooks/use-exam-attempt";
import {examMediaUrl} from "../data/exam-media-url";
import {Paged} from "../../../../presentation/components/Paged";
import {useUi} from "../../../../presentation/StudyContext";

/** 模块顺序固定：索引与页序都按这张表，不从数据里再取一次。 */
const moduleOrder: readonly ExamModule[] = ["knowledge", "reading", "listening"];

export function ExamPaperScreen({examId, catalog}: {examId: string; catalog?: Catalog}) {
    const t = useUi();
    const {exam, error, retry} = useExam(examId);
    if (error) {
        return (
            <section className="empty-state">
                <p role="alert">{t("ui.error")}</p>
                <button type="button" onClick={retry}>{t("ui.reload")}</button>
                <a href="./?page=library" lang="ja">{t("ui.allBooks")}</a>
            </section>
        );
    }
    if (!exam) return <p className="empty-state" role="status">{t("ui.loading")}</p>;
    return <ExamPaper exam={exam} bookTitle={catalog?.books.find(book => book.id === exam.bookId)?.title}/>;
}

/** 全卷一条音轨、一个播放器，常驻翻页条：翻页不卸载，离开聴解就暂停。 */
function ExamAudio({src, active}: {src: string; active: boolean}) {
    const player = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        if (!active) player.current?.pause();
    }, [active]);
    // 2024-12 那套原本不含听力册，也没有音源：不要给 <audio> 一个空 src，如实说明。
    if (!src) return (
        <div className="exam-audio" hidden={!active} lang="ja" translate="no">
            <span>この回の聴解音声は収録されていません</span>
        </div>
    );
    return (
        <div className="exam-audio" hidden={!active}>
            <audio
                ref={player}
                className="listening-audio"
                controls
                preload="metadata"
                src={src}
                aria-label="聴解"
            />
        </div>
    );
}

function ExamPaper({exam, bookTitle}: {exam: Exam; bookTitle?: string}) {
    const t = useUi();
    const {scoredQuestions, answers, setAnswers, revealed, setRevealed, submitted, submitting, result, submit, restart} =
        useExamAttempt(exam);
    const sections = useMemo(() => examSections(exam), [exam]);
    // 没有音源的卷子，聴解只是卷面占位：小节照常列出，但不给可作答的题目。
    const listeningUnscored = !exam.listening.audio;
    // 计分题里第一道没答的题，以及它所在的节：漏答跳转的两个落点。
    const firstUnanswered = submitted ? undefined
        : scoredQuestions.find(question => answers[question.id] === undefined);
    const unansweredPosition = firstUnanswered
        ? sections.findIndex(section => section.questions.some(question => question.id === firstUnanswered.id))
        : -1;

    const renderQuestion = (question: ExamQuestion) => {
        const open = submitted || !!revealed[question.id];
        return (
            <ExamQuestionCard
                key={question.id}
                question={question}
                answer={answers[question.id]}
                open={open}
                correct={open && isCorrect(question, answers[question.id])}
                disabled={submitted || submitting}
                onAnswer={value => setAnswers({...answers, [question.id]: value})}
                onReveal={() => setRevealed({...revealed, [question.id]: true})}
            />
        );
    };

    // 一节一页：翻页即换节，页码就是节号。
    const pages = sections.map(section => ({
        id: section.id,
        label: sectionHeading(section.label, section.title),
        content: (
            <ExamSectionView section={section}>
                {listeningUnscored && section.module === "listening"
                    ? <p className="exam-no-audio muted" role="note">{t("ui.examNoAudio")}</p>
                    : <div className="questions">{section.questions.map(renderQuestion)}</div>}
            </ExamSectionView>
        ),
    }));

    return (
        <>
            <div className="lesson-controls">
                <nav className="lesson-return">
                    <a className="return-to-book" href={"./?book=" + encodeURIComponent(exam.bookId)}>
                        ← {bookTitle ?? t("ui.allBooks")}
                    </a>
                </nav>
            </div>
            <header className="lesson-heading">
                <div className="eyebrow" lang="ja" translate="no">
                    {bookTitle ?? "JLPT"}<span aria-hidden="true"> · </span>{exam.examLevel}
                </div>
                <h1 lang="ja" translate="no">{exam.title}</h1>
                <p>{t("ui.questionCount", {count: scoredQuestions.length})}</p>
            </header>
            <div className="exam-paper">
                <div className="assessment-heading">
                    <span aria-live="polite">
                        {t("ui.progress", {done: result.answered, total: result.total})}
                    </span>
                </div>
                <progress value={result.answered} max={result.total}
                          aria-label={t("ui.progress", {done: result.answered, total: result.total})}/>
                {submitted && (
                    <div className="result-panel" role="status">
                        <strong>
                            {t("ui.result", {
                                correct: result.correct,
                                total: result.total,
                                percent: Math.round((result.correct / result.total) * 100),
                            })}
                        </strong>
                        <div className="button-row">
                            <button type="button" onClick={restart}>{t("ui.retry")}</button>
                        </div>
                    </div>
                )}

                <Paged items={pages} label={t("ui.examPapers")}
                       header={(current, select) => (
                           <>
                               <nav className="paged-modules" aria-label="試験区分" lang="ja" translate="no">
                                   {moduleOrder.map(module => {
                                       const first = sections.findIndex(section => section.module === module);
                                       if (first < 0) return null;
                                       const count = sections
                                           .filter(section => section.module === module)
                                           .reduce((total, section) => total + section.questions.length, 0);
                                       return (
                                           <button key={module} type="button"
                                                   aria-current={sections[current]?.module === module ? "true" : undefined}
                                                   onClick={() => select(first)}>
                                               {moduleTitles[module]}
                                               <small>{count}</small>
                                           </button>
                                       );
                                   })}
                               </nav>
                               {firstUnanswered && (
                                   <button className="paged-jump-unanswered" type="button"
                                           onClick={() => {
                                               select(unansweredPosition);
                                               requestAnimationFrame(() =>
                                                   document.getElementById(firstUnanswered.id)
                                                       ?.scrollIntoView({block: "center"}));
                                           }}>
                                       {t("ui.jumpUnanswered", {count: result.total - result.answered})}
                                   </button>
                               )}
                               <ExamAudio src={exam.listening.audio
                                   ? examMediaUrl(exam.listening.audio) : ""}
                                          active={sections[current]?.module === "listening"}/>
                           </>
                       )}
                       index={(select, current) => (
                    <nav className="paged-contents exam-contents" aria-label="巻末索引" lang="ja" translate="no">
                        {moduleOrder.map(module => {
                            const rows = sections
                                .map((section, position) => ({section, position}))
                                .filter(({section}) => section.module === module);
                            if (!rows.length) return null;
                            return (
                                <Fragment key={module}>
                                    <p className="exam-contents-group">{moduleTitles[module]}</p>
                                    {rows.map(({section, position}) => {
                                        const unscored = listeningUnscored && section.module === "listening";
                                        const answered = section.questions
                                            .filter(question => answers[question.id] !== undefined).length;
                                        return (
                                            <button key={section.id} type="button"
                                                    aria-current={position === current ? "true" : undefined}
                                                    data-complete={!unscored && answered === section.questions.length ? "true" : undefined}
                                                    onClick={() => select(position)}>
                                                {sectionHeading(section.label, section.title)}
                                                <small>{range(section.questions.map(question => question.number))}</small>
                                                {!unscored && (
                                                    <small className="exam-contents-progress">
                                                        {answered}/{section.questions.length}
                                                    </small>
                                                )}
                                            </button>
                                        );
                                    })}
                                </Fragment>
                            );
                        })}
                    </nav>
                )}/>

                {!submitted && (
                    <div className="submit-area">
                        <button className="primary-button" type="button"
                                disabled={!result.complete || submitting} onClick={submit}>
                            {t("ui.submitAll")}
                        </button>
                        {!result.complete && <p className="muted">{t("ui.finishAll")}</p>}
                    </div>
                )}
            </div>
        </>
    );
}
