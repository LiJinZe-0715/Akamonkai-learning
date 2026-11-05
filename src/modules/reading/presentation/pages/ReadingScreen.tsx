import {useMemo} from "react";
import type {Article} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useServices, useUi} from "../../../../presentation/StudyContext";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {ProseLines} from "../../../../presentation/components/ProseLines";
import {Paged, type PagedItem} from "../../../../presentation/components/Paged";
import type {SpeechLine} from "../../../speech/public";

/**
 * 本文页：先整篇通读，再逐段逐句看释义。
 * Article 自带 paragraphs，正文由各段各句顺序拼成，不再另存一份整篇文本。
 */
function PassageView({article, catalog, lessonId}: {
    article: Article;
    catalog: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    const services = useServices();
    const whole = useMemo(() => services.reading.articleText(article), [services, article]);
    const lines = useMemo<SpeechLine[]>(() => whole ? [{text: whole, lessonId}] : [], [whole, lessonId]);
    const sentences = article.paragraphs.flatMap(paragraph => paragraph.sentences);
    const annotated = sentences.filter(sentence => sentence.analysisId).length;
    return (
        <article className="passage" id={article.id}>
            <header className="passage-head">
                <h2 lang="ja" translate="no" className="passage-title">{article.title}</h2>
                {article.introductionId && (
                    <p className="muted"><TranslatedText id={article.introductionId} catalog={catalog}/></p>
                )}
            </header>
            <div className="passage-panel">
                <div className="passage-toolbar">
                    <span className="panel-label">{t("ui.readingText")}</span>
                    <ListenButton text={article.title} lines={lines} label={t("ui.readWhole")} join/>
                </div>
                <p className="passage-text"><JapaneseText text={whole}/></p>
            </div>
            <section className="passage-sentences" aria-label={t("ui.readingSentences")}>
                <div className="passage-caption">
                    <span className="panel-label">{t("ui.readingSentences")}</span>
                    <small>
                        {t("ui.readingSentenceCount", {count: sentences.length})}
                        {annotated > 0 && " · " + t("ui.readingNoteCount", {count: annotated})}
                    </small>
                </div>
                <ol className="sentence-list">
                    {sentences.map((sentence, index) => (
                        <li className="sentence" key={article.id + ".sentence." + index}>
                            <span className="sentence-no" aria-hidden="true">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <div className="sentence-body">
                                <div className="sentence-ja">
                                    <JapaneseText text={sentence.text}/>
                                    <ListenButton text={sentence.text} lessonId={lessonId}/>
                                </div>
                                {sentence.translationId && (
                                    <div className="sentence-line">
                                        <span className="sentence-tag">{t("ui.grammarTranslation")}</span>
                                        <p className="sentence-zh">
                                            <TranslatedText id={sentence.translationId} catalog={catalog}/>
                                        </p>
                                    </div>
                                )}
                                {sentence.analysisId && (
                                    <div className="sentence-line is-note">
                                        <span className="sentence-tag">{t("ui.grammarExplanation")}</span>
                                        <p className="sentence-note">
                                            <ProseLines id={sentence.analysisId} catalog={catalog}/>
                                        </p>
                                    </div>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            </section>
        </article>
    );
}

export function ReadingScreen({articles, texts, lessonId}: {
    articles: readonly Article[];
    texts: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    if (!articles.length) return <p className="empty-state">{t("ui.readingEmpty")}</p>;
    const pages: PagedItem[] = articles.map(article => ({
        id: article.id,
        label: article.title,
        content: <PassageView article={article} catalog={texts} lessonId={lessonId}/>,
    }));
    return (
        <div className="passage-body">
            <Paged items={pages} label={t("ui.viewArticles")} index={pages.length > 1 ? (select, current) => (
                <nav className="paged-contents" aria-label={t("ui.readingText")}>
                    {articles.map((article, index) => (
                        <button key={article.id} type="button" lang="ja" translate="no"
                                aria-current={index === current ? "true" : undefined}
                                onClick={() => select(index)}>
                            <small>{String(index + 1).padStart(2, "0")}</small>
                            {article.title}
                        </button>
                    ))}
                </nav>
            ) : undefined}/>
        </div>
    );
}
