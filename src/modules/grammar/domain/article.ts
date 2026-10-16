import type {TextId} from "../../../shared/kernel/text-types";

export interface Example {
    ja: string;
    translationId?: TextId;
    analysisId?: TextId;
    answerJa?: string;
}

export interface Article {
    id: string;
    titleJa: string;
    paragraphIds: TextId[];
    examples: Example[];
    children: Article[];
}
