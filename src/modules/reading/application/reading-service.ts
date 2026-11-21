import type {ReadingUseCases} from "./contracts";
import {articleText, type Article} from "../domain/article";

export class ReadingService implements ReadingUseCases {
    articleText(article: Article): string {
        return articleText(article);
    }
}
