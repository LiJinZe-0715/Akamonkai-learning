import {useMemo} from "react";
import type {Dialogue, DialogueLine} from "../../../../shared/kernel/sentence";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useUi} from "../../../../presentation/StudyContext";
import {GroupHeads} from "../../../../presentation/components/GroupHeads";
import {JapaneseLine, LineNote} from "../../../../presentation/components/JapaneseLine";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {Paged, type PagedItem} from "../../../../presentation/components/Paged";
import {VoiceBar} from "../../../../presentation/components/VoiceBar";
import {dialogueLines, type SpeechLine} from "../../../speech/public";

interface LineBlock {
    section?: string;
    group?: string;
    items: {line: DialogueLine; number: number}[];
}

/** 会话页：直接读 Dialogue.lines，角色标签不再靠正则拆。 */
function DialogueView({dialogue, catalog, lessonId}: {
    dialogue: Dialogue;
    catalog: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    const lines = useMemo<SpeechLine[]>(() => dialogueLines(dialogue, lessonId), [dialogue, lessonId]);
    const roles = [...new Set(dialogue.lines.map(line => line.role))];
    // 一条录音轨里的 section / group 是「从这里开始」的标记：
    // 按标记切块，块内台词仍按教材顺序、编号跨块连续。其它对话不带标记，保持平铺。
    const blocks = useMemo<LineBlock[]>(() => {
        const result: LineBlock[] = [];
        dialogue.lines.forEach((line, index) => {
            if (!result.length || line.section !== undefined || line.group !== undefined)
                result.push({section: line.section, group: line.group, items: []});
            result.at(-1)!.items.push({line, number: index + 1});
        });
        return result;
    }, [dialogue]);
    const hasGroups = dialogue.lines.some(line => line.section !== undefined || line.group !== undefined);
    const row = ({line, number}: {line: DialogueLine; number: number}) => {
        const text = line.sentences.map(sentence => sentence.text).join("");
        return <li className="sentence" key={number}>
            <span className="sentence-no" aria-hidden="true">{String(number).padStart(2, "0")}</span>
            <div className="sentence-body">
                <JapaneseLine text={text} role={line.role} lessonId={lessonId}>
                    {line.translationId && <LineNote label={t("ui.grammarTranslation")}>
                        <TranslatedText id={line.translationId} catalog={catalog}/>
                    </LineNote>}
                </JapaneseLine>
            </div>
        </li>;
    };
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
            <VoiceBar roles={roles} lessonId={lessonId}/>
            {hasGroups ? blocks.map((block, index) => (
                <section className="dialogue-block" key={index}>
                    <GroupHeads section={block.section} group={block.group}/>
                    <ol className="sentence-list">{block.items.map(row)}</ol>
                </section>
            )) : (
                <ol className="sentence-list">
                    {dialogue.lines.map((line, index) => row({line, number: index + 1}))}
                </ol>
            )}
            {dialogue.analysisId && <LineNote label={t("ui.grammarBreakdown")} tone="note">
                <TranslatedText id={dialogue.analysisId} catalog={catalog}/>
            </LineNote>}
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
