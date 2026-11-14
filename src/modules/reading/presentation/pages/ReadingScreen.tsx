import {Fragment, useMemo} from "react";
import type {Article} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import type {Sentence} from "../../../../shared/kernel/sentence";
import {TranslatedText, useServices, useUi} from "../../../../presentation/StudyContext";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {GroupHeads} from "../../../../presentation/components/GroupHeads";
import {JapaneseLine, LineNote} from "../../../../presentation/components/JapaneseLine";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {ProseLines} from "../../../../presentation/components/ProseLines";
import {Paged, type PagedItem} from "../../../../presentation/components/Paged";
import {VoiceBar} from "../../../../presentation/components/VoiceBar";
import {siteMediaUrl} from "../../../../presentation/site-media";
import type {SpeechLine} from "../../../speech/public";

/** 段落头的角色名：一段只出现一次，段内后续句子不再重复。 */
function ParagraphRole({role}: {role: string}) {
    return <span className="passage-role" lang="ja" translate="no">{role}</span>;
}

/** 逐句行：句子本身不带角色名，译文和拆解挂在日语行下方。 */
function SentenceRow({sentence, number, catalog, lessonId}: {
    sentence: Sentence;
    number: number;
    catalog: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    return (
        <li className="sentence">
            <span className="sentence-no" aria-hidden="true">{String(number).padStart(2, "0")}</span>
            <div className="sentence-body">
                <JapaneseLine text={sentence.text} lessonId={lessonId}>
                    {sentence.translationId && <LineNote label={t("ui.grammarTranslation")}>
                        <TranslatedText id={sentence.translationId} catalog={catalog}/>
                    </LineNote>}
                    {sentence.analysisId && <LineNote label={t("ui.grammarBreakdown")} tone="note">
                        <ProseLines id={sentence.analysisId} catalog={catalog}/>
                    </LineNote>}
                </JapaneseLine>
            </div>
        </li>
    );
}

/**
 * 本文页：先整篇通读，再逐段逐句看释义。
 * 由会话转成的跟读文章带 paragraph.role，整版与逐句都按段落分组；
 * 普通叙述文整篇算一段，保持原来的摊平排版。
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
    // 编号跨段落连续，段落头只显示角色名，不占句子编号。
    const groups = useMemo(() => {
        let start = 1;
        return article.paragraphs.map(paragraph => {
            const entry = {paragraph, start};
            start += paragraph.sentences.length;
            return entry;
        });
    }, [article]);
    const sentences = article.paragraphs.flatMap(paragraph => paragraph.sentences);
    const annotated = sentences.filter(sentence => sentence.analysisId).length;
    const hasRoles = article.paragraphs.some(paragraph => paragraph.role);
    return (
        <article className="passage" id={article.id}>
            <header className="passage-head">
                <h2 lang="ja" translate="no" className="passage-title">{article.title}</h2>
                {article.introductionId && (
                    <p className="muted"><TranslatedText id={article.introductionId} catalog={catalog}/></p>
                )}
            </header>
            {article.audio && (
                <div className="passage-audio">
                    <audio controls preload="metadata" src={siteMediaUrl(article.audio)}
                           aria-label={t("ui.passageAudio")}/>
                </div>
            )}
            <div className="passage-panel">
                <div className="passage-toolbar">
                    <span className="panel-label">{t("ui.readingText")}</span>
                    <ListenButton text={article.title} lines={lines} label={t("ui.readWhole")} join/>
                </div>
                <div className="passage-text">
                    {hasRoles ? groups.map(({paragraph}) => (
                        <Fragment key={paragraph.id}>
                            <GroupHeads section={paragraph.section} group={paragraph.group}/>
                            <p className="passage-paragraph">
                                {paragraph.role && <ParagraphRole role={paragraph.role}/>}
                                <JapaneseText text={paragraph.sentences.map(sentence => sentence.text).join("")}/>
                            </p>
                        </Fragment>
                    )) : <JapaneseText text={whole}/>}
                </div>
            </div>
            <section className="passage-sentences" aria-label={t("ui.readingSentences")}>
                <div className="passage-caption">
                    <span className="panel-label">{t("ui.readingSentences")}</span>
                    <small>
                        {t("ui.readingSentenceCount", {count: sentences.length})}
                        {annotated > 0 && " · " + t("ui.readingNoteCount", {count: annotated})}
                    </small>
                </div>
                {hasRoles ? groups.map(({paragraph, start}) => (
                    <Fragment key={paragraph.id}>
                        <GroupHeads section={paragraph.section} group={paragraph.group}/>
                        <section className="passage-group">
                            {paragraph.role && <div className="passage-group-head">
                                <ParagraphRole role={paragraph.role}/>
                            </div>}
                            <ol className="sentence-list">
                                {paragraph.sentences.map((sentence, index) => (
                                    <SentenceRow key={paragraph.id + ".sentence." + index} sentence={sentence}
                                                 number={start + index} catalog={catalog} lessonId={lessonId}/>
                                ))}
                            </ol>
                        </section>
                    </Fragment>
                )) : (
                    <ol className="sentence-list">
                        {sentences.map((sentence, index) => (
                            <SentenceRow key={article.id + ".sentence." + index} sentence={sentence}
                                         number={index + 1} catalog={catalog} lessonId={lessonId}/>
                        ))}
                    </ol>
                )}
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
            <VoiceBar/>
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
