import type {LessonBundle} from "../../public";
import {Text, useUi} from "../../../../presentation/StudyContext";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {GrammarScreen} from "../../../grammar/presentation/index";
import {VocabularyScreen} from "../../../vocabulary/presentation/index";

export function KanjiScreen({lesson}: {lesson: LessonBundle}) {
    const t = useUi();
    if (!lesson.characters) return <KanjiCharacter lesson={lesson}/>;
    return <div className="kanji-group-study">
        <nav className="kanji-grid" aria-label={t("ui.kanjiStudy")}>
            {lesson.characters.map(character => {
                const [, number, glyph] = character.titleJa.split(" ");
                return <a className="kanji-cell" key={character.id} href={"#character-" + character.id} aria-label={character.titleJa}>
                    <span className="kanji-index">{number}</span><strong lang="ja" translate="no">{glyph}</strong>
                </a>;
            })}
        </nav>
        {lesson.characters.map(character => <article className="kanji-character" id={"character-" + character.id} key={character.id}>
            <h2 className="kanji-character-title" lang="ja" translate="no">{character.titleJa}</h2>
            <KanjiCharacter lesson={character}/>
        </article>)}
    </div>;
}

function KanjiCharacter({lesson}: {lesson: LessonBundle}) {
    const t = useUi();
    const article = lesson.articles[0];
    const readings = article.examples.filter(example => /^(音読み|訓読み)：/.test(example.ja));
    const strokes = article.examples.find(example => example.ja.startsWith("画数："));
    const examples = article.examples.filter(example => !/^(画数|音読み|訓読み)：/.test(example.ja));
    return <div className="kanji-detail">
        <section className="kanji-profile" aria-labelledby={lesson.id + "-shape-title"}>
            <div>
                <h3 id={lesson.id + "-shape-title"}>{t("ui.kanjiShape")}</h3>
                <div className="kanji-glyph" lang="ja" translate="no">{article.titleJa}</div>
                {strokes && <p lang="ja" translate="no">{strokes.ja}</p>}
            </div>
            <div className="kanji-readings">
                <h3>{t("ui.kanjiReadings")}</h3>
                {readings.length > 0 ? readings.map(reading => {
                    const [label, value] = reading.ja.split("：");
                    return <div className="kanji-reading" key={label}>
                        <span lang="ja" translate="no">{label}：{value}</span>
                        <ListenButton text={value.replaceAll("・", "、")}/>
                    </div>;
                }) : <>
                    <p className="muted">{t("ui.kanjiWordReadings")}</p>
                    {[...new Set(lesson.words.map(word => word.readingJa))].map(reading =>
                        <div className="kanji-reading" key={reading}>
                            <span lang="ja" translate="no">{reading}</span><ListenButton text={reading}/>
                        </div>)}
                </>}
                {article.paragraphIds.map(id => <p key={id}><Text id={id} catalog={lesson.texts}/></p>)}
            </div>
        </section>
        <section aria-labelledby={lesson.id + "-vocabulary-title"}>
            <h3 id={lesson.id + "-vocabulary-title"}>{t("ui.kanjiVocabulary")}</h3>
            <VocabularyScreen words={lesson.words} texts={lesson.texts} showToolbar={false}/>
        </section>
        {examples.length > 0 || article.children.length > 0 ?
            <GrammarScreen articles={[{...article, titleJa: t("ui.kanjiExamples"), paragraphIds: [], examples}]}
                           texts={lesson.texts} lessonId={lesson.id} showContents={false} showSpeechControls={false}/> :
            <section className="grammar-article">
                <h2>{t("ui.kanjiExamples")}</h2><p>{t("ui.kanjiNoExamples")}</p>
            </section>}
    </div>;
}
