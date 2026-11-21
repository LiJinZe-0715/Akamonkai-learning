import {useUi} from "../../../../presentation/StudyContext";

/** 三颗星：拿到的实心，没拿到的空心。关卡列表和结算页共用。 */
export function GameStars({count}: {count: number}) {
    const t = useUi();
    return (
        <span className="game-stars" role="img" aria-label={t("ui.gameStars", {count})}>
            {[0, 1, 2].map(index => (
                <span key={index} className={index < count ? "game-star is-on" : "game-star"} aria-hidden="true">
                    {index < count ? "★" : "☆"}
                </span>
            ))}
        </span>
    );
}