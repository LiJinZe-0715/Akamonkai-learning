import {type ReactNode} from "react";
import type {Grammar} from "../../public";
import type {Example, Sentence} from "../../../../shared/kernel/sentence";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useLanguage, useServices, useUi} from "../../../../presentation/StudyContext";
import {japaneseSpans} from "../data/japanese-spans";
import {JapaneseLine, LineNote} from "../../../../presentation/components/JapaneseLine";
import {Paged, type PagedItem} from "../../../../presentation/components/Paged";
import {VoiceBar} from "../../../../presentation/components/VoiceBar";
import {ProseLines} from "../../../../presentation/components/ProseLines";

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

/**
 * 文法例句里也有 A/B 这类双人对话（教材里共 11 课），角色名和对话页的
 * 「木山／渡辺」不是同一套，也不能指望用户去对话页给它们配音。
 * 所以直接从例句本身收集角色，交给声优栏按角色配置。
 */
function grammarRoles(grammars: readonly Grammar[]): string[] {
    const roles = new Set<string>();
    const collect = (items: readonly Grammar[]) => {
        for (const grammar of items) {
                for (const example of grammar.examples)
                    if (example.kind === "dialogue")
                        for (const line of example.lines)
                            if (line.role) roles.add(line.role);
            collect(grammar.children);
        }
    };
    collect(grammars);
    return [...roles];
}

function ExampleView({example, catalog, lessonId}: {
    example: Example;
    catalog: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    if (example.kind === "dialogue") {
        // kind 是判别属性，这里 example 已经是 Dialogue，不需要断言。
        return <div className="dialogue-lines">
            {example.lines.map((line, index) => {
                const text = line.sentences.map(sentenceText).join("");
                return <JapaneseLine key={index} text={text} role={line.role} lessonId={lessonId}>
                    {line.translationId && <LineNote label={t("ui.grammarTranslation")}>
                        <TranslatedText id={line.translationId} catalog={catalog}/>
                    </LineNote>}
                </JapaneseLine>;
            })}
            {example.analysisId && <LineNote label={t("ui.grammarBreakdown")} tone="note">
                <ProseLines id={example.analysisId} catalog={catalog}/>
            </LineNote>}
        </div>;
    }
    // 对话分支已经 return，剩下的必然是 Sentence。
    return <JapaneseLine text={example.text} lessonId={lessonId}>
        {example.translationId && <LineNote label={t("ui.grammarTranslation")}>
            <TranslatedText id={example.translationId} catalog={catalog}/>
        </LineNote>}
        {example.analysisId && <LineNote label={t("ui.grammarBreakdown")} tone="note">
            <ProseLines id={example.analysisId} catalog={catalog}/>
        </LineNote>}
    </JapaneseLine>;
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
                    <span className="panel-label">{t("ui.grammarPanelTitle")}</span>
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

export function GrammarScreen({grammars, texts, lessonId}: {
    grammars: readonly Grammar[];
    texts: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    const roles = grammarRoles(grammars);
    const pages: PagedItem[] = grammars.map((grammar, index) => ({
        id: grammar.id,
        label: String(index + 1).padStart(2, "0") + " " + grammar.title,
        content: <GrammarView grammar={grammar} catalog={texts} lessonId={lessonId} index={index}/>,
    }));
    return (
        <div className="grammar-body">
            <VoiceBar roles={roles} lessonId={lessonId} defaultVoice/>
            <Paged items={pages} label={t("ui.viewGrammar")} index={(select, current) => (
                <nav className="paged-contents" aria-label="文法の目次">
                    {grammars.map((grammar, index) => (
                        <button key={grammar.id} type="button" lang="ja" translate="no"
                                aria-current={index === current ? "true" : undefined}
                                onClick={() => select(index)}>
                            <small>{String(index + 1).padStart(2, "0")}</small>{grammar.title}
                        </button>
                    ))}
                </nav>
            )}/>
        </div>
    );
}
