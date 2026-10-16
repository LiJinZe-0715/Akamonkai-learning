import type {View} from "../../../curriculum/public";
import type {Question} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {Text, useUi} from "../../../../presentation/StudyContext";
import {JapaneseText, TextSegments} from "../../../../presentation/components/JapaneseText";
import {useAssessment} from "../hooks/use-assessment";

export function AssessmentScreen({
                                     source,
                                     texts,
                                     lessonId,
                                     view,
                                 }: {
    source: readonly Question[];
    texts: TranslationCatalog;
    lessonId: string;
    view: View;
}) {
    const {
        services,
        answers,
        setAnswers,
        submitted,
        submitting,
        wrongOnly,
        page,
        changePage,
        result,
        questions,
        pageSize,
        pages,
        visible,
        restart,
        submit
    } = useAssessment(source, lessonId, view);
    const t = useUi();
    const controls = (
        <div className="pagination">
            <button
                disabled={!page}
                onClick={() => changePage(page - 1)}
            >
                {t("ui.previous")}
            </button>
            <span>
        {page + 1} / {pages}
      </span>
            <button
                disabled={page + 1 >= pages}
                onClick={() => changePage(page + 1)}
            >
                {t("ui.next")}
            </button>
        </div>
    );
    if (!questions.length)
        return <p className="empty-state">{t("ui.pending")}</p>;
    return (
        <section className="assessment">
            {wrongOnly && <p className="muted">{t("ui.retryPractice")}</p>}
            <div className="assessment-heading">
                <p>
                    {view === "word-test"
                        ? t("ui.wordTest")
                        : view === "katakana"
                            ? t("ui.katakanaTest")
                            : lessonId.startsWith("kanji-")
                                ? t("ui.readingTest")
                                : t("ui.questionCount", {count: questions.length})}
                </p>
                <span aria-live="polite">
          {t("ui.progress", {done: result.answered, total: result.total})}
        </span>
            </div>
            <progress
                value={result.answered}
                max={result.total}
                aria-label={t("ui.progress", {
                    done: result.answered,
                    total: result.total,
                })}
            />
            {submitted && (
                <div className="result-panel" role="status">
                    <h2 lang="ja" translate="no">
                        練習結果
                    </h2>
                    <strong>
                        {t("ui.result", {
                            correct: result.correct,
                            total: result.total,
                            percent: Math.round((result.correct / result.total) * 100),
                        })}
                    </strong>
                    <div className="button-row">
                        {!!result.wrongIds.length && (
                            <button onClick={() => restart(true)}>
                                {t("ui.retryWrong")}
                            </button>
                        )}
                        <button onClick={() => restart(false)}>{t("ui.retry")}</button>
                    </div>
                </div>
            )}
            {pages > 1 && controls}
            <div className="questions">
                {visible.map((q, i) => {
                    const correct = services.assessment.correct(q, answers[q.id]);
                    return (
                        <fieldset
                            key={q.id}
                            className={
                                "question" +
                                (submitted ? (correct ? " correct" : " incorrect") : "")
                            }
                            disabled={submitted || submitting}
                        >
                            <legend>
                <span className="question-number">
                  {String(page * pageSize + i + 1).padStart(2, "0")}
                </span>
                                <TextSegments segments={q.prompt} catalog={texts}/>
                            </legend>
                            {q.instructionId && (
                                <p className="muted">
                                    <Text id={q.instructionId} catalog={texts}/>
                                </p>
                            )}
                            {q.options ? (
                                <div className="options">
                                    {q.options.map((o, n) => (
                                        <label
                                            key={n}
                                            className={
                                                (answers[q.id] === n ? "selected " : "") +
                                                (submitted && q.accepted?.includes(n)
                                                    ? "answer-key"
                                                    : "")
                                            }
                                        >
                                            <input
                                                type="radio"
                                                name={q.id}
                                                value={n}
                                                checked={answers[q.id] === n}
                                                onChange={() => setAnswers({...answers, [q.id]: n})}
                                            />
                                            <span className="option-letter">
                        {String.fromCharCode(65 + n)}
                      </span>
                                            <span>
                        <TextSegments segments={o} catalog={texts}/>
                      </span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <input
                                    className="answer-input"
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-label={
                                        t("ui.inputAnswer") + " " + (page * pageSize + i + 1)
                                    }
                                    placeholder={t("ui.inputAnswer")}
                                    value={answers[q.id] ?? ""}
                                    onChange={(e) =>
                                        setAnswers({...answers, [q.id]: e.target.value})
                                    }
                                />
                            )}
                            {submitted && (
                                <div className="feedback">
                                    <strong>{t(correct ? "ui.correct" : "ui.incorrect")}</strong>
                                    <p>
                                        {t("ui.answer")}：
                                        {q.options ? (
                                            q.accepted?.map((n, index) => (
                                                <span key={n}>
                          {index ? " ／ " : ""}
                                                    <TextSegments
                                                        segments={q.options![n]}
                                                        catalog={texts}
                                                    />
                        </span>
                                            ))
                                        ) : (
                                            <JapaneseText text={q.acceptedText?.join(" ／ ") ?? ""}/>
                                        )}
                                    </p>
                                    {q.explanationId && (
                                        <p>
                                            <Text id={q.explanationId} catalog={texts}/>
                                        </p>
                                    )}
                                </div>
                            )}
                        </fieldset>
                    );
                })}
            </div>
            {pages > 1 && controls}
            {!submitted && (
                <div className="submit-area">
                    <button
                        className="primary-button"
                        disabled={!result.complete || submitting}
                        onClick={submit}
                    >
                        {t("ui.submit")}
                    </button>
                    {!result.complete && <p className="muted">{t("ui.finishAll")}</p>}
                </div>
            )}
        </section>
    );
}
