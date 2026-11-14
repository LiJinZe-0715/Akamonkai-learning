/**
 * JLPT 真题的数据模型。
 *
 * 顶层容器和教材的 Lesson 不一样：真题不是「课」，没有单词表、没有文法条目，
 * 卷面结构就是三块——言語知識 → 読解 → 聴解，顺序是卷面事实，写成三个固定字段。
 * 但题目本身与教材共用一套 Question（见 assessment 模块）：题干、选项、答案、
 * 答题解析的字段名和类型全站一致，判分也只有 isCorrect 一份。
 */
import type {ChoiceQuestion} from "../../assessment/public";

/** 真题的一道题：统一的选择题，外加卷面题号。题干配图按内容片段放在 prompt 里。 */
export type ExamQuestion = ChoiceQuestion & {
    /** 卷面题号。言語知識 1–51、読解 52–71、聴解重新从 1 编号。 */
    readonly number: number;
};

/** 言語知識的一个大题（問題1–9）：一句指示 + 若干题。 */
export interface ExamKnowledgeGroup {
    readonly id: string;
    /** 卷面大题号，如「問題1」。 */
    readonly label: string;
    /** 大题名，如「漢字の読み方」。 */
    readonly title: string;
    /** 印在大题标题下的答题指示，照抄卷面原文；与 instructionId（译文 id）是两回事。 */
    readonly instruction: string;
    readonly questions: readonly ExamQuestion[];
}

/** 読解的一篇文章。問題10(2) 这种编号写在 title 里。 */
export interface ExamPassage {
    readonly id: string;
    /**
     * 文章标题。卷面只印大题指示、没有独立标题时为空串：
     * 指示已存于 group.instruction，不能把它的截断副本塞进这里充标题。
     */
    readonly title: string;
    /** 正文，一段一个元素。 */
    readonly body: readonly string[];
    /** 整篇材料的图（情報検索那种整页广告）。 */
    readonly image?: string;
    readonly questions: readonly ExamQuestion[];
}

/** 読解的一个大题（問題10–14）：一句指示 + 若干篇文章。 */
export interface ExamReadingGroup {
    readonly id: string;
    readonly label: string;
    readonly title: string;
    readonly instruction: string;
    readonly passages: readonly ExamPassage[];
}

/** 聴解的一个大题（問題1–5）：整场共用一条音轨，题目按卷面顺序排。 */
export interface ExamListeningGroup {
    readonly id: string;
    readonly label: string;
    readonly title: string;
    /**
     * 答题指示。N2 的聴解指示是读出来的，卷面不一定印，
     * 所以这里可空；有印刷原文时才写。
     */
    readonly instruction?: string;
    readonly questions: readonly ExamQuestion[];
}

export interface ExamKnowledgeSection {
    readonly kind: "knowledge";
    readonly groups: readonly ExamKnowledgeGroup[];
}

export interface ExamReadingSection {
    readonly kind: "reading";
    readonly groups: readonly ExamReadingGroup[];
}

export interface ExamListeningSection {
    readonly kind: "listening";
    /** 整场考试的听力音频，相对站点根；原本无音源的卷为空串。 */
    readonly audio: string;
    readonly groups: readonly ExamListeningGroup[];
}

/** 一场考试。三块固定齐全，顺序即字段顺序。 */
export interface Exam {
    readonly schemaVersion: 1;
    readonly kind: "exam";
    readonly id: string;
    /** 所属教材（JLPT真题 / N2），用于书架归类。 */
    readonly bookId: string;
    readonly title: string;
    /** 考试等级，如 "N2"。与教材的书架分级 shelfLevel 不是一个概念。 */
    readonly examLevel: string;
    readonly knowledge: ExamKnowledgeSection;
    readonly reading: ExamReadingSection;
    readonly listening: ExamListeningSection;
}

/** 目录里的考试索引，编译期派生，源数据不写。 */
export interface ExamSummary {
    readonly id: string;
    readonly bookId: string;
    readonly title: string;
    readonly examLevel: string;
    readonly questionCount: number;
}

/** 全卷的题，按卷面顺序：言語知識 → 読解 → 聴解。顺序不从这里改。 */
export function examQuestions(exam: Exam): ExamQuestion[] {
    const questions: ExamQuestion[] = [];
    for (const group of exam.knowledge.groups) questions.push(...group.questions);
    for (const group of exam.reading.groups)
        for (const passage of group.passages) questions.push(...passage.questions);
    for (const group of exam.listening.groups) questions.push(...group.questions);
    return questions;
}

/**
 * 计入交卷条件与成绩的题目。
 *
 * 原本就没有音源的卷子（如 2024-12），聴解题只是卷面占位：选项全是「（音声）」，
 * 听不到就无从作答。排除它们，孩子才不必盲猜三十题，盲猜也不会进成绩。
 * 判定依据是数据里哪一节属于聴解（按题 id 取集合），不靠 id 的命名规则。
 */
export function examScoredQuestions(exam: Exam): ExamQuestion[] {
    const questions = examQuestions(exam);
    if (exam.listening.audio) return questions;
    const listeningIds = new Set(
        exam.listening.groups.flatMap(group => group.questions.map(question => question.id)));
    return questions.filter(question => !listeningIds.has(question.id));
}

/** 三大块。 */
export type ExamModule = "knowledge" | "reading" | "listening";

/**
 * 卷面上的一「小节」：翻页时的一页。
 *
 * 小节是模块与题目之间的一层分类，但**不另存一份数据**——它总是卷面上已有的
 * 一个对象：言語知識的一节是一个大题（問題1–9），読解的一节是一篇文章，
 * 聴解的一节是一个大题型（問題1–5）。三种落点由 `examSections()` 摊平成同一种形状，
 * 顺序就是数据里的数组顺序，页面不再自己拼。
 */
export interface ExamSection {
    /** 与页面内锚点同名，翻页条与深链都按它定位。 */
    readonly id: string;
    readonly module: ExamModule;
    /** 卷面大题号，如「問題1」。読解的文章沿用所属大题的号。 */
    readonly label: string;
    /** 小节名：大题名，読解是文章名；文章没有独立标题时为空串，由 label 充当名字。 */
    readonly title: string;
    /** 答題指示。読解的大题指示只挂在同组第一篇上，与卷面一致。 */
    readonly instruction?: string;
    /** 読解正文，一段一个元素。 */
    readonly body?: readonly string[];
    /** 読解整页材料的图。 */
    readonly image?: string;
    readonly questions: readonly ExamQuestion[];
}

/** 全卷的小节，按卷面顺序摊平。 */
export function examSections(exam: Exam): ExamSection[] {
    const sections: ExamSection[] = [];
    for (const group of exam.knowledge.groups)
        sections.push({
            id: group.id,
            module: "knowledge",
            label: group.label,
            title: group.title,
            instruction: group.instruction,
            questions: group.questions,
        });
    for (const group of exam.reading.groups)
        group.passages.forEach((passage, position) => sections.push({
            id: passage.id,
            module: "reading",
            label: group.label,
            title: passage.title,
            // 大题指示在卷面上只印一次：挂在第一篇，翻到同组后面的文章不重复。
            instruction: position === 0 ? group.instruction : undefined,
            body: passage.body,
            image: passage.image,
            questions: passage.questions,
        }));
    for (const group of exam.listening.groups)
        sections.push({
            id: group.id,
            module: "listening",
            label: group.label,
            title: group.title,
            instruction: group.instruction,
            questions: group.questions,
        });
    return sections;
}

/** 作答记录：题 id → 选项下标。 */
export type ExamAnswers = Readonly<Record<string, number>>;
