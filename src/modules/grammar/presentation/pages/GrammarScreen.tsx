import {useMemo} from "react";
import type {Article} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {Text, useServices, useUi} from "../../../../presentation/StudyContext";
import {type ArticleViewModel, grammarViewModel} from "../grammar-view-model";
import {VoiceSelect} from "../../../../presentation/components/SpeechControls";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {ListenButton} from "../../../../presentation/components/ListenButton";

function ArticleView({
                         article,
                         catalog,
                         nested = false,
                         lessonId,
                     }: {
    article: ArticleViewModel;
    catalog: TranslationCatalog;
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
                    <Text id={id} catalog={catalog}/>
                </p>
            ))}
            {article.examples.map((e, i) => (
                <div className="example" key={i}>
                    <div className="example-japanese">
                        <JapaneseText text={e.ja}/>
                        <ListenButton text={e.ja} lines={e.lines}/>
                    </div>
                    {e.lines.some(line => line.role) && <div className="dialogue-lines">
                        {e.lines.map((line, index) => <div className="example-japanese" key={index}>
                            <span><strong>{line.role && line.role + "："}</strong><JapaneseText text={line.text}/></span>
                            <ListenButton text={line.text} role={line.role} lessonId={lessonId}/>
                        </div>)}
                    </div>}
                    {e.translationId && (
                        <p className="translation">
                            <Text id={e.translationId} catalog={catalog}/>
                        </p>
                    )}
                    {e.analysisId && (
                        <p className="analysis">
                            <Text id={e.analysisId} catalog={catalog}/>
                        </p>
                    )}
                    {e.answerJa && (
                        <details>
                            <summary lang="ja" translate="no">
                                解答
                            </summary>
                            <JapaneseText text={e.answerJa}/>
                        </details>
                    )}
                </div>
            ))}
            {article.children.map((child) => (
                <ArticleView key={child.id} article={child} catalog={catalog} lessonId={lessonId} nested/>
            ))}
        </article>
    );
}

export function GrammarScreen({articles: source, texts, lessonId}: { articles: readonly Article[]; texts: TranslationCatalog; lessonId: string }) {
    const services = useServices();
    const t = useUi();
    const {articles, lines, roles} = useMemo(() => grammarViewModel(source, lessonId), [source, lessonId]);
    return (
        <div className="grammar-layout">
            <nav className="contents" aria-label="文法の目次">
        <span lang="ja" translate="no">
          この単元の内容
        </span>
                {services.grammar.contents(source).map((item, i) => (
                    <a key={item.id} href={"#" + item.id} lang="ja" translate="no">
                        <small>{String(i + 1).padStart(2, "0")}</small>
                        {item.titleJa}
                    </a>
                ))}
            </nav>
            <div>
                <section className="speech-controls" aria-label={t("ui.speechRoles")}>
                    <div className="button-row">
                        {roles.map(role => <VoiceSelect key={role} role={role} lessonId={lessonId}/>)}
                        {lines.length > 0 &&
                            <ListenButton text={t("ui.speechContinuous")} label={t("ui.speechContinuous")}
                                          lines={lines}/>}
                    </div>
                    <small>{t("ui.speechRoleHint")}</small>
                </section>
                {articles.map((a) => (
                    <ArticleView key={a.id} article={a} catalog={texts} lessonId={lessonId}/>
                ))}
            </div>
        </div>
    );
}
