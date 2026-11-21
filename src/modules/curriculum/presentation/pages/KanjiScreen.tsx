import type {Kanji} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useUi} from "../../../../presentation/StudyContext";
import {JapaneseLine, LineNote} from "../../../../presentation/components/JapaneseLine";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {Paged, type PagedItem} from "../../../../presentation/components/Paged";
import {VocabularyScreen} from "../../../vocabulary/presentation/index";
import {VoiceBar} from "../../../../presentation/components/VoiceBar";

/** 「ひと.つ」显示成「ひと」＋送假名标记，读音本身不改动。 */
function KunReading({reading}: {reading: string}) {
    const dot = reading.indexOf(".");
    if (dot < 0) return <span lang="ja" translate="no">{reading}</span>;
    return <span lang="ja" translate="no">
        {reading.slice(0, dot)}<em className="okurigana">{reading.slice(dot + 1)}</em>
    </span>;
}

function KanjiDetail({kanji, texts, lessonId}: {
    kanji: Kanji;
    texts: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    const on = kanji.onReadings.join("・").replaceAll("・", "、");
    const kun = kanji.kunReadings.map(reading => reading.replace(/\./g, "")).join("、");
    return <div className="kanji-detail">
        <section className="kanji-profile" aria-labelledby={kanji.id + "-shape-title"}>
            <div>
                <h3 id={kanji.id + "-shape-title"}>{t("ui.kanjiShape")}</h3>
                <div className="kanji-glyph" lang="ja" translate="no">{kanji.character}</div>
                {kanji.strokeCount !== undefined && <p lang="ja" translate="no">画数：{kanji.strokeCount}</p>}
                {kanji.meaningId && <p><TranslatedText id={kanji.meaningId} catalog={texts}/></p>}
            </div>
            <div className="kanji-readings">
                <h3>{t("ui.kanjiReadings")}</h3>
                {kanji.onReadings.length > 0 && <div className="kanji-reading">
                    <span lang="ja" translate="no">音読み：{kanji.onReadings.join("・")}</span>
                    <ListenButton text={on}/>
                </div>}
                {kanji.kunReadings.length > 0 && <div className="kanji-reading">
                    <span lang="ja" translate="no">訓読み：</span>
                    {kanji.kunReadings.map((reading, index) => <span key={index}>
                        {index > 0 && "・"}<KunReading reading={reading}/>
                    </span>)}
                    <ListenButton text={kun}/>
                </div>}
                {kanji.specialReadings.map(special => <div className="kanji-reading" key={special.word}>
                    <span lang="ja" translate="no">{special.word}＝{special.reading}</span>
                    <ListenButton text={special.reading}/>
                </div>)}
                {!kanji.onReadings.length && !kanji.kunReadings.length && <p className="muted">{t("ui.kanjiWordReadings")}</p>}
            </div>
        </section>
        <section aria-labelledby={kanji.id + "-vocabulary-title"}>
            <h3 id={kanji.id + "-vocabulary-title"}>{t("ui.kanjiVocabulary")}</h3>
            <VocabularyScreen words={kanji.words} texts={texts} showToolbar={false}/>
        </section>
        <section className="grammar-article">
            <h2>{t("ui.kanjiExamples")}</h2>
            {kanji.examples.length ? <ol className="sentence-list">
                {kanji.examples.map((sentence, index) => <li className="sentence" key={index}>
                    <span className="sentence-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <div className="sentence-body">
                        <JapaneseLine text={sentence.text} lessonId={lessonId}>
                            {sentence.translationId && <LineNote label={t("ui.grammarTranslation")}>
                                <TranslatedText id={sentence.translationId} catalog={texts}/>
                            </LineNote>}
                            {sentence.analysisId && <LineNote label={t("ui.grammarBreakdown")} tone="note">
                                <TranslatedText id={sentence.analysisId} catalog={texts}/>
                            </LineNote>}
                        </JapaneseLine>
                    </div>
                </li>)}
            </ol> : <p>{t("ui.kanjiNoExamples")}</p>}
        </section>
    </div>;
}

/** 一课一组字，每页一个汉字；翻页条里的字表就是索引。 */
export function KanjiScreen({items, texts, lessonId}: {
    items: readonly Kanji[];
    texts: TranslationCatalog;
    lessonId: string;
}) {
    const t = useUi();
    const number = (kanji: Kanji) => kanji.id.split(".").pop() ?? kanji.character;
    const pages: PagedItem[] = items.map(kanji => ({
        id: "character-" + kanji.id,
        label: number(kanji) + " " + kanji.character,
        content: <article className="kanji-character" id={"character-" + kanji.id}>
            <h2 className="kanji-character-title" lang="ja" translate="no">
                {number(kanji)} {kanji.character}
            </h2>
            <KanjiDetail kanji={kanji} texts={texts} lessonId={lessonId}/>
        </article>,
    }));
    return <div className="kanji-group-study">
        <VoiceBar/>
        <p className="kanji-grid-hint">{t("ui.kanjiIndexHint", {count: items.length})}</p>
        <Paged items={pages} label={t("ui.kanjiStudy")} index={(select, current) => (
            <nav className="kanji-grid" aria-label={t("ui.kanjiStudy")}>
                {items.map((kanji, position) => <a className="kanji-cell" key={kanji.id}
                                                   href={"#character-" + kanji.id}
                                                   aria-current={position === current ? "true" : undefined}
                                                   aria-label={number(kanji) + " " + kanji.character}
                                                   onClick={event => {
                                                       event.preventDefault();
                                                       select(position);
                                                   }}>
                    <span className="kanji-index">{number(kanji)}</span>
                    <strong lang="ja" translate="no">{kanji.character}</strong>
                </a>)}
            </nav>
        )}/>
    </div>;
}
