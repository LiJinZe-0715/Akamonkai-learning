import type {SpokenPattern} from "../../public";
import type {Sentence} from "../../../../shared/kernel/sentence";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useUi} from "../../../../presentation/StudyContext";
import {JapaneseLine, LineNote} from "../../../../presentation/components/JapaneseLine";
import {Paged, type PagedItem} from "../../../../presentation/components/Paged";
import {VoiceBar} from "../../../../presentation/components/VoiceBar";

const pageNo = (index: number) => String(index + 1).padStart(2, "0");

/**
 * 一栏固定句型：生活表达或商务表达。
 *
 * 栏头带一行提示语，因为「生活 / 商务」这两个词本身说不清边界，
 * 而教材用白衬衫和领带两个图标表达的正是「对谁说话」这层区别。
 */
function PatternColumn({tone, label, hint, lines, catalog, lessonId}: {
    tone: "casual" | "business";
    label: string;
    hint: string;
    lines: readonly Sentence[];
    catalog: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    return <section className={"pattern-column is-" + tone}>
        <header className="pattern-column-head">
            <span className="pattern-column-label">{label}</span>
            <small>{hint}</small>
        </header>
        <div className="example-list">
            {lines.map((line, position) => <div className="example" key={position}>
                <JapaneseLine text={line.text} lessonId={lessonId}>
                    {line.translationId && <LineNote label={t("ui.grammarTranslation")}>
                        <TranslatedText id={line.translationId} catalog={catalog}/>
                    </LineNote>}
                </JapaneseLine>
            </div>)}
        </div>
    </section>;
}

function PatternView({pattern, catalog, lessonId, index}: {
    pattern: SpokenPattern;
    catalog: TranslationCatalog;
    lessonId: string;
    index: number;
}) {
    const t = useUi();
    return <article className="pattern-article" id={pattern.id}>
        <header className="grammar-head">
            <span className="grammar-no" aria-hidden="true">{pageNo(index)}</span>
            <h2 lang="ja" translate="no" className="grammar-title">{pattern.title}</h2>
        </header>
        <p className="pattern-scene">
            <span className="pattern-scene-label">{t("ui.patternScene")}</span>
            <TranslatedText id={pattern.sceneId} catalog={catalog}/>
        </p>
        <div className="pattern-panel">
            <PatternColumn tone="casual" label={t("ui.patternCasual")} hint={t("ui.patternCasualHint")}
                           lines={pattern.casual} catalog={catalog} lessonId={lessonId}/>
            {/* 教材里有少数小节（色や形状、自分の行動）两栏不是语体对比，商务栏为空，不渲染。 */}
            {pattern.business.length > 0 && <PatternColumn tone="business" label={t("ui.patternBusiness")}
                                                           hint={t("ui.patternBusinessHint")}
                                                           lines={pattern.business} catalog={catalog}
                                                           lessonId={lessonId}/>}
        </div>
    </article>;
}

export function PatternScreen({patterns, texts, lessonId}: {
    patterns: readonly SpokenPattern[];
    texts: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    const pages: PagedItem[] = patterns.map((pattern, index) => ({
        id: pattern.id,
        label: pageNo(index) + " " + pattern.title,
        content: <PatternView pattern={pattern} catalog={texts} lessonId={lessonId} index={index}/>,
    }));
    return (
        <div className="grammar-body">
            <VoiceBar lessonId={lessonId}/>
            <Paged items={pages} label={t("ui.viewPatterns")} index={(select, current) => (
                <nav className="paged-contents" aria-label="重要表現の目次">
                    {patterns.map((pattern, index) => (
                        <button key={pattern.id} type="button" lang="ja" translate="no"
                                aria-current={index === current ? "true" : undefined}
                                onClick={() => select(index)}>
                            <small>{pageNo(index)}</small>{pattern.title}
                        </button>
                    ))}
                </nav>
            )}/>
        </div>
    );
}
