import type {Word} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {Text, useLanguage, useUi} from "../../../../presentation/StudyContext";
import {JapaneseText} from "../../../../presentation/components/JapaneseText";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {wordFilters} from "../data/word-filters";
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
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("ui.wordSearch")}
                    aria-label={t("ui.wordSearch")}
                />
                <div className="filter-buttons">
                    {wordFilters.map((f) => (
                        <button
                            key={f}
                            aria-pressed={filter === f}
                            onClick={() => setFilter(f)}
                        >
                            {t("ui." + f)}
                        </button>
                    ))}
                </div>
            </div>}
            {showToolbar && <div className="list-caption">
                {t("ui.wordCount", {count: words.length})}
            </div>}
            <ul className="vocabulary-list">
                {words.map((w, i) => {
                    const progressId = w.progressId ?? w.id;
                    const mark = progress.words[progressId];
                    return (
                        <li className="word-row" key={w.id} data-word-id={w.id}>
              <span className="row-number">
                {String(i + 1).padStart(2, "0")}
              </span>
                            <div className="word-content">
                                <p className="word-reading">
                                    <JapaneseText text={w.readingJa}/>
                                </p>
                                <p className="word-headword">
                                    <JapaneseText text={w.wordJa}/>
                                </p>
                                <p className="word-meaning">
                                    <Text id={w.meaningId} catalog={texts}/>
                                </p>
                                {w.noteId && texts[w.noteId][locale].trim() && (
                                    <details className="word-note">
                                        <summary lang="ja" translate="no">
                                            用法
                                        </summary>
                                        <p>
                                            <Text id={w.noteId} catalog={texts}/>
                                        </p>
                                    </details>
                                )}
                            </div>
                            <div className="word-actions">
                                <ListenButton text={w.readingJa}/>
                                <button
                                    className="icon-button"
                                    aria-pressed={!!mark?.saved}
                                    aria-label={
                                        t(mark?.saved ? "ui.unsave" : "ui.save") + " " + w.wordJa
                                    }
                                    onClick={() => markWord(progressId, "saved")}
                                >
                                    {mark?.saved ? "♥" : "♡"}
                                </button>
                                <button
                                    className="icon-button"
                                    aria-pressed={!!mark?.mastered}
                                    aria-label={
                                        t(mark?.mastered ? "ui.unmaster" : "ui.master") +
                                        " " +
                                        w.wordJa
                                    }
                                    onClick={() => markWord(progressId, "mastered")}
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
