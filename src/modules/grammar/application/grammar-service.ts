import type {Article} from "../domain/article";

export function grammarContents(articles: readonly Article[]) {
    return articles.map((a) => ({id: a.id, titleJa: a.titleJa}));
}
