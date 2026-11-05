import type {SearchHit, SearchIndex} from "../domain/search-index";

export interface SearchUseCases {
    /** 打开搜索页时调用；索引只请求一次。 */
    load(): Promise<SearchIndex>;

    search(index: SearchIndex, query: string): SearchHit[];
}
