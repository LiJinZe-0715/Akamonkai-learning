import type {SearchUseCases} from "./contracts";
import type {SearchRepository} from "./ports";
import {type SearchHit, type SearchIndex, searchIndex} from "../domain/search-index";

export class SearchService implements SearchUseCases {
    constructor(private readonly repository: SearchRepository) {
    }

    load() {
        return this.repository.index();
    }

    search(index: SearchIndex, query: string): SearchHit[] {
        return searchIndex(index, query);
    }
}
