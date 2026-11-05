import {type Book, type Catalog} from "../../public";
import {useUi} from "../../../../presentation/StudyContext";
import {Icon} from "../../../../presentation/components/Icon";
import {bookHref, lessonHref} from "../routes";
import {viewTextId} from "../data/view-labels";
import {libraryLevelOrder, libraryLevelTitles} from "../data/library-display";
import {useDashboard} from "../hooks/use-dashboard";

function BookCard({book}: { book: Book }) {
    const t = useUi();
    // 只有一个单元的教材没有值得打开的目录，直接进它的页面。
    const href = book.lessonIds.length === 1 ? lessonHref(book.lessonIds[0]) : bookHref(book.id);
    return <a className="textbook textbook-cover" href={href}>
            <span className="textbook-title"><strong lang="ja"
                                                                                                              translate="no">{book.title}</strong><span>{t("ui.unitCount", {count: book.lessonIds.length})}</span></span>
            <Icon name="arrow"/>
    </a>;
}

/** 首页：上次学到哪、积累了多少、最近的练习。 */
export function HomeScreen({catalog}: { catalog: Catalog }) {
    const t = useUi();
    const {
        active,
        isResuming,
        summary: {mastered, saved, tests},
        recentResults,
    } = useDashboard(catalog);
    const activeView = active?.view;
    return <>
        <div className="dashboard-overview">
            {active && activeView && <section className="continue-card" aria-labelledby="continue-title">
                <div className="continue-top"><span className="continue-label"><Icon
                    name="play"/>{t(isResuming ? "ui.continueLearning" : "ui.startLearning")}</span><span
                    className="continue-tag">{t(viewTextId(active.book.id, activeView))}</span></div>
                <p className="continue-book" lang="ja" translate="no">{active.book.title} · {active.lesson.group}</p>
                <h2 id="continue-title" lang="ja" translate="no">{active.lesson.title}</h2>
                <a className="continue-button"
                   href={"./" + lessonHref(active.lesson.id, activeView)}>{t(isResuming ? "ui.continueAction" : "ui.startAction")}<Icon
                    name="arrow"/></a>
                <span className="continue-note">{t(isResuming ? "ui.resumeNote" : "ui.startNote")}</span>
            </section>}
            <section className="learning-snapshot" aria-label={t("ui.learningSnapshot")}>
                <div className="snapshot-heading"><Icon name="chart"/><h2>{t("ui.learningSnapshot")}</h2>
                    <span>{t("ui.onDevice")}</span></div>
                <div className="snapshot-grid">
                    <div><strong>{mastered}</strong><span>{t("ui.mastered")}</span></div>
                    <div><strong>{saved}</strong><span>{t("ui.saved")}</span></div>
                    <div><strong>{tests}</strong><span>{t("ui.testRecords")}</span></div>
                </div>
                <p>{t("ui.snapshotNote")}</p>
            </section>
        </div>
        <section className="record-section" id="study-records" aria-labelledby="records-title">
            <div className="dashboard-section-heading">
                <div><h2
                    id="records-title">{t("ui.recentPractice")}</h2></div>
                <Icon name="chart"/></div>
            {recentResults.length ?
                <div className="recent-list">{recentResults.map(({book, lesson, view, result}) => <a className="recent-item"
                                                                                            key={lesson.id + view}
                                                                                            href={"./" + lessonHref(lesson.id, view)}><span><small
                    lang="ja" translate="no">{book.title}</small><strong lang="ja"
                                                                           translate="no">{lesson.title}</strong><span>{t(viewTextId(book.id, view))}</span></span><span
                    className="recent-score">{result.correct}<small> / {result.total}</small><Icon name="arrow"/></span></a>)}</div> :
                <div className="records-empty"><span className="records-empty-icon"><Icon name="check"/></span>
                    <h3>{t("ui.noPracticeTitle")}</h3><p>{t("ui.noPracticeNote")}</p><a
                        href="./?page=library">{t("ui.chooseLesson")}<Icon name="arrow"/></a></div>}
        </section>
    </>;
}

/** 教材库：按等级分组的全部教材。 */
export function CatalogScreen({catalog}: { catalog: Catalog }) {
    const t = useUi();
    const {total, books, level, setLevel, query, setQuery} = useDashboard(catalog);
    return <>
        <section className="library-section" id="catalog" aria-labelledby="library-title">
            <div className="dashboard-section-heading">
                <div><h1
                    id="library-title">{t("ui.library")}</h1></div>
                <span>{t("ui.catalogCount", {books: catalog.books.length, units: total})}</span></div>
            <div className="library-search"><Icon name="search"/><input type="search" aria-label={t("ui.search")}
                                                                        placeholder={t("ui.search")} value={query}
                                                                        onChange={e => setQuery(e.target.value)}/></div>
            <nav className="library-filters" aria-label={t("ui.levelFilter")}>
                <button aria-pressed={level === "all"} onClick={() => setLevel("all")}>{t("ui.allLevels")}</button>
                {libraryLevelOrder.map(item => <button key={item} aria-pressed={level === item}
                                                       onClick={() => setLevel(item)}>{t(libraryLevelTitles[item])}</button>)}
            </nav>
            {libraryLevelOrder.map(groupLevel => {
                const levelBooks = books.filter(book => book.level === groupLevel);
                return levelBooks.length > 0 &&
                    <section key={groupLevel} className="library-level" aria-labelledby={"level-" + groupLevel}>
                        <h3 id={"level-" + groupLevel}>{t(libraryLevelTitles[groupLevel])}</h3>
                        <div className="textbook-list">{levelBooks.map(book => <BookCard
                            key={book.id} book={book}/>)}</div>
                    </section>;
            })}
            {!books.length && <p className="empty-state" role="status">{t("ui.empty")}</p>}
        </section>
    </>;
}
