import {useState} from "react";
import {useServices, useFeedback, useUi} from "../StudyContext";
import type {SpeechLine} from "../../modules/speech/public";

export function ListenButton({text, lines, role, lessonId, label, join}: {
    text: string;
    lines?: SpeechLine[];
    role?: string;
    lessonId?: string;
    label?: string;
    /** 把 `lines` 当成一整段文本连读，而不是每行一句。 */
    join?: boolean;
}) {
    const services = useServices();
    const {setNotice} = useFeedback();
    const t = useUi();
    const [playing, setPlaying] = useState(false);
    return (
        <button
            className="icon-button"
            aria-label={t(playing ? "ui.stop" : "ui.speak") + " " + text}
            onClick={() => {
                if (playing) {
                    services.speech.stop();
                    setPlaying(false);
                } else {
                    const done = () => setPlaying(false);
                    const started = lines ? services.speech.play(lines, done, {join}) : services.speech.speak(text, done, {
                        role,
                        lessonId
                    });
                    setPlaying(started);
                    if (!started) setNotice("ui.speechUnavailable");
                }
            }}
        >
            {playing ? "■" : "♪"} <span>{playing ? t("ui.stop") : label ?? t("ui.speak")}</span>
        </button>
    );
}
