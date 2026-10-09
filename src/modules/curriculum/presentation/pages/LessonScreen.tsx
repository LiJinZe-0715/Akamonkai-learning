import {
  type Book,
  type Unit,
  type View,
} from "../../public";
import { useStudy, useUi } from "../../../../presentation/context";
import { VocabularyScreen } from "../../../vocabulary/presentation/index";
import { GrammarScreen } from "../../../grammar/presentation/index";
import { AssessmentScreen } from "../../../assessment/presentation/index";
import { bookHref, lessonHref } from "../routes";
import { viewTitles } from "../data/views";
import { useLesson } from "../hooks/use-lesson";
export function LessonScreen({
  book,
  unit,
  view,
}: {
  book: Book;
  unit: Unit;
  view: View;
}) {
  const t = useUi();
  const { services } = useStudy();
  const { lesson, error, retry } = useLesson(unit, view);
  const adjacent = services.curriculum.adjacent(book, unit.id, view);
  const previous = adjacent.find(item => item.direction === "previous");
  const next = adjacent.find(item => item.direction === "next");
  const groups = [...new Set(book.units.map(item => item.groupJa))];
  return (
    <>
      <div className="lesson-controls">
        <nav className="lesson-return" aria-label={t("ui.lessonNavigation")}>
          <a className="return-to-book" href={bookHref(book.id, unit.id)}>← {t("ui.backToBook")}</a>
          <a href="./#catalog">{t("ui.allBooks")}</a>
        </nav>
        <nav className="lesson-switcher" aria-label={t("ui.switchLesson")}>
          {previous ? <a href={lessonHref(previous.unit.id, previous.view)} aria-label={t("ui.previousLesson") + ": " + previous.unit.titleJa}>← {t("ui.previousLesson")}</a> : <span aria-disabled="true">← {t("ui.previousLesson")}</span>}
          <select aria-label={t("ui.switchLesson")} value={lessonHref(unit.id, view)} lang="ja" translate="no" onChange={event => window.location.assign(event.currentTarget.value)}>
            {groups.map(group => <optgroup key={group} label={group}>{book.units.filter(item => item.groupJa === group).map(item => <option key={item.id} value={lessonHref(item.id, item.views.includes(view) ? view : item.views[0])}>{item.titleJa}</option>)}</optgroup>)}
          </select>
          {next ? <a href={lessonHref(next.unit.id, next.view)} aria-label={t("ui.nextLesson") + ": " + next.unit.titleJa}>{t("ui.nextLesson")} →</a> : <span aria-disabled="true">{t("ui.nextLesson")} →</span>}
        </nav>
      </div>
      <header className="lesson-heading">
        <div className="eyebrow" lang="ja" translate="no">
          <a href={bookHref(book.id, unit.id)}>{book.titleJa}</a><span aria-hidden="true"> · </span>{unit.groupJa}
        </div>
        <h1 lang="ja" translate="no">
          {unit.titleJa}
        </h1>
        <div className="lesson-subline">
          <span lang="ja" translate="no">
            {viewTitles[view]}
          </span>
          <span>
            {view === "words" || view === "word-test"
              ? t("ui.wordCount", { count: unit.wordCount })
              : view === "grammar-test"
                ? t("ui.questionCount", { count: unit.questionCount })
                : ""}
          </span>
        </div>
      </header>
      <nav className="lesson-tabs" aria-label="学習の種類">
        {unit.views.map((mode) => (
          <a
            key={mode}
            href={lessonHref(unit.id, mode)}
            lang="ja"
            translate="no"
            aria-current={view === mode ? "page" : undefined}
          >
            {viewTitles[mode]}
          </a>
        ))}
      </nav>
      {error ? (
        <div className="empty-state">
          <p>{t("ui.error")}</p>
          <button
            onClick={retry}
          >
            {t("ui.reload")}
          </button>
        </div>
      ) : !lesson ? (
        <p className="empty-state" role="status">
          {t("ui.loading")}
        </p>
      ) : view === "words" ? (
        <VocabularyScreen lesson={lesson} />
      ) : view === "grammar" || view === "kanji" ? (
        <GrammarScreen lesson={lesson} />
      ) : (
        <AssessmentScreen lesson={lesson} view={view} />
      )}
      <nav className="lesson-navigation" aria-label={t("ui.lessonNavigation")}>
        {adjacent.map(({ unit: u, view: nextView, direction }) => (
              <a
                key={u.id}
                lang="ja"
                translate="no"
                href={lessonHref(u.id, nextView)}
              >
                {direction === "previous" ? "← " : ""}
                {u.titleJa}
                {direction === "next" ? " →" : ""}
              </a>
        ))}
      </nav>
    </>
  );
}
