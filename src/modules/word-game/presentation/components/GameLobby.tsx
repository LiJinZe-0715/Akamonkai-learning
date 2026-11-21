import type {GameWord} from "../../public";
import type {GameRecord} from "../../../learning-progress/public";
import {useUi} from "../../../../presentation/StudyContext";
import {gameHref, gameLessonHref} from "../routes";
import {GameStars} from "./GameStars";

/** 关卡列表：纯渲染，数据由 WordGameScreen 取好传进来。 */
export function GameLobby({bookTitle, lessonTitle, lessonId, stages, records}: {
    bookTitle: string;
    lessonTitle: string;
    lessonId: string;
    stages: readonly (readonly GameWord[])[];
    records: readonly (GameRecord | undefined)[];
}) {
    const t = useUi();
    return (
        <>
            <div className="lesson-controls">
                <nav className="lesson-return">
                    <a className="return-to-book" href={gameLessonHref(lessonId)}>← {t("ui.gameBackToWords")}</a>
                </nav>
            </div>
            <header className="lesson-heading game-heading">
                <div className="eyebrow" lang="ja" translate="no">{bookTitle}</div>
                <h1 lang="ja" translate="no">{lessonTitle}</h1>
                <p className="game-subtitle">{t("ui.wordGame")}</p>
            </header>
            <ul className="game-rules">
                <li>{t("ui.gameRule1")}</li>
                <li>{t("ui.gameRule2")}</li>
                <li>{t("ui.gameRule3")}</li>
            </ul>
            {stages.length === 0 ? (
                <p className="empty-state">{t("ui.empty")}</p>
            ) : (
                <div className="game-stages">
                    {stages.map((words, index) => {
                        const n = index + 1;
                        const record = records[index];
                        return (
                            <a key={n} className="game-stage" href={gameHref(lessonId, n)}>
                                <span className="game-stage-no">{t("ui.gameStage", {n})}</span>
                                <span className="game-stage-range" lang="ja" translate="no">
                                    {words[0].word}〜{words[words.length - 1].word}
                                </span>
                                <span className="game-stage-count">{t("ui.wordCount", {count: words.length})}</span>
                                <GameStars count={record?.stars ?? 0}/>
                                <span className={record ? "game-stage-best" : "game-stage-best muted"}>
                                    {record ? t("ui.gameBest", {score: record.best}) : t("ui.gameNotPlayed")}
                                </span>
                            </a>
                        );
                    })}
                </div>
            )}
        </>
    );
}