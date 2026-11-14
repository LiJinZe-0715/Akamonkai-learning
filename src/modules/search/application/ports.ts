import type {SearchIndex} from "../domain/search-index";

export interface SearchRepository {
    /** 首次调用发起请求，之后复用同一个 Promise；失败后下次重试。 */
    index(): Promise<SearchIndex>;
}
