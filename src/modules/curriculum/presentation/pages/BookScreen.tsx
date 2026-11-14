import {useEffect} from "react";
import {type Book, type Catalog} from "../../public";
import {useProgress, useUi} from "../../../../presentation/StudyContext";
import {Icon} from "../../../../presentation/components/Icon";
import {assessmentResultId} from "../../../learning-progress/public";
import {examHref, lessonHref} from "../routes";

export function BookScreen({book, catalog}: { book: Book; catalog: Catalog }) {
    const t = useUi();
    const progress = useProgress();
    const summaries = new Map(catalog.lessons.map(lesson => [lesson.id, lesson]));
    const lessons = book.lessonIds.map(id => summaries.get(id)).filter(Boolean);
    // 真题教材没有课，目录里列的是「哪几场考试」。
    const exams = (book.examIds ?? []).flatMap(id => {
        const exam = catalog.exams.find(item => item.id === id);
        return exam ? [exam] : [];
    });
    const isKanjiBook = lessons.length > 0 && lessons.every(lesson => lesson!.views.includes("kanji"));
    const focusId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("focus");
    useEffect(() => {
        document.title = book.title + "｜赤門会日本語";
    }, [book.title]);
    return <>
        <div className="lesson-controls">
            <nav className="lesson-return" aria-label={t("ui.lessonNavigation")}>
                <a className="return-to-book" href="./?page=library">← {t("ui.allBooks")}</a>
            </nav>
        </div>
        <header className="lesson-heading">
            <h1 lang="ja" translate="no">{book.title}</h1>
            <p>{exams.length
                ? t("ui.examCount", {count: exams.length})
                : t("ui.unitCount", {count: book.lessonIds.length})}</p>
        </header>
        <section className="book-contents" id="catalog" aria-label={book.title}>
            <div className="unit-list">
                {exams.length ? exams.map(exam => {
                    const last = progress.results[assessmentResultId(exam.id, "exam")];
                    return (
                        <a className="unit-entry unit-link" key={exam.id} href={examHref(exam.id)} lang="ja" translate="no">
                            <div className="unit-title">
                                <div>
                                    <small>{t("ui.examPapers")}</small>
                                    <h3>{exam.title}</h3>
                                </div>
                                <span className="unit-meta">
                                    {t("ui.questionCount", {count: exam.questionCount})}
                                    {last && <small className="exam-last-result">
                                        {t("ui.examLastResult", {correct: last.correct, total: last.total})}
                                    </small>}
                                    <Icon name="arrow"/>
                                </span>
                            </div>
                        </a>
                    );
                }) : book.lessonIds.map((id, index) => {
                    const lesson = lessons[index];
                    return <a className={"unit-entry unit-link" + (isKanjiBook ? " kanji-group-entry" : "")}
                              id={"unit-" + id} key={id} href={lessonHref(id)}
                              aria-current={id === focusId ? "location" : undefined}>
                        <div className="unit-title">
                            <div>
                                {lesson?.group && <small lang="ja" translate="no">{lesson.group}</small>}
                                <h3 lang="ja" translate="no">{lesson?.title ?? id}</h3>
                            </div>
                            <span className="unit-meta">
                                {(lesson?.wordCount ?? 0) > 0
                                    ? t("ui.wordCount", {count: lesson!.wordCount})
                                    : t("ui.practice")}
                                <Icon name="arrow"/>
                            </span>
                        </div>
                    </a>;
                })}
            </div>
        </section>
    </>;
}
