import type {Question} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useUi} from "../../../../presentation/StudyContext";
import {JapaneseText, TextSegments} from "../../../../presentation/components/JapaneseText";

/**
 * 一道题的作答卡片：题干、选项、单题核对和答案反馈。
 * 教材测验页用；真题整卷页有自己的一份（`ExamQuestionCard`），不复用这里。
 */
export function QuestionCard({
                                question,
                                number,
                                texts,
                                answer,
                                open,
                                correct,
                                disabled,
                                onAnswer,
                                onReveal,
                            }: {
    question: Question;
    /** 显示用的题号：卷面题号，缺省时由调用方给页面顺序号。 */
    number: number;
    texts: TranslationCatalog;
    answer: number | string | undefined;
    /** 已经揭晓答案（单题核对或整卷提交后）。 */
    open: boolean;
    correct: boolean;
    disabled: boolean;
    onAnswer: (value: number | string) => void;
    onReveal: () => void;
}) {
    const t = useUi();
    const choice = question.kind === "choice" ? question : undefined;
    const answered = answer !== undefined && String(answer).trim() !== "";
    return (
        <fieldset
            id={question.id}
            className={"question" + (open ? (correct ? " correct" : " incorrect") : "")}
            disabled={disabled}
        >
            <legend>
                <span className="question-number">{number}</span>
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
                                (answer === optionIndex ? "selected " : "") +
                                (open && choice.answer.includes(optionIndex) ? "answer-key" : "")
                            }
                        >
                            <input
                                type="radio"
                                name={question.id}
                                value={optionIndex}
                                checked={answer === optionIndex}
                                disabled={open}
                                onChange={() => onAnswer(optionIndex)}
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
                    aria-label={t("ui.inputAnswer") + " " + number}
                    placeholder={t("ui.inputAnswer")}
                    value={answer ?? ""}
                    onChange={(event) => onAnswer(event.target.value)}
                />
            )}
            {open ? (
                <div className="feedback">
                    <strong>{t(correct ? "ui.correct" : "ui.incorrect")}</strong>
                    <p>
                        {t("ui.answer")}：
                        {choice ? choice.answer.map((optionIndex, position) => (
                            <span key={optionIndex}>
                                {position ? " ／ " : ""}
                                <TextSegments segments={choice.options[optionIndex]} catalog={texts}/>
                            </span>
                        )) : (
                            <JapaneseText text={question.kind === "fill-in" ? question.answer.join(" ／ ") : ""}/>
                        )}
                    </p>
                    {question.explanationId && (
                        <p>
                            <strong>{t("ui.explanationLabel")}：</strong>
                            <TranslatedText id={question.explanationId} catalog={texts}/>
                        </p>
                    )}
                </div>
            ) : (
                <div className="question-actions">
                    <button type="button" disabled={!answered} onClick={onReveal}>
                        {t("ui.submitOne")}
                    </button>
                </div>
            )}
        </fieldset>
    );
}
