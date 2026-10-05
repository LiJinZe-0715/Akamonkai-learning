import type { GrammarUseCases } from "./contracts";
import type { Article } from "../domain/article";
export class GrammarService implements GrammarUseCases {
  contents(articles: readonly Article[]) {
    return articles.map((a) => ({ id: a.id, titleJa: a.titleJa }));
  }
}
