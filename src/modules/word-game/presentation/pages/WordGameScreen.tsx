import {useEffect, useMemo, useState} from "react";
import type {Catalog, Lesson} from "../../../curriculum/public";
import {gameRecordId} from "../../../learning-progress/public";
import type {GameWord} from "../../public";
import {roundResult, splitStages, toGameWords} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {useFeedback, useLanguage, useProgress, useProgressActions, useServices, useUi} from "../../../../presentation/StudyContext";
import {GameBoard} from "../components/GameBoard";
import {GameLobby} from "../components/GameLobby";
import {GameResult} from "../components/GameResult";
import {useRound} from "../hooks/use-round";
import {gameHref} from "../routes";

/** 游戏入口页：取课数据、切关卡；规则与成绩都交给引擎和存储服务。 */
export function WordGameScreen({catalog, lessonId, stage}: {
    catalog: Catalog;
    lessonId: string;
    stage: string | null;
}) {
    const services = useServices();
    const t = useUi();
    const {locale} = useLanguage();
    const progress = useProgress();
    const summary = catalog.lessons.find(item => item.id === lessonId);
    const book = summary ? catalog.books.find(item => item.id === summary.bookId) : undefined;
    const available = !!summary && !!book && summary.views.includes("words");
    const [lesson, setLesson] = useState<Lesson | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!available) return;
        let isActive = true;
        services.curriculum.lesson(lessonId).then(data => {
            if (isActive) {
                setLesson(data);
                setError(false);
            }
        }).catch(() => {
            if (isActive) setError(true);
        });
        return () => {
            isActive = false;
        };
    }, [services, lessonId, available, attempt]);
    useEffect(() => {
        if (!summary) return;
        document.title = summary.title + "・" + services.localization.uiText("ui.wordGame", locale) + "｜赤門会日本語";
    }, [summary, services, locale]);
    // 词义随界面语言走：切换语言后 answerKey 也要跟着重算。
    const gameWords = useMemo(() => lesson
        ? toGameWords(lesson.modules.words?.items ?? [], id => services.localization.text(lesson.texts, id, locale))
        : [], [lesson, services, locale]);
    const stages = useMemo(() => splitStages(gameWords), [gameWords]);
    const stageNumber = stage === null ? NaN : Number(stage);
    const playing = Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= stages.length
        ? stageNumber : null;
    if (!available || !summary || !book) {
        return (
            <section className="empty-state">
                <p role="alert">{t("ui.lessonNotFound")}</p>
                <a href="./?page=library">{t("ui.allBooks")}</a>
            </section>
        );
    }
    if (error) {
        return (
            <section className="empty-state">
                <p role="alert">{t("ui.error")}</p>
                <button type="button" onClick={() => {
                    setError(false);
                    setAttempt(n => n + 1);
                }}>{t("ui.reload")}</button>
            </section>
        );
    }
    if (!lesson) return <p className="empty-state" role="status">{t("ui.loading")}</p>;
    if (playing !== null) {
        return (
            <GameSession lessonId={lessonId} lessonTitle={summary.title} stage={playing}
                         stageCount={stages.length} words={stages[playing - 1]} pool={gameWords} texts={lesson.texts}/>
        );
    }
    return (
        <GameLobby bookTitle={book.title} lessonTitle={summary.title} lessonId={lessonId} stages={stages}
                   records={stages.map((_, index) => progress.game?.[gameRecordId(lessonId, index + 1)])}/>
    );
}

/** 进了一关之后的页面：游戏循环、讲解朗读、结束后记一次成绩。 */
export function GameSession({lessonId, lessonTitle, stage, stageCount, words, pool, texts}: {
    lessonId: string;
    lessonTitle: string;
    stage: number;
    stageCount: number;
    words: readonly GameWord[];
    pool: readonly GameWord[];
    texts: TranslationCatalog;
}) {
    const services = useServices();
    const t = useUi();
    const progress = useProgress();
    const {updateProgress} = useProgressActions();
    const {setNotice} = useFeedback();
    const {state, paused, pick, togglePause, restart} = useRound(words, pool);
    const wordsById = useMemo(() => new Map(pool.map(word => [word.id, word])), [pool]);
    const finished = state.status === "cleared" || state.status === "failed";
    // previousBest 开局就定下来：结算页第一帧渲染时就要认得出旧纪录，不能等 effect。
    const [previousBest, setPreviousBest] = useState<number | undefined>(
        () => progress.game?.[gameRecordId(lessonId, stage)]?.best);
    const [recorded, setRecorded] = useState(false);
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    // 成绩一局只记一次。
    useEffect(() => {
        if (!finished || recorded) return;
        setRecorded(true);
        const result = roundResult(state);
        if (result.score === 0 && result.stars === 0) return;
        updateProgress(current => services.progress.recordGame(current, gameRecordId(lessonId, stage), result.score, result.stars))
            .then(ok => {
                if (!ok) setNotice("ui.storageError");
            })
            .catch(() => setNotice("ui.storageError"));
    }, [finished, recorded, state, lessonId, stage, services, updateProgress, setNotice]);
    const teachingWordId = state.teaching?.wordId;
    useEffect(() => {
        if (!teachingWordId) return;
        const word = wordsById.get(teachingWordId);
        // 读不出来（没有日语声音等）不打断游戏，也不提示。
        if (word) services.speech.speak(word.word, () => {}, {lessonId});
    }, [teachingWordId, wordsById, services, lessonId]);
    useEffect(() => () => services.speech.stop(), [services]);
    return (
        <div className={"game-session" + (finished ? "" : " is-playing")}>
            <div className="game-topbar">
                <a className="game-topbar-back" href={gameHref(lessonId)}>← {t("ui.gameAllStages")}</a>
                <h1 className="game-topbar-title" lang="ja" translate="no">
                    <span className="game-topbar-lesson">{lessonTitle}</span>
                    <span className="game-heading-stage">{t("ui.gameStage", {n: stage})}</span>
                </h1>
            </div>
            {finished ? (
                <GameResult result={roundResult(state)} words={wordsById} texts={texts} previousBest={previousBest}
                            lessonId={lessonId} stage={stage} stageCount={stageCount}
                            onRetry={() => {
                                setRecorded(false);
                                setPreviousBest(progress.game?.[gameRecordId(lessonId, stage)]?.best);
                                restart();
                            }}/>
            ) : (
                <GameBoard state={state} words={wordsById} texts={texts} paused={paused}
                           onPick={pick} onTogglePause={togglePause}/>
            )}
        </div>
    );
}