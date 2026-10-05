import { useEffect, useState } from "react";
import type { LessonBundle, Unit, View } from "../../public";
import { useStudy } from "../../../../presentation/context";
import { viewTitles } from "../data/views";
export function useLesson(unit: Unit, view: View) {
  const { services, rememberLesson } = useStudy();
  const [lesson, setLesson] = useState<LessonBundle | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    services.curriculum.lesson(unit.id, view).then(data => {
      if (current) { setLesson(data); setError(false); }
    }).catch(() => { if (current) setError(true); });
    document.title = unit.titleJa + "・" + viewTitles[view] + "｜赤門会日本語";
    return () => { current = false; };
  }, [services, unit.id, unit.titleJa, view, attempt]);
  useEffect(() => {
    if (lesson && !error) rememberLesson(unit.id, view);
  }, [lesson, error, rememberLesson, unit.id, view]);
  return { lesson, error, retry: () => { setError(false); setAttempt(n => n + 1); } };
}
