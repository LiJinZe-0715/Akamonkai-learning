import type { Article } from "../public";
import { dialogueLines, sharedSpeakerRole, type SpeechLine } from "../../speech/public";
export interface ArticleViewModel extends Omit<Article, "examples" | "children"> {
  examples: (Article["examples"][number] & { lines: SpeechLine[] })[];
  children: ArticleViewModel[];
}
/** Precompute display dialogue once per example; continuous reading follows article order. */
export function grammarViewModel(articles: readonly Article[], lessonId: string): { articles: ArticleViewModel[]; lines: SpeechLine[]; roles: string[] } {
  const lines: SpeechLine[] = [];
  const mapArticle = (article: Article): ArticleViewModel => ({
    ...article,
    examples: article.examples.map(example => {
      const exampleLines = dialogueLines(example.ja, lessonId);
      lines.push(...exampleLines);
      return { ...example, lines: exampleLines };
    }),
    children: article.children.map(mapArticle),
  });
  const mapped = articles.map(mapArticle);
  return { articles: mapped, lines, roles: [...new Set([sharedSpeakerRole, ...lines.flatMap(line => line.role ? [line.role] : [])])] };
}
