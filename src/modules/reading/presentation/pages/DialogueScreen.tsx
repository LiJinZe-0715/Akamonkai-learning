import {useMemo} from "react";
import type {Dialogue} from "../../../../shared/kernel/sentence";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useUi} from "../../../../presentation/StudyContext";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {Paged, type PagedItem} from "../../../../presentation/components/Paged";
import {dialogueLines, type SpeechLine} from "../../../speech/public";

/** 会话页：直接读 Dialogue.lines，角色标签不再靠正则拆。 */
function DialogueView({dialogue, catalog, lessonId}: {
    dialogue: Dialogue;
    catalog: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    const lines = useMemo<SpeechLine[]>(() => dialogueLines(dialogue, lessonId), [dialogue, lessonId]);
    const roles = [...new Set(dialogue.lines.map(line => line.role))];
    return (
        <article className="passage" id={dialogue.id}>
            <header className="passage-head">
                <h2 lang="ja" translate="no" className="passage-title">
                    {dialogue.title ?? t("ui.viewDialogues")}
                </h2>
                {dialogue.introductionId && (
                    <p className="muted"><TranslatedText id={dialogue.introductionId} catalog={catalog}/></p>
                )}
            </header>
            <div className="passage-toolbar">
                <span className="panel-label">{t("ui.viewDialogues")}</span>
                <ListenButton text={dialogue.title ?? t("ui.speechContinuous")} lines={lines}
                              label={t("ui.speechContinuous")}/>
            </div>
            <ol className="sentence-list">
                {dialogue.lines.map((line, index) => {
                    const text = line.sentences.map(sentence => sentence.text).join("");
                    return <li className="sentence" key={index}>
                        <span className="sentence-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                        <div className="sentence-body">
                            <div className="sentence-ja">
                                <strong lang="ja" translate="no">{line.role}：</strong>
                                <JapaneseText text={text}/>
                                <ListenButton text={text} role={line.role} lessonId={lessonId}/>
                            </div>
                            {line.translationId && <div className="sentence-line">
                                <span className="sentence-tag">{t("ui.grammarTranslation")}</span>
                                <p className="sentence-zh"><TranslatedText id={line.translationId} catalog={catalog}/></p>
                            </div>}
                        </div>
                    </li>;
                })}
            </ol>
            {dialogue.analysisId && <div className="example-line is-note">
                <span className="example-tag">{t("ui.grammarBreakdown")}</span>
                <p className="example-note"><TranslatedText id={dialogue.analysisId} catalog={catalog}/></p>
            </div>}
            {roles.length > 1 && <small className="muted">{roles.join(" / ")}</small>}
        </article>
    );
}

export function DialogueScreen({dialogues, texts, lessonId}: {
    dialogues: readonly Dialogue[];
    texts: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    if (!dialogues.length) return <p className="empty-state">{t("ui.empty")}</p>;
    const pages: PagedItem[] = dialogues.map(dialogue => ({
        id: dialogue.id,
        label: dialogue.title ?? t("ui.viewDialogues"),
        content: <DialogueView dialogue={dialogue} catalog={texts} lessonId={lessonId}/>,
    }));
    return <div className="passage-body">
        <Paged items={pages} label={t("ui.viewDialogues")} index={pages.length > 1 ? (select, current) => (
            <nav className="paged-contents" aria-label={t("ui.viewDialogues")}>
                {pages.map((page, index) => (
                    <button key={page.id} type="button" lang="ja" translate="no"
                            aria-current={index === current ? "true" : undefined}
                            onClick={() => select(index)}>
                        <small>{String(index + 1).padStart(2, "0")}</small>{page.label}
                    </button>
                ))}
            </nav>
        ) : undefined}/>
    </div>;
}
