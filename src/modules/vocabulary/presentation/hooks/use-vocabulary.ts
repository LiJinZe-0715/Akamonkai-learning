import { useMemo, useState } from "react";
import type { LessonBundle } from "../../../curriculum/public";
import type { WordFilter } from "../../../learning-progress/public";
import { useStudy } from "../../../../presentation/context";
export function useVocabulary(lesson: LessonBundle) {
  const { services, locale, progress, markWord } = useStudy();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WordFilter>("all");
  const words = useMemo(() => services.wordStudy.search(lesson, progress, locale, query, filter), [services, lesson, progress, locale, query, filter]);
  return { progress, markWord, words, query, setQuery, filter, setFilter };
}
