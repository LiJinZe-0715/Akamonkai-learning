import {useEffect} from "react";
import {type Catalog, lessonsWithView} from "../../public";
import {useUi} from "../../../../presentation/StudyContext";
import {Icon} from "../../../../presentation/components/Icon";
import {lessonHref} from "../routes";

/** 单词学习入口：按教材分组列出全部含单词页签的课，点进去直接是单词页签。 */
export function WordStudyScreen({catalog}: { catalog: Catalog }) {
    const t = useUi();
    const shelves = lessonsWithView(catalog, "words");
    const lessons = shelves.flatMap(shelf => shelf.lessons);
    const words = lessons.reduce((total, lesson) => total + lesson.wordCount, 0);
    const title = t("ui.wordStudyTitle");
    const focusId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("focus");
    useEffect(() => {
        document.title = title + "｜赤門会日本語";
    }, [title]);
    return <>
        <header className="lesson-heading">
            <h1>{title}</h1>
            <p>{t("ui.wordStudySummary", {books: shelves.length, lessons: lessons.length, words})}</p>
        </header>
        <nav className="word-study-books" aria-label={t("ui.allBooks")}>
            {shelves.map(({book}) => <a key={book.id} href={"#words-" + encodeURIComponent(book.id)}
                                        lang="ja" translate="no">{book.title}</a>)}
        </nav>
        {shelves.map(({book, lessons: bookLessons}) => (
            <section className="word-study-book" id={"words-" + book.id} key={book.id} aria-label={book.title}>
                <div className="dashboard-section-heading">
                    <h2 lang="ja" translate="no">{book.title}</h2>
                    <span>{t("ui.unitCount", {count: bookLessons.length})}</span>
                </div>
                <div className="unit-list">
                    {bookLessons.map(lesson => (
                        <a className="unit-entry unit-link" id={"words-unit-" + lesson.id} key={lesson.id}
                           href={lessonHref(lesson.id, "words", "words")}
                           aria-current={lesson.id === focusId ? "location" : undefined}>
                            <div className="unit-title">
                                <div>
                                    {lesson.group && <small lang="ja" translate="no">{lesson.group}</small>}
                                    <h3 lang="ja" translate="no">{lesson.title}</h3>
                                </div>
                                <span className="unit-meta">
                                    {t("ui.wordCount", {count: lesson.wordCount})}
                                    <Icon name="arrow"/>
                                </span>
                            </div>
                        </a>
                    ))}
                </div>
            </section>
        ))}
    </>;
}