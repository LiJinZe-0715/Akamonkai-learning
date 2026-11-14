import type {Word} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useLanguage, useUi} from "../../../../presentation/StudyContext";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {VoiceBar} from "../../../../presentation/components/VoiceBar";
import {wordFilterLabels, wordFilters} from "../data/word-filters";
import {partOfSpeechLabels, patternLegend, transitivityLabels} from "../data/word-analysis-labels";
import {useVocabulary} from "../hooks/use-vocabulary";

export function VocabularyScreen({words: source, texts, showToolbar = true}: { words: readonly Word[]; texts: TranslationCatalog; showToolbar?: boolean }) {
    const {progress, markWord, words, query, setQuery, filter, setFilter} = useVocabulary(source, texts);
    const t = useUi();
    const {locale} = useLanguage();
    return (
        <section>
            {showToolbar && <div className="vocabulary-toolbar">
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("ui.wordSearch")}
                    aria-label={t("ui.wordSearch")}
                />
                <div className="filter-buttons">
                    {wordFilters.map((entry) => (
                        <button
                            key={entry}
                            aria-pressed={filter === entry}
                            onClick={() => setFilter(entry)}
                        >
                            {t(wordFilterLabels[entry])}
                        </button>
                    ))}
                </div>
            </div>}
            {showToolbar && <VoiceBar/>}
            {showToolbar && <div className="list-caption">
                {t("ui.wordCount", {count: words.length})}
            </div>}
            <ul className="vocabulary-list">
                {words.map((word, index) => {
                    const mark = progress.words[word.id];
                    const patterns = word.patterns ?? [];
                    const contrasts = word.contrasts ?? [];
                    const base = word.lemma ?? word.word;
                    const primary = patterns[0];
                    const hasBreakdown = Boolean(word.analysisId && texts[word.analysisId]?.[locale]?.trim());
                    const hasDetails = patterns.length > 0 || contrasts.length > 0 || hasBreakdown;
                    return (
                        <li className="word-row" key={word.id} data-word-id={word.id}>
              <span className="row-number">
                {String(index + 1).padStart(2, "0")}
              </span>
                            <div className="word-content">
                                <p className="word-reading">
                                    <JapaneseText text={word.reading}/>
                                </p>
                                <p className="word-headword">
                                    <JapaneseText text={word.word}/>
                                </p>
                                <p className="word-meaning">
                                    <TranslatedText id={word.meaningId} catalog={texts}/>
                                </p>
                                {(word.pos || word.transitivity) && <p className="word-tags">
                                    {word.pos && <span className="word-tag">{t(partOfSpeechLabels[word.pos])}</span>}
                                    {word.transitivity && (
                                        <span className="word-tag word-tag-transitivity">
                                            {t(transitivityLabels[word.transitivity])}
                                        </span>
                                    )}
                                </p>}
                                {primary && <p className="word-pattern">
                                    <PatternText pattern={primary.pattern} base={base}/>
                                </p>}
                                {(word.noteIds ?? [])
                                    .filter(id => texts[id]?.[locale]?.trim())
                                    .map(id => (
                                        <div className="word-note" key={id}>
                                            <span className="word-note-label">{t("ui.grammarUsage")}</span>
                                            <p>
                                                <TranslatedText id={id} catalog={texts}/>
                                            </p>
                                        </div>
                                    ))}
                                {hasDetails && <details className="word-analysis">
                                    <summary>{t("ui.grammarBreakdown")}</summary>
                                    {patterns.length > 0 && <div className="word-analysis-block">
                                        <span className="word-note-label">{t("ui.wordPatterns")}</span>
                                        <ul className="word-pattern-list">
                                            {patterns.map(entry => <li key={entry.usageId}>
                                                <span className="word-pattern">
                                                    <PatternText pattern={entry.pattern} base={base}/>
                                                </span>
                                                <TranslatedText id={entry.usageId} catalog={texts}/>
                                            </li>)}
                                        </ul>
                                        <p className="word-pattern-legend">{t(patternLegend)}</p>
                                    </div>}
                                    {contrasts.length > 0 && <div className="word-analysis-block">
                                        <span className="word-note-label">{t("ui.wordContrasts")}</span>
                                        <ul className="word-contrast-list">
                                            {contrasts.map(entry => <li key={entry.differenceId}>
                                                <span className="word-contrast-head">
                                                    {entry.wordId
                                                        ? <a href={`#${entry.wordId}`} data-word-ref={entry.wordId}>
                                                            <JapaneseText text={entry.word}/>
                                                        </a>
                                                        : <JapaneseText text={entry.word}/>}
                                                    <span className="word-contrast-meaning">
                                                        <TranslatedText id={entry.glossId} catalog={texts}/>
                                                    </span>
                                                </span>
                                                <TranslatedText id={entry.differenceId} catalog={texts}/>
                                            </li>)}
                                        </ul>
                                    </div>}
                                    {hasBreakdown && word.analysisId && <div className="word-analysis-block">
                                        <span className="word-note-label">{t("ui.grammarBreakdown")}</span>
                                        <p>
                                            <TranslatedText id={word.analysisId} catalog={texts}/>
                                        </p>
                                    </div>}
                                </details>}
                            </div>
                            <div className="word-actions">
                                <ListenButton text={word.reading}/>
                                <button
                                    className="icon-button"
                                    aria-pressed={!!mark?.saved}
                                    aria-label={
                                        t(mark?.saved ? "ui.unsave" : "ui.save") + " " + word.word
                                    }
                                    onClick={() => markWord(word.id, "saved")}
                                >
                                    {mark?.saved ? "♥" : "♡"}
                                </button>
                                <button
                                    className="icon-button"
                                    aria-pressed={!!mark?.mastered}
                                    aria-label={
                                        t(mark?.mastered ? "ui.unmaster" : "ui.master") +
                                        " " +
                                        word.word
                                    }
                                    onClick={() => markWord(word.id, "mastered")}
                                >
                                    ✓
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            {!words.length && <p className="empty-state">{t("ui.empty")}</p>}
        </section>
    );
}

/**
 * 骨架里的 `<w>` 换成本词的基本形，其余原样显示。
 * 解码器保证每条骨架正好一个 `<w>`，所以这里不做容错分支。
 */
function PatternText({pattern, base}: { pattern: string; base: string }) {
    const [before, after] = pattern.split("<w>");
    return (
        <span className="word-pattern-text">
            {before}<b>{base}</b>{after}
        </span>
    );
}
