import {captureDraft, type DraftState, prepareDraft, restoreDraft} from "../domain/draft";
import type {Question} from "../domain/assessment";

export interface DraftRepository {
    read(key: string): unknown;

    write(key: string, value: unknown): boolean;

    remove(key: string): boolean;
}

export interface DraftUseCases {
    restore(key: string, source: readonly Question[], pageSize: number): DraftState | undefined;

    save(key: string, source: readonly Question[], state: DraftState): boolean;

    clear(key: string): boolean;
}

export class DraftService implements DraftUseCases {
    private prepared?: {source: readonly Question[]; questions: readonly Question[]; value: ReturnType<typeof prepareDraft>};

    constructor(private readonly repository: DraftRepository) {
    }

    restore(key: string, source: readonly Question[], pageSize: number) {
        return restoreDraft(source, this.repository.read(key), pageSize);
    }

    save(key: string, source: readonly Question[], state: DraftState) {
        if (this.prepared?.source !== source || this.prepared.questions !== state.questions)
            this.prepared = {source, questions: state.questions, value: prepareDraft(source, state.questions)};
        return this.repository.write(key, captureDraft(source, state, this.prepared.value));
    }

    clear(key: string) {
        return this.repository.remove(key);
    }
}
