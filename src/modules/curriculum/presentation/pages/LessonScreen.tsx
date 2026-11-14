import {useMemo} from "react";
import {type Book, type Catalog, defaultView, type LessonSummary, orderedViews, type View} from "../../public";
import {useServices, useUi} from "../../../../presentation/StudyContext";
import {VocabularyScreen} from "../../../vocabulary/presentation/index";
import {GrammarScreen} from "../../../grammar/presentation/index";
import {DialogueScreen, ReadingScreen} from "../../../reading/presentation/index";
import {AssessmentScreen} from "../../../assessment/presentation/index";
import {bookHref, lessonHref} from "../routes";
import {viewTitle} from "../data/view-labels";
import {useLesson} from "../hooks/use-lesson";
import {KanjiScreen} from "./KanjiScreen";

export function LessonScreen({book, lesson, view, catalog}: {
    book: Book;
    lesson: LessonSummary;
    view: View;
    catalog: Catalog;
}) {
    const t = useUi();
    const services = useServices();
    const {lesson: data, error, retry} = useLesson(lesson, view, book.id);
    // 分块是唯一题源：一次生成后既摊平给答题流程，又把标题和题目对应给测验页。
    const quiz = useMemo(() => data ? services.studySession.sections(data) : [], [services, data]);
    const questions = useMemo(() => quiz.flatMap(section => section.questions), [quiz]);
    const sections = useMemo(() => quiz.map(section => ({
        label: viewTitle(book.id, section.module),
        questionIds: section.questions.map(question => question.id),
    })), [quiz, book.id]);
    const adjacent = services.curriculum.adjacent(catalog, lesson.id, view);
    const previous = adjacent.find(item => item.direction === "previous");
    const next = adjacent.find(item => item.direction === "next");
    const bookLessons = catalog.lessons.filter(item => item.bookId === book.id);
    const groups = [...new Set(bookLessons.map(item => item.group ?? ""))];
    const views = orderedViews(lesson.views);
    return (
        <>
            <div className="lesson-controls">
                <nav className="lesson-return" aria-label={t("ui.lessonNavigation")}>
                    <a className="return-to-book" href={bookHref(book.id, lesson.id)}>← {t("ui.backToBook")}</a>
                    <a href="./?page=library">{t("ui.allBooks")}</a>
                </nav>
                <nav className="lesson-switcher" aria-label={t("ui.switchLesson")}>
                    {previous ? <a href={lessonHref(previous.lesson.id, previous.view)}
                                   aria-label={t("ui.previousLesson") + ": " + previous.lesson.title}>← {t("ui.previousLesson")}</a> :
                        <span aria-disabled="true">← {t("ui.previousLesson")}</span>}
                    <select aria-label={t("ui.switchLesson")} value={lessonHref(lesson.id, view)} lang="ja" translate="no"
                            onChange={event => window.location.assign(event.currentTarget.value)}>
                        {groups.map(group => <optgroup key={group} label={group}>
                            {bookLessons.filter(item => (item.group ?? "") === group).map(item =>
                                <option key={item.id}
                                        value={lessonHref(item.id, item.views.includes(view) ? view : defaultView(item.views))}>
                                    {item.title}
                                </option>)}
                        </optgroup>)}
                    </select>
                    {next ? <a href={lessonHref(next.lesson.id, next.view)}
                               aria-label={t("ui.nextLesson") + ": " + next.lesson.title}>{t("ui.nextLesson")} →</a> :
                        <span aria-disabled="true">{t("ui.nextLesson")} →</span>}
                </nav>
            </div>
            <header className="lesson-heading">
                <div className="eyebrow" lang="ja" translate="no">
                    <a href={bookHref(book.id, lesson.id)}>{book.title}</a>
                    <span aria-hidden="true"> · </span>{lesson.group}
                </div>
                <h1 lang="ja" translate="no">{lesson.title}</h1>
                <div className="lesson-subline">
                    <span lang="ja" translate="no">{viewTitle(book.id, view)}</span>
                    <span>
                        {/* 测验题数取实际出的题（固定题 + 现场生成的单词题），和测验页上的数一致；
                            目录里的 questionCount 只算固定题，课还没加载完时先不显示数字。 */}
                        {view === "words" ? t("ui.wordCount", {count: lesson.wordCount})
                            : view === "quiz" ? (data ? t("ui.questionCount", {count: questions.length}) : "") : ""}
                    </span>
                </div>
            </header>
            {/* 页签常驻，读者不用滚回页首就能切换模块。 */}
            <nav className="lesson-modes" aria-label="学習の種類">
                {views.map(entry => (
                    <a key={entry} href={lessonHref(lesson.id, entry)} lang="ja" translate="no"
                       aria-current={view === entry ? "page" : undefined}>
                        {viewTitle(book.id, entry)}
                    </a>
                ))}
            </nav>
            {error ? (
                <div className="empty-state">
                    <p>{t("ui.error")}</p>
                    <button onClick={retry}>{t("ui.reload")}</button>
                </div>
            ) : !data ? (
                <p className="empty-state" role="status">{t("ui.loading")}</p>
            ) : view === "kanji" ? (
                <KanjiScreen items={data.modules.kanji?.items ?? []} texts={data.texts} lessonId={data.id}/>
            ) : view === "words" ? (
                <VocabularyScreen words={data.modules.words?.items ?? []} texts={data.texts}/>
            ) : view === "articles" ? (
                <ReadingScreen articles={data.modules.articles?.items ?? []} texts={data.texts} lessonId={data.id}/>
            ) : view === "dialogues" ? (
                <DialogueScreen dialogues={data.modules.dialogues?.items ?? []} texts={data.texts} lessonId={data.id}/>
            ) : view === "grammar" ? (
                <GrammarScreen grammars={data.modules.grammar?.items ?? []} texts={data.texts} lessonId={data.id}/>
            ) : (
                <AssessmentScreen source={questions} sections={sections} texts={data.texts} lessonId={data.id} view={view}/>
            )}
            <nav className="lesson-navigation" aria-label={t("ui.lessonNavigation")}>
                {adjacent.map(({lesson: neighbour, view: nextView, direction}) => (
                    <a key={neighbour.id} className={"lesson-navigation-" + direction} lang="ja" translate="no"
                       href={lessonHref(neighbour.id, nextView)}>
                        {direction === "previous" ? "← " : ""}{neighbour.title}{direction === "next" ? " →" : ""}
                    </a>
                ))}
            </nav>
        </>
    );
}
