import {Fragment} from "react";
import type {ExamQuestion} from "../../public";
import {useUi} from "../../../../presentation/StudyContext";

/**
 * 真题的一道题：题干、四个选项、单题核对与答案反馈。
 * 题目与教材共用一套 Question，这里只按卷面样式把 Segment 片段铺开，
 * 结构沿用站点既有的 .question 标记，样式不用再写一套。
 */
export function ExamQuestionCard({
                                     question,
                                     answer,
                                     open,
                                     correct,
                                     disabled,
                                     onAnswer,
                                     onReveal,
                                 }: {
    question: ExamQuestion;
    answer: number | undefined;
    open: boolean;
    correct: boolean;
    disabled: boolean;
    onAnswer: (value: number) => void;
    onReveal: () => void;
}) {
    const t = useUi();
    const answered = answer !== undefined;
    const lines = question.prompt.filter(segment => segment.japanese !== undefined);
    const figures = question.prompt.filter(segment => segment.image !== undefined);
    const correctIndex = question.answer[0];
    const correctText = (question.options[correctIndex] ?? [])
        .map(segment => segment.japanese ?? "").join("");
    return (
        <fieldset
            id={question.id}
            className={"question" + (open ? (correct ? " correct" : " incorrect") : "")}
            disabled={disabled}
        >
            <legend>
                <span className="question-number">{question.number}</span>
                <span lang="ja" translate="no">
                    {lines.map((segment, index) => (
                        <Fragment key={index}>
                            {index > 0 && <br/>}
                            {segment.japanese}
                        </Fragment>
                    ))}
                </span>
            </legend>
            {figures.map((segment, index) => (
                <img key={index} className="question-image" src={segment.image}
                     alt={`${question.number}番の図`} lang="ja"/>
            ))}
            <div className="options">
                {question.options.map((option, optionIndex) => (
                    <label
                        key={optionIndex}
                        className={
                            (answer === optionIndex ? "selected " : "") +
                            (open && correctIndex === optionIndex ? "answer-key" : "")
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
                        <span className="option-letter">{optionIndex + 1}</span>
                        {option.map((segment, position) => segment.image ? (
                            <img key={position} className="option-image" src={segment.image}
                                 alt={`選択肢${optionIndex + 1}`} lang="ja"/>
                        ) : (
                            <span key={position} className="option-text" lang="ja" translate="no">
                                {segment.japanese}
                            </span>
                        ))}
                    </label>
                ))}
            </div>
            {open ? (
                <div className="feedback">
                    <strong>{t(correct ? "ui.correct" : "ui.incorrect")}</strong>
                    <p>
                        {t("ui.answer")}：
                        <span lang="ja" translate="no">
                            {correctIndex + 1}
                            {correctText ? "　" + correctText : ""}
                        </span>
                    </p>
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
