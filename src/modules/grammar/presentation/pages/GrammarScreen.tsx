import {type ReactNode, useMemo} from "react";
import type {Article} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {Text, useLanguage, useServices, useUi} from "../../../../presentation/StudyContext";
import {type ArticleViewModel, grammarViewModel} from "../grammar-view-model";
import {explainBlocks} from "../grammar-blocks";
import {japaneseSpans} from "../japanese-spans";
import {VoiceSelect} from "../../../../presentation/components/SpeechControls";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {ListenButton} from "../../../../presentation/components/ListenButton";

/**
 * Localized prose with the Japanese inside 「」 set off from the Chinese around it.
 * Only quotes that actually contain kana are treated as Japanese; the same marks
 * also wrap Chinese glosses, and those read wrong in Japanese brackets, so they
 * come out as “…” instead.
 */
function ExplainText({id, catalog, autoJapanese = false}: {
    id: string;
    catalog: TranslationCatalog;
    autoJapanese?: boolean;
}) {
    const services = useServices();
    const {locale} = useLanguage();
    const value = services.localization.text(catalog, id, locale);
    const parts = value.split(/(「[^」]+」)/g);
    const nodes: ReactNode[] = [];
    const pushPlain = (text: string, keyBase: string) => {
        if (!text) return;
        if (!autoJapanese) {
            nodes.push(text);
            return;
        }
        let cursor = 0;
        japaneseSpans(text).forEach((span, n) => {
            if (span.start > cursor) nodes.push(text.slice(cursor, span.start));
            const body = text.slice(span.start, span.end);
            nodes.push(span.head
                ? <strong className="term-head" lang="ja" translate="no" key={keyBase + "-" + n}>{body}</strong>
                : <em className="ja-quote" lang="ja" translate="no" key={keyBase + "-" + n}>{body}</em>);
            cursor = span.end;
        });
        if (cursor < text.length) nodes.push(text.slice(cursor));
    };
    parts.forEach((part, i) => {
        const quoted = part.startsWith("「") && part.endsWith("」");
        if (!quoted) {
            pushPlain(part, "p" + i);
            return;
        }
        // Two examples written back to back read as one string: separate them.
        // Only true neighbours qualify — a CSS selector cannot tell, since text
        // between two elements is invisible to `+`.
        if (i >= 2 && !parts[i - 1].trim() && parts[i - 2].startsWith("「")) {
            nodes.push(<span className="ja-sep" aria-hidden="true" key={"sep" + i}>／</span>);
        }
        const inner = part.slice(1, -1);
        nodes.push(/[\u3040-\u30ff]/.test(inner)
            ? <em className="ja-quote" lang="ja" translate="no" key={i}>{inner}</em>
            : "“" + inner + "”");
    });
    return (
        <span lang={locale === "zh" ? "zh-CN" : "en"} data-content-id={id}>
            {nodes}
        </span>
    );
}

function ArticleView({
                         article,
                         catalog,
                         nested = false,
                         lessonId,
                         index,
                     }: {
    article: ArticleViewModel;
    catalog: TranslationCatalog;
    nested?: boolean;
    lessonId: string;
    index?: number;
}) {
    const t = useUi();
    const Heading = nested ? "h3" : "h2";
    const blocks = explainBlocks(article.paragraphIds);
    // 語彙の使い方 and 内容のまとめ are prose, not grammar notes: their Japanese
    // was never put in 「」, so it has to be found by script.
    const glossary = !article.id.includes(".grammar.");
    return (
        <article
            className={nested ? "grammar-rule" : "grammar-article"}
            id={article.id}
        >
            <header className="grammar-head">
                {index !== undefined && (
                    <span className="grammar-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                )}
                <Heading lang="ja" translate="no" className="grammar-title">
                    {article.titleJa}
                </Heading>
            </header>
            {(blocks.length > 0 || article.examples.length > 0) && (
                <div className="grammar-panel">
                    {blocks.length > 0 && (
                        <section className="panel-block">
                            <span className="panel-label">{t("ui.grammarExplanation")}</span>
                            <div className="explain-rows">
                                {blocks.map((block) => (
                                    <div className={"explain-row tone-" + block.tone} key={block.id}>
                                        <span className="explain-label">{t(block.labelId)}</span>
                                        <p className="explain-body">
                                            <ExplainText id={block.id} catalog={catalog}
                                                         autoJapanese={glossary}/>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                    {article.examples.length > 0 && (
                        <section className="panel-block">
                            <span className="panel-label">
                                {t(article.id.includes(".reading.") ? "ui.readingText" : "ui.grammarExamples")}
                                {article.examples.length > 1 && <b>{article.examples.length}</b>}
                            </span>
                            <div className="example-list">
                                {article.examples.map((e, i) => (
                                    <div className="example" key={i}>
                                        {article.examples.length > 1 && (
                                            <span className="example-no" aria-hidden="true">
                                                {String(i + 1).padStart(2, "0")}
                                            </span>
                                        )}
                                        {/* Speaker labels are parsed back out of the same
                                            string, so printing e.ja as well would show the
                                            dialogue twice. */}
                                        {e.lines.some(line => line.role) ? (
                                            <div className="dialogue-lines">
                                                {e.lines.map((line, index) => <div className="example-japanese" key={index}>
                                                    <span><strong>{line.role && line.role + "："}</strong><JapaneseText
                                                        text={line.text}/></span>
                                                    <ListenButton text={line.text} role={line.role}
                                                                  lessonId={lessonId}/>
                                                </div>)}
                                            </div>
                                        ) : (
                                            <div className="example-japanese">
                                                <JapaneseText text={e.ja}/>
                                                <ListenButton text={e.ja} lines={e.lines}/>
                                            </div>
                                        )}
                                        {e.translationId && (
                                            <div className="example-line">
                                                <span className="example-tag">{t("ui.grammarTranslation")}</span>
                                                <p className="example-zh">
                                                    <Text id={e.translationId} catalog={catalog}/>
                                                </p>
                                            </div>
                                        )}
                                        {e.analysisId && (
                                            <div className="example-line is-note">
                                                <span className="example-tag">{t("ui.grammarBreakdown")}</span>
                                                <p className="example-note">
                                                    <Text id={e.analysisId} catalog={catalog}/>
                                                </p>
                                            </div>
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
                            </div>
                        </section>
                    )}
                </div>
            )}
            {article.children.map((child) => (
                <ArticleView key={child.id} article={child} catalog={catalog} lessonId={lessonId} nested/>
            ))}
        </article>
    );
}

export function GrammarScreen({articles: source, texts, lessonId, showContents = true, showSpeechControls = true}: { articles: readonly Article[]; texts: TranslationCatalog; lessonId: string; showContents?: boolean; showSpeechControls?: boolean }) {
    const services = useServices();
    const t = useUi();
    const {articles, lines, roles} = useMemo(() => grammarViewModel(source, lessonId), [source, lessonId]);
    return (
        <div className={showContents ? "grammar-layout" : "grammar-examples"}>
            {showContents && <nav className="contents" aria-label="文法の目次">
        <span lang="ja" translate="no">
          この単元の内容
        </span>
                {services.grammar.contents(source).map((item, i) => (
                    <a key={item.id} href={"#" + item.id} lang="ja" translate="no">
                        <small>{String(i + 1).padStart(2, "0")}</small>
                        {item.titleJa}
                    </a>
                ))}
            </nav>}
            <div className="grammar-body">
                {showSpeechControls && <section className="speech-controls" aria-label={t("ui.speechRoles")}>
                    <div className="button-row">
                        {roles.map(role => <VoiceSelect key={role} role={role} lessonId={lessonId}/>)}
                        {lines.length > 0 &&
                            <ListenButton text={t("ui.speechContinuous")} label={t("ui.speechContinuous")}
                                          lines={lines}/>}
                    </div>
                    <small>{t("ui.speechRoleHint")}</small>
                </section>}
                {articles.map((a, i) => (
                    <ArticleView key={a.id} article={a} catalog={texts} lessonId={lessonId}
                                 index={showContents ? i : undefined}/>
                ))}
            </div>
        </div>
    );
}
