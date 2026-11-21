import {type CSSProperties, type RefObject, useLayoutEffect, useRef} from "react";
import type {GameWord, RoundState} from "../../public";
import {comboMultiplier, gameConfig} from "../../public";
import type {TranslationCatalog} from "../../../../shared/kernel/text-types";
import {TranslatedText, useUi} from "../../../../presentation/StudyContext";

/** 泡泡字号的下限：再小就认不出字了。 */
const minBubbleFontPx = 9;

/**
 * 词必须一行读完才有识别度：先按一列的宽度量，放不下就压字号；压到下限还放不下时
 * 保住字号、让泡泡横向伸出这一列。
 * 伸出时一定要把泡泡拨回场地内：泡泡是 translate(-50%) 居中定位的，越过场地右边会被
 * .game-field 的 overflow 裁掉——窄屏上「长词后半截不见了」就是这么来的。
 * 观察场地而不是泡泡本身：压字号会让泡泡变窄，观察自己会来回震荡。
 * 每次测量前先还原样式表给的基准值，窗口或字号变化后不会越缩越小。
 */
function useBubbleFit(box: RefObject<HTMLDivElement | null>, lane: number) {
    const laneLeft = ((lane + 0.5) / gameConfig.lanes * 100) + "%";
    useLayoutEffect(() => {
        const fit = () => {
            const element = box.current;
            const field = element?.parentElement;
            if (!element || !field) return;
            element.style.fontSize = "";
            element.style.maxWidth = "";
            element.style.left = laneLeft;
            const style = getComputedStyle(element);
            const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
            const base = parseFloat(style.fontSize);
            // 量文字本身：不依赖 width: max-content，老 WebView 上也拿得到真实宽度。
            const range = document.createRange();
            range.selectNodeContents(element);
            const needed = range.getBoundingClientRect().width;
            const laneRoom = element.clientWidth - padding;
            if (laneRoom <= 0 || needed <= laneRoom) return;
            // 留 1px 余量：clientWidth 是取整后的值，贴着量会差出零点几个像素。
            const size = Math.max(minBubbleFontPx, base * (laneRoom - 1) / needed);
            element.style.fontSize = size.toFixed(2) + "px";
            if (size > minBubbleFontPx) return;
            // 停在下限：泡泡比一列宽，先松开列宽限制，再按实测宽度决定要不要继续缩。
            element.style.maxWidth = "none";
            const fieldRoom = field.clientWidth - 2;
            let width = element.offsetWidth;
            if (width > fieldRoom) {
                element.style.fontSize = (size * fieldRoom / width).toFixed(2) + "px";
                width = element.offsetWidth;
            }
            // 居中定位：把泡泡整体拨回场地内，越出边界的部分会被 .game-field 裁掉。
            const half = width / 2;
            const center = field.clientWidth * (lane + 0.5) / gameConfig.lanes;
            const shifted = Math.min(Math.max(center, half), field.clientWidth - half);
            if (shifted !== center) element.style.left = shifted.toFixed(2) + "px";
        };
        fit();
        const field = box.current?.parentElement;
        if (!field || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(fit);
        observer.observe(field);
        return () => observer.disconnect();
    }, [box, laneLeft]);
}

/** 一个漂上来的泡泡：位置每帧由引擎写进 --h，这里只管把词铺成一行。 */
function GameBubble({lane, height, word}: {lane: number; height: number; word: string}) {
    const box = useRef<HTMLDivElement>(null);
    useBubbleFit(box, lane);
    const style = {
        left: ((lane + 0.5) / gameConfig.lanes * 100) + "%",
        "--lane-w": `calc(${100 / gameConfig.lanes}% - 8px)`,
        "--h": Math.min(height, 1),
    } as CSSProperties;
    return (
        <div ref={box} className={"game-bubble game-lane-" + lane % 5} style={style} lang="ja" translate="no">
            {word}
        </div>
    );
}

/** 一局的画面：纯渲染，所有操作经 onPick / onTogglePause 交回游戏循环。 */
export function GameBoard({state, words, texts, paused, onPick, onTogglePause}: {
    state: RoundState;
    words: ReadonlyMap<string, GameWord>;
    texts: TranslationCatalog;
    paused: boolean;
    onPick: (slot: number) => void;
    onTogglePause: () => void;
}) {
    const t = useUi();
    const multiplier = comboMultiplier(state.combo);
    const chipsDisabled = state.status !== "playing" || paused;
    const teaching = state.status === "teaching" ? state.teaching : undefined;
    const teachingWord = teaching ? words.get(teaching.wordId) : undefined;
    return (
        <div className="game-board">
            <div className="game-hud">
                <span className="game-hearts" role="img" aria-label={t("ui.gameHearts", {count: state.hearts})}>
                    {Array.from({length: gameConfig.hearts}, (_, index) => (
                        <span key={index} className={index < state.hearts ? "game-heart" : "game-heart is-lost"} aria-hidden="true">
                            {index < state.hearts ? "♥" : "♡"}
                        </span>
                    ))}
                </span>
                <span className="game-progress">{state.cleared.length} / {state.words.length}</span>
                <span className="game-score">{t("ui.gameScore", {score: state.score})}</span>
                {multiplier > 1 && (
                    <span className="game-combo" aria-label={t("ui.gameCombo", {count: state.combo})}>
                        ×{multiplier}<small>{state.combo}</small>
                    </span>
                )}
                <button type="button" className="game-pause" onClick={onTogglePause}>
                    {t(paused ? "ui.gameResume" : "ui.gamePause")}
                </button>
            </div>
            <div className="game-field">
                <div className="game-topline" aria-hidden="true"/>
                {state.bubbles.map(bubble => {
                    const word = words.get(bubble.wordId);
                    if (!word) return null;
                    return <GameBubble key={bubble.key} lane={bubble.lane} height={bubble.height} word={word.word}/>;
                })}
                {teaching && teachingWord && (
                    <div className="game-teaching" role="status">
                        <span className="game-teaching-reason">
                            {t(teaching.reason === "wrong" ? "ui.gameWrong" : "ui.gameEscaped")}
                        </span>
                        <strong className="game-teaching-word" lang="ja" translate="no">{teachingWord.word}</strong>
                        <span className="game-teaching-reading" lang="ja" translate="no">{teachingWord.reading}</span>
                        <span className="game-teaching-meaning">
                            <TranslatedText id={teachingWord.meaningId} catalog={texts}/>
                        </span>
                    </div>
                )}
                {paused && (
                    <div className="game-paused" role="status">
                        <strong>{t("ui.gamePaused")}</strong>
                        <button type="button" className="primary-button" onClick={onTogglePause}>{t("ui.gameResume")}</button>
                    </div>
                )}
            </div>
            <div className="game-chips">
                {Array.from({length: gameConfig.chipSlots}, (_, slot) => {
                    const chip = state.chips[slot] ?? null;
                    const word = chip ? words.get(chip.wordId) : undefined;
                    return (
                        <button key={chip?.key ?? "empty-" + slot} type="button" className="game-chip"
                                disabled={chipsDisabled || !chip || !word}
                                onClick={() => onPick(slot)}>
                            <span className="game-chip-key" aria-hidden="true">{slot + 1}</span>
                            {word && <TranslatedText id={word.meaningId} catalog={texts}/>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}