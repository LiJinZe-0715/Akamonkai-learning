import {useEffect} from "react";
import {type Book, type Unit, type View} from "../../public";
import {useProgress, useUi} from "../../../../presentation/StudyContext";
import {Icon} from "../../../../presentation/components/Icon";
import {bookHref, lessonHref} from "../curriculum-routes";
import {viewTextId} from "../data/study-view-labels";

export function LessonEntryScreen({book, unit}: {book: Book; unit: Unit}) {
    const t = useUi();
    const progress = useProgress();
    useEffect(() => {
        document.title = unit.titleJa + "｜赤門会日本語";
    }, [unit.titleJa]);
    const learning: View[] = unit.views.filter(view => view === "words" || view === "grammar" || view === "kanji");
    const tests = unit.views.filter(view => !learning.includes(view));
    return <>
        <div className="lesson-controls">
            <nav className="lesson-return" aria-label={t("ui.lessonNavigation")}>
                <a className="return-to-book" href={bookHref(book.id, unit.id)}>← {t("ui.backToBook")}</a>
                <a href="./#catalog">{t("ui.allBooks")}</a>
            </nav>
        </div>
        <header className="lesson-heading">
            <div className="eyebrow" lang="ja" translate="no">{book.titleJa} · {unit.groupJa}</div>
            <h1 lang="ja" translate="no">{unit.titleJa}</h1>
            <p>{t("ui.chooseLessonMode")}</p>
        </header>
        <div className="lesson-mode-grid">
            {[{id: "learning", title: "ui.learning", views: learning}, {id: "tests", title: "ui.tests", views: tests}].map(group =>
                group.views.length > 0 && <section className="lesson-mode-card" key={group.id} aria-labelledby={"mode-" + group.id}>
                    <h2 id={"mode-" + group.id}>{t(group.title)}</h2>
                    <div className="unit-actions">
                        {group.views.map(view => <a key={view} href={lessonHref(unit.id, view)}>
                            {t(viewTextId(book.id, view))}{progress.results[unit.id + ":" + view] && <Icon name="check"/>}<Icon name="arrow"/>
                        </a>)}
                    </div>
                </section>
            )}
        </div>
    </>;
}
