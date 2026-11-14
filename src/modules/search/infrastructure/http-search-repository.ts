import type {SearchRepository} from "../application/ports";
import {decodeSearchIndex, type SearchIndex} from "../domain/search-index";
import {type JsonReader, readJson} from "../../../shared/infrastructure/http-json";

export class HttpSearchRepository implements SearchRepository {
    private pending?: Promise<SearchIndex>;

    constructor(private readonly read: JsonReader = readJson) {
    }

    index() {
        return this.pending ??= this.read("/content/search.json").then(decodeSearchIndex).catch(error => {
            this.pending = undefined;
            throw error;
        });
    }
}
