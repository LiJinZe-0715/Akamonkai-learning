/**
 * 题干、选项里的一小段文字：
 * 要么是日语原文，要么引用一条译文（按界面语言显示中文或英文）。
 * 两个字段必须且只能有一个。
 */
export type Segment =
    | {
        /** 日语原文，原样显示。 */
        readonly japanese: string;
        /** 与 japanese 互斥，这一支里不能出现。 */
        readonly textId?: never;
    }
    | {
        /** 引用的译文 id，按界面语言显示。 */
        readonly textId: TextId;
        /** 与 textId 互斥，这一支里不能出现。 */
        readonly japanese?: never;
    };

/** 某一课用到的全部译文，按译文 id 索引。 */
export type TranslationCatalog = Readonly<Record<TextId, Translation>>;

/** 一条译文：同一个意思的中文和英文写法。 */
export interface Translation {
    /** 中文写法。 */
    readonly zh: string;
    /** 英文写法。 */
    readonly en: string;
}

/** 译文 id，对应 learning.json 里的一个键，写法见 docs/content-model.md 第 4.3 节。 */
export type TextId = string;

/** 界面语言。取值是 ISO 639-1 语言代码。 */
export type Locale = "zh" | "en";
