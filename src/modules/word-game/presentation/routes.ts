/** 关卡列表；传 stage（从 1 开始）时直接进这一关。 */
export const gameHref = (lessonId: string, stage?: number): string =>
    "./?game=" + encodeURIComponent(lessonId) + (stage === undefined ? "" : "&stage=" + stage);

/** 回这一课的单词页签。 */
export const gameLessonHref = (lessonId: string): string =>
    "./?unit=" + encodeURIComponent(lessonId) + "&view=words";