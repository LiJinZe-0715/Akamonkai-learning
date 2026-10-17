import {useEffect} from "react";
import type {Book} from "../../public";
import {useUi} from "../../../../presentation/StudyContext";
import {Icon} from "../../../../presentation/components/Icon";
import {lessonHref} from "../curriculum-routes";

export function BookScreen({book}: {book: Book}) {
    const t = useUi();
    const kanji = book.units.some(unit => unit.characters);
    const focusUnitId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("focus");
    useEffect(() => {
        document.title = book.titleJa + "｜赤門会日本語";
    }, [book.titleJa]);
    return <>
        <div className="lesson-controls">
            <nav className="lesson-return" aria-label={t("ui.lessonNavigation")}>
                <a className="return-to-book" href="./#catalog">← {t("ui.allBooks")}</a>
            </nav>
        </div>
        <header className="lesson-heading">
            <div className="eyebrow" lang="ja" translate="no">{book.subtitleJa}</div>
            <h1 lang="ja" translate="no">{book.titleJa}</h1>
            <p>{t("ui.unitCount", {count: book.units.length})}</p>
        </header>
        <section className="book-contents" id="catalog" aria-label={book.titleJa}>
            {kanji && <p className="kanji-grid-hint">{t("ui.kanjiIndexHint")}</p>}
            <div className="unit-list">
                {book.units.map(unit => unit.characters ?
                    <article className="unit-entry kanji-group-entry" id={"unit-" + unit.id}
                             key={unit.id} aria-current={unit.id === focusUnitId ? "location" : undefined}>
                        <div className="unit-title">
                            <h3 lang="ja" translate="no">{unit.titleJa}</h3>
                            <span className="unit-meta">{t("ui.kanjiCharacterCount", {count: unit.characters.length})}</span>
                        </div>
                        <p className="kanji-group-preview" lang="ja" translate="no">
                            {unit.characters.map(character => character.titleJa.split(" ")[2]).join(" ")}
                        </p>
                        <div className="unit-actions">
                            <a href={lessonHref(unit.id, "kanji")}>{t("ui.kanjiStudy")}<Icon name="arrow"/></a>
                            <a href={lessonHref(unit.id, "reading-test")}>{t("ui.kanjiTest")}<Icon name="arrow"/></a>
                        </div>
                    </article> :
                    <a className="unit-entry unit-link" href={lessonHref(unit.id)} id={"unit-" + unit.id} key={unit.id}
                       aria-current={unit.id === focusUnitId ? "location" : undefined}>
                        <div className="unit-title">
                            <div><small lang="ja" translate="no">{unit.groupJa}</small><h3 lang="ja" translate="no">{unit.titleJa}</h3></div>
                            <span className="unit-meta">{unit.wordCount > 0 ? t("ui.wordCount", {count: unit.wordCount}) : t("ui.practice")}<Icon name="arrow"/></span>
                        </div>
                    </a>)}
            </div>
        </section>
    </>;
}
