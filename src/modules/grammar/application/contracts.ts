import type {Grammar} from "../domain/grammar";

export interface GrammarUseCases {
    /** 文法页的目录：按教材顺序，含下级条目。 */
    contents(grammars: readonly Grammar[]): { id: string; title: string }[];
}
