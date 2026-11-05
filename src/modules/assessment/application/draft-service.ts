import {captureDraft, type DraftState, prepareDraft, restoreDraft} from "../domain/draft";
import type {Question} from "../domain/question";
import type {DraftUseCases} from "./contracts";
import type {DraftRepository} from "./ports";

export class DraftService implements DraftUseCases {
    private prepared?: {source: readonly Question[]; questions: readonly Question[]; value: ReturnType<typeof prepareDraft>};

    constructor(private readonly repository: DraftRepository) {
    }

    restore(key: string, source: readonly Question[]) {
        return restoreDraft(source, this.repository.read(key));
    }

    save(key: string, source: readonly Question[], state: DraftState) {
        if (this.prepared?.source !== source || this.prepared.questions !== state.questions)
            this.prepared = {source, questions: state.questions, value: prepareDraft(source, state.questions)};
        return this.repository.write(key, captureDraft(source, state, this.prepared.value));
    }

    clear(key: string) {
        return this.repository.remove(key);
    }

    clearAll() {
        return this.repository.removeAll();
    }
}
