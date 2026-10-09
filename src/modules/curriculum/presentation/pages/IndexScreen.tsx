import { useState } from "react";
import { type Book, type Catalog } from "../../public";
import { useUi, useStudy } from "../../../../presentation/context";
import { Icon } from "../../../../presentation/components/Icon";
import { lessonHref } from "../routes";
import { viewText } from "../data/views";
import { beginnerBookIds, libraryDisplay, libraryLevels } from "../data/library";
import { useDashboard } from "../hooks/use-dashboard";
function BookCard({ book, number, expanded, searching, focusUnitId }: { book: Book; number: number; expanded: boolean; searching: boolean; focusUnitId: string | null }) {
  const t = useUi();
  const { progress } = useStudy();
  const [limit, setLimit] = useState<number>(() => Math.max(libraryDisplay.initialUnits, book.units.findIndex(unit => unit.id === focusUnitId) + 1));
  return <details className="textbook" open={expanded || undefined}>
    <summary className="textbook-cover">
      <span className="book-spine" aria-hidden="true">{String(number).padStart(2, "0")}</span>
      <span className="textbook-title"><small lang="ja" translate="no">{book.subtitleJa}</small><strong lang="ja" translate="no">{book.titleJa}</strong><span>{t("ui.unitCount", { count: book.units.length })}</span></span>
      <Icon name="chevron" />
    </summary>
    <div className="unit-list">
      {book.units.map((unit, i) => <article className="unit-entry" id={"unit-" + unit.id} key={unit.id} hidden={!searching && i >= limit}>
        <div className="unit-title"><div><small lang="ja" translate="no">{unit.groupJa}</small><h3 lang="ja" translate="no">{unit.titleJa}</h3></div><span className="unit-meta">{unit.wordCount > 0 ? t("ui.wordCount", { count: unit.wordCount }) : t("ui.practice")}</span></div>
        <div className="unit-actions">
          {unit.views.map(view => <a key={view} href={lessonHref(unit.id, view)} className={view === "words" ? "unit-primary" : undefined}>
            {t(viewText[view])}{progress.results[unit.id + ":" + view] && <Icon name="check" />}
          </a>)}
        </div>
      </article>)}
      {!searching && limit < book.units.length && <button className="show-more" onClick={() => setLimit(n => n + libraryDisplay.moreUnits)}>{t("ui.moreUnits", { count: book.units.length - limit })}<Icon name="chevron" /></button>}
    </div>
  </details>;
}
export function IndexScreen({ catalog }: { catalog: Catalog }) {
  const t = useUi();
  const { active, resuming: previous, summary: { mastered, saved, tests }, total, recent, visible, bookId, setBook, query, setQuery, search } = useDashboard(catalog);
  const activeView = active?.view;
  const focusUnitId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("focus");
  return <>
    <section className="dashboard-welcome" id="today">
      <div className="eyebrow" lang="ja" translate="no">{libraryDisplay.eyebrow}</div>
      <h1>{t("ui.dashboardTitle")}</h1><p>{t("ui.dashboardIntro")}</p>
    </section>
    <div className="dashboard-overview">
      {active && activeView && <section className="continue-card" aria-labelledby="continue-title">
        <div className="continue-top"><span className="continue-label"><Icon name="play" />{t(previous ? "ui.continueLearning" : "ui.startLearning")}</span><span className="continue-tag">{t(viewText[activeView])}</span></div>
        <p className="continue-book" lang="ja" translate="no">{active.book.titleJa} · {active.unit.groupJa}</p>
        <h2 id="continue-title" lang="ja" translate="no">{active.unit.titleJa}</h2>
        <a className="continue-button" href={"./" + lessonHref(active.unit.id, activeView)}>{t(previous ? "ui.continueAction" : "ui.startAction")}<Icon name="arrow" /></a>
        <span className="continue-note">{t(previous ? "ui.resumeNote" : "ui.startNote")}</span>
      </section>}
      <section className="learning-snapshot" aria-label={t("ui.learningSnapshot")}>
        <div className="snapshot-heading"><Icon name="chart" /><h2>{t("ui.learningSnapshot")}</h2><span>{t("ui.onDevice")}</span></div>
        <div className="snapshot-grid"><div><strong>{mastered}</strong><span>{t("ui.mastered")}</span></div><div><strong>{saved}</strong><span>{t("ui.saved")}</span></div><div><strong>{tests}</strong><span>{t("ui.testRecords")}</span></div></div>
        <p>{t("ui.snapshotNote")}</p>
      </section>
    </div>
    <section className="library-section" id="catalog" aria-labelledby="library-title">
      <div className="dashboard-section-heading"><div><span className="section-kicker">{libraryDisplay.libraryKicker}</span><h2 id="library-title">{t("ui.library")}</h2></div><span>{t("ui.catalogCount", { books: catalog.books.length, units: total })}</span></div>
      <div className="library-search"><Icon name="search" /><input type="search" aria-label={t("ui.search")} placeholder={t("ui.search")} value={query} onChange={e => setQuery(e.target.value)} /></div>
      <nav className="library-filters" aria-label={t("ui.bookFilter")}>
        <button aria-pressed={bookId === "all"} onClick={() => setBook("all")}>{t("ui.allBooks")}</button>
        {catalog.books.map(book => <button key={book.id} aria-pressed={bookId === book.id} onClick={() => setBook(book.id)} lang="ja" translate="no">{book.titleJa}</button>)}
      </nav>
      {libraryLevels.map(level => {
        const books = visible.filter(book => beginnerBookIds.includes(book.id) === (level.id === "beginner"));
        return books.length > 0 && <section key={level.id} className="library-level" aria-labelledby={"level-" + level.id}>
          <h3 id={"level-" + level.id}>{t(level.titleId)}</h3>
          <div className="textbook-list">{books.map(book => <BookCard key={book.id + ":" + bookId + ":" + search} book={book} number={catalog.books.findIndex(b => b.id === book.id) + 1} expanded={bookId !== "all" || !!search} searching={!!search} focusUnitId={focusUnitId} />)}</div>
        </section>;
      })}
      {!visible.length && <p className="empty-state" role="status">{t("ui.empty")}</p>}
    </section>
    <section className="record-section" id="study-records" aria-labelledby="records-title">
      <div className="dashboard-section-heading"><div><span className="section-kicker">{libraryDisplay.recordsKicker}</span><h2 id="records-title">{t("ui.recentPractice")}</h2></div><Icon name="chart" /></div>
      {recent.length ? <div className="recent-list">{recent.map(({ book, unit, view, result }) => <a className="recent-item" key={unit.id + view} href={"./" + lessonHref(unit.id, view)}><span><small lang="ja" translate="no">{book.titleJa}</small><strong lang="ja" translate="no">{unit.titleJa}</strong><span>{t(viewText[view])}</span></span><span className="recent-score">{result.correct}<small> / {result.total}</small><Icon name="arrow" /></span></a>)}</div> : <div className="records-empty"><span className="records-empty-icon"><Icon name="check" /></span><h3>{t("ui.noPracticeTitle")}</h3><p>{t("ui.noPracticeNote")}</p><a href="#catalog">{t("ui.chooseLesson")}<Icon name="arrow" /></a></div>}
    </section>
  </>;
}
