import type {Word} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useLanguage, useUi} from "../../../../presentation/StudyContext";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {wordFilterLabels, wordFilters} from "../data/word-filters";
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
            {showToolbar && <div className="list-caption">
                {t("ui.wordCount", {count: words.length})}
            </div>}
            <ul className="vocabulary-list">
                {words.map((word, index) => {
                    const mark = progress.words[word.id];
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
                                {word.noteId && texts[word.noteId][locale].trim() && (
                                    <div className="word-note">
                                        <span className="word-note-label" lang="ja" translate="no">用法</span>
                                        <p>
                                            <TranslatedText id={word.noteId} catalog={texts}/>
                                        </p>
                                    </div>
                                )}
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
