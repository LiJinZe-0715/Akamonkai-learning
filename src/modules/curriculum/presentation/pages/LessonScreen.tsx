import {
  type Book,
  type Unit,
  type View,
} from "../../public";
import { useStudy, useUi } from "../../../../presentation/context";
import { VocabularyScreen } from "../../../vocabulary/presentation/index";
import { GrammarScreen } from "../../../grammar/presentation/index";
import { AssessmentScreen } from "../../../assessment/presentation/index";
import { lessonHref } from "../routes";
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
  return (
    <>
      <nav
        className="breadcrumbs"
        aria-label="現在の位置"
        lang="ja"
        translate="no"
      >
        <a href="./">教材索引</a>
        <span>/</span>
        <span>{book.titleJa}</span>
        <span>/</span>
        <span>{unit.groupJa}</span>
      </nav>
      <header className="lesson-heading">
        <div className="eyebrow" lang="ja" translate="no">
          {book.titleJa}
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
      <nav className="lesson-navigation" aria-label="課次">
        {services.curriculum.adjacent(book, unit.id, view).map(({ unit: u, view: nextView, direction }) => (
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
