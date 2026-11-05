import type {View} from "../../../curriculum/public";
import type {Question} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useUi} from "../../../../presentation/StudyContext";
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
        revealed,
        reveal,
        result,
        questions,
        restart,
        submit
    } = useAssessment(source, lessonId, view);
    const t = useUi();
    if (!questions.length)
        return <p className="empty-state">{t("ui.pending")}</p>;
    return (
        <section className="assessment">
            {wrongOnly && <p className="muted">{t("ui.retryPractice")}</p>}
            <div className="assessment-heading">
                <p>{t("ui.questionCount", {count: questions.length})}</p>
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
                    <h2 lang="ja" translate="no">練習結果</h2>
                    <strong>
                        {t("ui.result", {
                            correct: result.correct,
                            total: result.total,
                            percent: Math.round((result.correct / result.total) * 100),
                        })}
                    </strong>
                    <div className="button-row">
                        {!!result.wrongIds.length && (
                            <button onClick={() => restart(true)}>{t("ui.retryWrong")}</button>
                        )}
                        <button onClick={() => restart(false)}>{t("ui.retry")}</button>
                    </div>
                </div>
            )}
            <div className="questions">
                {questions.map((question, index) => {
                    const correct = services.assessment.isCorrect(question, answers[question.id]);
                    const answered = answers[question.id] !== undefined && String(answers[question.id]).trim() !== "";
                    const open = submitted || !!revealed[question.id];
                    const choice = question.kind === "choice" ? question : undefined;
                    return (
                        <fieldset
                            key={question.id}
                            className={"question" + (open ? (correct ? " correct" : " incorrect") : "")}
                            disabled={submitted || submitting}
                        >
                            <legend>
                                <span className="question-number">{String(index + 1).padStart(2, "0")}</span>
                                <TextSegments segments={question.prompt} catalog={texts}/>
                            </legend>
                            {question.instructionId && (
                                <p className="muted"><TranslatedText id={question.instructionId} catalog={texts}/></p>
                            )}
                            {choice ? (
                                <div className="options">
                                    {choice.options.map((option, optionIndex) => (
                                        <label
                                            key={optionIndex}
                                            className={
                                                (answers[question.id] === optionIndex ? "selected " : "") +
                                                (open && choice.correctOptionIndexes.includes(optionIndex) ? "answer-key" : "")
                                            }
                                        >
                                            <input
                                                type="radio"
                                                name={question.id}
                                                value={optionIndex}
                                                checked={answers[question.id] === optionIndex}
                                                disabled={open}
                                                onChange={() => setAnswers({...answers, [question.id]: optionIndex})}
                                            />
                                            <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                                            <span><TextSegments segments={option} catalog={texts}/></span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <input
                                    className="answer-input"
                                    autoComplete="off"
                                    spellCheck={false}
                                    disabled={open}
                                    aria-label={t("ui.inputAnswer") + " " + (index + 1)}
                                    placeholder={t("ui.inputAnswer")}
                                    value={answers[question.id] ?? ""}
                                    onChange={(event) => setAnswers({...answers, [question.id]: event.target.value})}
                                />
                            )}
                            {open ? (
                                <div className="feedback">
                                    <strong>{t(correct ? "ui.correct" : "ui.incorrect")}</strong>
                                    <p>
                                        {t("ui.answer")}：
                                        {choice ? choice.correctOptionIndexes.map((optionIndex, position) => (
                                            <span key={optionIndex}>
                                                {position ? " ／ " : ""}
                                                <TextSegments segments={choice.options[optionIndex]} catalog={texts}/>
                                            </span>
                                        )) : (
                                            <JapaneseText text={question.kind === "fill-in" ? question.acceptedAnswers.join(" ／ ") : ""}/>
                                        )}
                                    </p>
                                    {question.explanationId && (
                                        <p><TranslatedText id={question.explanationId} catalog={texts}/></p>
                                    )}
                                </div>
                            ) : (
                                <div className="question-actions">
                                    <button type="button" disabled={!answered} onClick={() => reveal(question.id)}>
                                        {t("ui.submitOne")}
                                    </button>
                                </div>
                            )}
                        </fieldset>
                    );
                })}
            </div>
            {!submitted && (
                <div className="submit-area">
                    <button className="primary-button" disabled={!result.complete || submitting} onClick={submit}>
                        {t("ui.submitAll")}
                    </button>
                    {!result.complete && <p className="muted">{t("ui.finishAll")}</p>}
                </div>
            )}
        </section>
    );
}
