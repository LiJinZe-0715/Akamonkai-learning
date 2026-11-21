import {Fragment, useMemo} from "react";
import type {View} from "../../../curriculum/public";
import type {Question} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {useUi} from "../../../../presentation/StudyContext";
import {useAssessment} from "../hooks/use-assessment";
import {QuestionCard} from "../components/QuestionCard";

/** 测验的一个分块：标题 + 属于这块的题目 id；题目顺序仍由 source 决定。 */
export interface QuizSection {
    readonly label: string;
    readonly questionIds: readonly string[];
}

interface QuestionBlock {
    readonly anchor: string;
    readonly label?: string;
    readonly from: number;
    readonly questions: Question[];
}

/** 按题目当前顺序切成连续块；只练错题时，空块自然消失。 */
function groupQuestions(questions: readonly Question[], sections: readonly QuizSection[]): QuestionBlock[] {
    const labelById = new Map<string, string>();
    for (const section of sections)
        for (const id of section.questionIds) labelById.set(id, section.label);
    const blocks: QuestionBlock[] = [];
    questions.forEach((question, index) => {
        const label = labelById.get(question.id);
        const last = blocks.at(-1);
        if (last && last.label === label) last.questions.push(question);
        else blocks.push({anchor: "quiz-block-" + blocks.length, label, from: index + 1, questions: [question]});
    });
    return blocks;
}

const rangeOf = (block: QuestionBlock) => block.questions.length === 1
    ? String(block.from) : `${block.from}–${block.from + block.questions.length - 1}`;

export function AssessmentScreen({
                                     source,
                                     texts,
                                     lessonId,
                                     view,
                                     sections,
                                 }: {
    source: readonly Question[];
    texts: TranslationCatalog;
    lessonId: string;
    view: View;
    sections: readonly QuizSection[];
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
    const blocks = useMemo(() => groupQuestions(questions, sections), [questions, sections]);
    const indexed = blocks.filter(block => block.label !== undefined);
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
            {indexed.length > 1 && (
                <nav className="quiz-index" aria-label={t("ui.viewQuiz")}>
                    {indexed.map(block => (
                        <a key={block.anchor} href={"#" + block.anchor}>
                            <span lang="ja" translate="no">{block.label}</span>
                            <span className="quiz-range">{rangeOf(block)}</span>
                        </a>
                    ))}
                </nav>
            )}
            <div className="questions">
                {blocks.map(block => (
                    <Fragment key={block.anchor}>
                        {block.label !== undefined && (
                            <h2 className="quiz-block-head" id={block.anchor} lang="ja" translate="no">
                                {block.label}<span className="quiz-range">{rangeOf(block)}</span>
                            </h2>
                        )}
                        {block.questions.map((question, position) => {
                            const open = submitted || !!revealed[question.id];
                            return (
                                <QuestionCard
                                    key={question.id}
                                    question={question}
                                    number={block.from + position}
                                    texts={texts}
                                    answer={answers[question.id]}
                                    open={open}
                                    correct={open && services.assessment.isCorrect(question, answers[question.id])}
                                    disabled={submitted || submitting}
                                    onAnswer={value => setAnswers({...answers, [question.id]: value})}
                                    onReveal={() => reveal(question.id)}
                                />
                            );
                        })}
                    </Fragment>
                ))}
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
