import { useState } from "react";
import { useStudy, useUi } from "../context";
import type { SpeechLine } from "../../modules/speech/public";
export function ListenButton({ text, lines, role, lessonId, label }: { text: string; lines?: SpeechLine[]; role?: string; lessonId?: string; label?: string }) {
  const { services, setMessage } = useStudy();
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
          const ok = lines ? services.speech.play(lines, done) : services.speech.speak(text, done, { role, lessonId });
          setPlaying(ok);
          if (!ok) setMessage("ui.speechUnavailable");
        }
      }}
    >
      {playing ? "■" : "♪"} <span>{playing ? t("ui.stop") : label ?? t("ui.speak")}</span>
    </button>
  );
}
