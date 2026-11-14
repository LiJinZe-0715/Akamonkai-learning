import type {TextId} from "../../../shared/kernel/text-types";
import type {Dialogue} from "../../../shared/kernel/sentence";
import type {Kanji} from "./kanji";
import type {Word} from "../../vocabulary/public";
import type {Article} from "../../reading/public";
import type {Grammar} from "../../grammar/public";
import type {Question} from "../../assessment/public";

/**
 * 一课的模块。每种模块都可选，没有的不写，但至少要有一种。
 * 页面按固定顺序显示：文章 → 会话 → 文法 → 词汇 → 汉字，有题目时最后加测验。
 */
export interface LessonModules {
    /** 汉字模块。 */
    readonly kanji?: KanjiModule;
    /** 单词模块。 */
    readonly words?: WordModule;
    /** 文章模块。 */
    readonly articles?: ArticleModule;
    /** 对话模块。 */
    readonly dialogues?: DialogueModule;
    /** 文法模块。 */
    readonly grammar?: GrammarModule;
}

/** 汉字模块：这一课学的汉字。 */
export interface KanjiModule {
    /** 类型标记，固定为 "kanji-module"。 */
    readonly kind: "kanji-module";
    /** 这个模块的说明，比如教材里的练习要求。 */
    readonly instructionId?: TextId;
    /** 模块里的汉字，按教材顺序排列，至少一个。 */
    readonly items: readonly Kanji[];
}

/** 单词模块：这一课的生词。 */
export interface WordModule {
    /** 类型标记，固定为 "word-module"。 */
    readonly kind: "word-module";
    /** 这个模块的说明，比如教材里的练习要求。 */
    readonly instructionId?: TextId;
    /** 模块里的单词，按教材顺序排列，至少一个。 */
    readonly items: readonly Word[];
}

/** 文章模块：这一课的本文。 */
export interface ArticleModule {
    /** 类型标记，固定为 "article-module"。 */
    readonly kind: "article-module";
    /** 这个模块的说明，比如教材里的练习要求。 */
    readonly instructionId?: TextId;
    /** 模块里的文章，按教材顺序排列，至少一篇。 */
    readonly items: readonly Article[];
}

/** 对话模块：这一课的会话。 */
export interface DialogueModule {
    /** 类型标记，固定为 "dialogue-module"。 */
    readonly kind: "dialogue-module";
    /** 这个模块的说明，比如教材里的练习要求。 */
    readonly instructionId?: TextId;
    /** 模块里的对话，按教材顺序排列，至少一段。 */
    readonly items: readonly Dialogue[];
}

/** 文法模块：这一课的文法条目。 */
export interface GrammarModule {
    /** 类型标记，固定为 "grammar-module"。 */
    readonly kind: "grammar-module";
    /** 这个模块的说明，比如教材里的练习要求。 */
    readonly instructionId?: TextId;
    /** 模块里的文法条目，按教材顺序排列，至少一条。 */
    readonly items: readonly Grammar[];
}

/** 模块对应的页签，顺序固定；测验出题也按这个顺序分块。 */
export const moduleOrder = ["articles", "dialogues", "grammar", "words", "kanji"] as const;
export type ModuleKey = (typeof moduleOrder)[number];

/** 测验里的一块：同一模块下挂着的题目，保持教材顺序。 */
export interface LessonQuestionSection {
    readonly module: ModuleKey;
    readonly questions: readonly Question[];
}

/**
 * 页签：模块顺序 + 末尾可选的测验。
 *
 * 由 moduleOrder 派生，不另写一份字面量：加模块时 View 自动跟上，
 * 不会出现「改了顺序表、View 没改，页签静默消失」的情况。
 */
export const viewOrder = [...moduleOrder, "quiz"] as const;
export type View = (typeof viewOrder)[number];

/** 按模块顺序分块收集这一课条目下面挂的固定题，不打乱；没有题目的模块不成块。 */
export function lessonQuestionSections(modules: LessonModules): readonly LessonQuestionSection[] {
    const sections: LessonQuestionSection[] = [];
    const collect = (items: readonly {questions: readonly Question[]}[], into: Question[]) => {
        for (const item of items) into.push(...item.questions);
    };
    const collectGrammar = (items: readonly Grammar[], into: Question[]) => {
        for (const item of items) {
            collect([item], into);
            collectGrammar(item.children, into);
        }
    };
    for (const key of moduleOrder) {
        const module = modules[key];
        if (!module) continue;
        const questions: Question[] = [];
        // 用 kind 判别而不是把 key 断言成模块类型：key 与 kind 的对应由类型系统保证。
        switch (module.kind) {
            case "kanji-module":
                // 汉字的题目挂在例词下面，不在汉字本身。
                for (const kanji of module.items) collect(kanji.words, questions);
                break;
            case "grammar-module":
                collectGrammar(module.items, questions);
                break;
            default:
                collect(module.items, questions);
        }
        if (questions.length) sections.push({module: key, questions});
    }
    return sections;
}

/** 按模块顺序收集这一课所有条目下面挂的题目，不打乱。 */
export function lessonQuestions(modules: LessonModules): readonly Question[] {
    return lessonQuestionSections(modules).flatMap(section => section.questions);
}

/** 这一课能用来出单词题的全部词：词表模块 + 汉字例词，保持教材顺序。 */
export function lessonWords(modules: LessonModules): readonly Word[] {
    const words: Word[] = [];
    if (modules.words) words.push(...modules.words.items);
    if (modules.kanji) for (const kanji of modules.kanji.items) words.push(...kanji.words);
    return words;
}

/** 由模块推导页签：有哪个模块就显示哪个，有题目时最后加测验。 */
export function lessonViews(modules: LessonModules): View[] {
    const views: View[] = moduleOrder.filter((key) => modules[key] !== undefined);
    return lessonQuestions(modules).length ? [...views, "quiz"] : views;
}
