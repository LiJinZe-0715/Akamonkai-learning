import {type ReactNode, useMemo} from "react";
import type {Grammar} from "../../public";
import type {Dialogue, Example, Sentence} from "../../../../shared/kernel/sentence";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useLanguage, useServices, useUi} from "../../../../presentation/StudyContext";
import {japaneseSpans} from "../data/japanese-spans";
import {VoiceSelect} from "../../../../presentation/components/SpeechControls";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {Paged, type PagedItem} from "../../../../presentation/components/Paged";
import {ProseLines} from "../../../../presentation/components/ProseLines";
import {dialogueLines, sharedSpeakerRole, type SpeechLine} from "../../../speech/public";

/**
 * 本地化的正文里，「」中的日语要和周围的中文区分开。
 * 只有确实含假名的引号内容才按日语处理；同样的符号也用来括中文释义，
 * 中文套上日式括号会读着别扭，所以那些改用“…”呈现。
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
            nodes.push(span.headword
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
        if (i >= 2 && !parts[i - 1].trim() && parts[i - 2].startsWith("「")) {
            nodes.push(<span className="ja-sep" aria-hidden="true" key={"sep" + i}>／</span>);
        }
        const inner = part.slice(1, -1);
        nodes.push(/[\u3040-\u30ff]/.test(inner)
            ? <em className="ja-quote" lang="ja" translate="no" key={i}>{inner}</em>
            : "“" + inner + "”");
    });
    return (
        <span lang={locale === "zh" ? "zh-CN" : "en"} data-content-id={id}>{nodes}</span>
    );
}

interface ExplainRow {
    id: string;
    labelId: "ui.grammarMeaning" | "ui.grammarFormation" | "ui.grammarUsage" | "ui.grammarPitfall" | "ui.grammarNote";
    tone: "core" | "pattern" | "plain" | "warn";
}

/** 直接读 Grammar 的字段，不再从译文 id 的后缀猜它是哪一段。 */
function explainRows(grammar: Grammar): ExplainRow[] {
    const rows: ExplainRow[] = [];
    if (grammar.meaningId) rows.push({id: grammar.meaningId, labelId: "ui.grammarMeaning", tone: "core"});
    if (grammar.formationId) rows.push({id: grammar.formationId, labelId: "ui.grammarFormation", tone: "pattern"});
    if (grammar.usageId) rows.push({id: grammar.usageId, labelId: "ui.grammarUsage", tone: "plain"});
    if (grammar.pitfallId) rows.push({id: grammar.pitfallId, labelId: "ui.grammarPitfall", tone: "warn"});
    for (const id of grammar.noteIds) rows.push({id, labelId: "ui.grammarNote", tone: "plain"});
    return rows;
}

const sentenceText = (sentence: Sentence) => sentence.text;

function ExampleView({example, catalog, lessonId}: {
    example: Example;
    catalog: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    if (example.kind === "dialogue") {
        const dialogue = example as Dialogue;
        return <div className="dialogue-lines">
            {dialogue.lines.map((line, index) => {
                const text = line.sentences.map(sentenceText).join("");
                return <div className="example-japanese" key={index}>
                    <span><strong>{line.role}：</strong><JapaneseText text={text}/></span>
                    <ListenButton text={text} role={line.role} lessonId={lessonId}/>
                    {line.translationId && <div className="example-line">
                        <span className="example-tag">{t("ui.grammarTranslation")}</span>
                        <p className="example-zh"><TranslatedText id={line.translationId} catalog={catalog}/></p>
                    </div>}
                </div>;
            })}
            {dialogue.analysisId && <div className="example-line is-note">
                <span className="example-tag">{t("ui.grammarBreakdown")}</span>
                <p className="example-note"><ProseLines id={dialogue.analysisId} catalog={catalog}/></p>
            </div>}
        </div>;
    }
    const sentence = example as Sentence;
    return <>
        <div className="example-japanese">
            <JapaneseText text={sentence.text}/>
            <ListenButton text={sentence.text} lessonId={lessonId}/>
        </div>
        {sentence.translationId && <div className="example-line">
            <span className="example-tag">{t("ui.grammarTranslation")}</span>
            <p className="example-zh"><TranslatedText id={sentence.translationId} catalog={catalog}/></p>
        </div>}
        {sentence.analysisId && <div className="example-line is-note">
            <span className="example-tag">{t("ui.grammarBreakdown")}</span>
            <p className="example-note"><ProseLines id={sentence.analysisId} catalog={catalog}/></p>
        </div>}
    </>;
}

function GrammarView({grammar, catalog, lessonId, nested = false, index}: {
    grammar: Grammar;
    catalog: TranslationCatalog;
    lessonId: string;
    nested?: boolean;
    index?: number;
}) {
    const t = useUi();
    const Heading = nested ? "h3" : "h2";
    const rows = explainRows(grammar);
    return (
        <article className={nested ? "grammar-rule" : "grammar-article"} id={grammar.id}>
            <header className="grammar-head">
                {index !== undefined && <span className="grammar-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
                <Heading lang="ja" translate="no" className="grammar-title">{grammar.title}</Heading>
            </header>
            {(rows.length > 0 || grammar.examples.length > 0) && <div className="grammar-panel">
                {rows.length > 0 && <section className="panel-block">
                    <span className="panel-label">{t("ui.grammarExplanation")}</span>
                    <div className="explain-rows">
                        {rows.map(row => <div className={"explain-row tone-" + row.tone} key={row.id}>
                            <span className="explain-label">{t(row.labelId)}</span>
                            <p className="explain-body"><ExplainText id={row.id} catalog={catalog}/></p>
                        </div>)}
                    </div>
                </section>}
                {grammar.examples.length > 0 && <section className="panel-block">
                    <span className="panel-label">{t("ui.grammarExamples")}
                        {grammar.examples.length > 1 && <b>{grammar.examples.length}</b>}
                    </span>
                    <div className="example-list">
                        {grammar.examples.map((example, position) => <div className="example" key={position}>
                            {grammar.examples.length > 1 && <span className="example-no" aria-hidden="true">
                                {String(position + 1).padStart(2, "0")}
                            </span>}
                            <ExampleView example={example} catalog={catalog} lessonId={lessonId}/>
                        </div>)}
                    </div>
                </section>}
            </div>}
            {grammar.children.map(child => <GrammarView key={child.id} grammar={child} catalog={catalog}
                                                       lessonId={lessonId} nested/>)}
        </article>
    );
}

export function GrammarScreen({grammars, texts, lessonId, showContents = true, showSpeechControls = true}: {
    grammars: readonly Grammar[];
    texts: TranslationCatalog;
    lessonId: string;
    showContents?: boolean;
    showSpeechControls?: boolean;
}) {
    const t = useUi();
    // 只收集会话例句的朗读行：单句例句有各自的朗读按钮。
    const {lines, roles} = useMemo(() => {
        const lines: SpeechLine[] = [], roleSet = new Set<string>([sharedSpeakerRole]);
        const collect = (more: SpeechLine[], found: string[]) => {
            lines.push(...more);
            found.forEach(role => roleSet.add(role));
        };
        const walk = (items: readonly Grammar[]) => {
            for (const grammar of items) {
                for (const example of grammar.examples)
                    if (example.kind === "dialogue") collect(dialogueLines(example, lessonId), example.lines.map(line => line.role));
                walk(grammar.children);
            }
        };
        walk(grammars);
        return {lines, roles: [...roleSet]};
    }, [grammars, lessonId]);
    const pages: PagedItem[] = grammars.map((grammar, index) => ({
        id: grammar.id,
        label: String(index + 1).padStart(2, "0") + " " + grammar.title,
        content: <GrammarView grammar={grammar} catalog={texts} lessonId={lessonId}
                              index={showContents ? index : undefined}/>,
    }));
    return (
        <div className={showContents ? "grammar-body" : "grammar-examples"}>
            {showSpeechControls && <section className="speech-controls" aria-label={t("ui.speechRoles")}>
                <div className="button-row">
                    {roles.map(role => <VoiceSelect key={role} role={role} lessonId={lessonId}/>)}
                    {lines.length > 0 && <ListenButton text={t("ui.speechContinuous")} label={t("ui.speechContinuous")}
                                                       lines={lines}/>}
                </div>
                <small>{t("ui.speechRoleHint")}</small>
            </section>}
            <Paged items={pages} label={t("ui.viewGrammar")} index={showContents ? (select, current) => (
                <nav className="paged-contents" aria-label="文法の目次">
                    {grammars.map((grammar, index) => (
                        <button key={grammar.id} type="button" lang="ja" translate="no"
                                aria-current={index === current ? "true" : undefined}
                                onClick={() => select(index)}>
                            <small>{String(index + 1).padStart(2, "0")}</small>{grammar.title}
                        </button>
                    ))}
                </nav>
            ) : undefined}/>
        </div>
    );
}
