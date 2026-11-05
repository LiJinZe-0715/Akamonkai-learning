import type {Article} from "../domain/article";

export interface ReadingUseCases {
    /** 整篇正文：各段各句按顺序直接拼起来，用于整篇显示与朗读。 */
    articleText(article: Article): string;
}
