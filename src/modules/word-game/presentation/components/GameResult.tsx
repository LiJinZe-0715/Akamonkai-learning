import type {GameWord, RoundResult} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useUi} from "../../../../presentation/StudyContext";
import {ListenButton} from "../../../../presentation/components/ListenButton";
import {gameHref} from "../routes";
import {GameStars} from "./GameStars";

/** 结算页：纯渲染。previousBest 是这一局开始前的最高分，由页面在记成绩前存好。 */
export function GameResult({result, words, texts, previousBest, lessonId, stage, stageCount, onRetry}: {
    result: RoundResult;
    words: ReadonlyMap<string, GameWord>;
    texts: TranslationCatalog;
    previousBest: number | undefined;
    lessonId: string;
    stage: number;
    stageCount: number;
    onRetry: () => void;
}) {
    const t = useUi();
    const best = Math.max(previousBest ?? 0, result.score);
    const newBest = result.score > (previousBest ?? 0);
    const missed = result.missedWordIds
        .map(id => words.get(id))
        .filter((word): word is GameWord => !!word);
    return (
        <section className="game-result" role="status">
            <h1 className={result.cleared ? "game-result-title is-cleared" : "game-result-title is-failed"}>
                {t(result.cleared ? "ui.gameCleared" : "ui.gameFailed")}
            </h1>
            <GameStars count={result.stars}/>
            <div className="game-result-score">
                <strong>{t("ui.gameScore", {score: result.score})}</strong>
                {newBest && <span className="game-new-best">{t("ui.gameNewBest")}</span>}
            </div>
            <div className="game-result-stats">
                <span>{t("ui.gameBest", {score: best})}</span>
                <span>{t("ui.gameMaxCombo", {count: result.maxCombo})}</span>
                <span>{t("ui.gameMisses", {count: result.misses})}</span>
                <span>{result.clearedCount} / {result.total}</span>
            </div>
            {missed.length > 0 && (
                <div className="game-missed">
                    <h2>{t("ui.gameMissedWords")}</h2>
                    <ul className="game-missed-list">
                        {missed.map(word => (
                            <li key={word.id} className="game-missed-word">
                                <strong lang="ja" translate="no">{word.word}</strong>
                                <span className="game-missed-reading" lang="ja" translate="no">{word.reading}</span>
                                <TranslatedText id={word.meaningId} catalog={texts}/>
                                <ListenButton text={word.word} lessonId={lessonId}/>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="button-row game-result-actions">
                <button type="button" className="primary-button" onClick={onRetry}>{t("ui.gameRetry")}</button>
                {result.cleared && stage < stageCount && (
                    <a className="game-next" href={gameHref(lessonId, stage + 1)}>{t("ui.gameNext")}</a>
                )}
                <a className="game-all-stages" href={gameHref(lessonId)}>{t("ui.gameAllStages")}</a>
            </div>
        </section>
    );
}