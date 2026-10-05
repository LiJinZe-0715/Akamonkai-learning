import { useMemo } from "react";
import type { LessonBundle } from "../../../curriculum/public";
import { Text, useStudy, useUi } from "../../../../presentation/context";
import { grammarViewModel, type ArticleViewModel } from "../grammar-view-model";
import { VoiceSelect } from "../../../../presentation/components/SpeechControls";
import { Japanese } from "../../../../presentation/components/Japanese";
import { ListenButton } from "../../../../presentation/components/ListenButton";
function ArticleView({
  article,
  catalog,
  nested = false,
  lessonId,
}: {
  article: ArticleViewModel;
  catalog: LessonBundle["texts"];
  nested?: boolean;
  lessonId: string;
}) {
  const Heading = nested ? "h3" : "h2";
  return (
    <article
      className={nested ? "grammar-rule" : "grammar-article"}
      id={article.id}
    >
      <Heading lang="ja" translate="no">
        {article.titleJa}
      </Heading>
      {article.paragraphIds.map((id) => (
        <p key={id}>
          <Text id={id} catalog={catalog} />
        </p>
      ))}
      {article.examples.map((e, i) => (
        <div className="example" key={i}>
          <div className="example-japanese">
            <Japanese text={e.ja} />
            <ListenButton text={e.ja} lines={e.lines} />
          </div>
          {e.lines.some(line => line.role) && <div className="dialogue-lines">
            {e.lines.map((line, index) => <div className="example-japanese" key={index}>
              <span><strong>{line.role && line.role + "："}</strong><Japanese text={line.text} /></span>
              <ListenButton text={line.text} role={line.role} lessonId={lessonId} />
            </div>)}
          </div>}
          {e.translationId && (
            <p className="translation">
              <Text id={e.translationId} catalog={catalog} />
            </p>
          )}
          {e.analysisId && (
            <p className="analysis">
              <Text id={e.analysisId} catalog={catalog} />
            </p>
          )}
          {e.answerJa && (
            <details>
              <summary lang="ja" translate="no">
                解答
              </summary>
              <Japanese text={e.answerJa} />
            </details>
          )}
        </div>
      ))}
      {article.children.map((child) => (
        <ArticleView key={child.id} article={child} catalog={catalog} lessonId={lessonId} nested />
      ))}
    </article>
  );
}
export function GrammarScreen({ lesson }: { lesson: LessonBundle }) {
  const { services } = useStudy();
  const t = useUi();
  const { articles, lines, roles } = useMemo(() => grammarViewModel(lesson.articles, lesson.id), [lesson]);
  return (
    <div className="grammar-layout">
      <nav className="contents" aria-label="文法の目次">
        <span lang="ja" translate="no">
          この単元の内容
        </span>
        {services.grammar.contents(lesson.articles).map((item, i) => (
          <a key={item.id} href={"#" + item.id} lang="ja" translate="no">
            <small>{String(i + 1).padStart(2, "0")}</small>
            {item.titleJa}
          </a>
        ))}
      </nav>
      <div>
        <section className="speech-controls" aria-label={t("ui.speechRoles")}>
          <div className="button-row">
            {roles.map(role => <VoiceSelect key={role} role={role} lessonId={lesson.id} />)}
            {lines.length > 0 && <ListenButton text={t("ui.speechContinuous")} label={t("ui.speechContinuous")} lines={lines} />}
          </div>
          <small>{t("ui.speechRoleHint")}</small>
        </section>
        {articles.map((a) => (
          <ArticleView key={a.id} article={a} catalog={lesson.texts} lessonId={lesson.id} />
        ))}
      </div>
    </div>
  );
}
