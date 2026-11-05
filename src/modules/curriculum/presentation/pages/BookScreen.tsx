import {useEffect} from "react";
import {type Book, type Catalog} from "../../public";
import {useUi} from "../../../../presentation/StudyContext";
import {Icon} from "../../../../presentation/components/Icon";
import {lessonHref} from "../routes";

export function BookScreen({book, catalog}: { book: Book; catalog: Catalog }) {
    const t = useUi();
    const summaries = new Map(catalog.lessons.map(lesson => [lesson.id, lesson]));
    const lessons = book.lessonIds.map(id => summaries.get(id)).filter(Boolean);
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
            <p>{t("ui.unitCount", {count: book.lessonIds.length})}</p>
        </header>
        <section className="book-contents" id="catalog" aria-label={book.title}>
            <div className="unit-list">
                {book.lessonIds.map((id, index) => {
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
