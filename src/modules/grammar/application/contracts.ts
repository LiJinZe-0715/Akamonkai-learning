import type { Article } from "../domain/article";
export interface GrammarUseCases { contents(articles: readonly Article[]): { id: string; titleJa: string }[]; }
