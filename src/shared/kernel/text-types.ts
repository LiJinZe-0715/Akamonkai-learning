/**
 * 题干、选项里的一小段内容：日语原文、一条译文、或一张图。
 * 三个字段必须且只能有一个。教材与真题共用这一套片段。
 */
export type Segment =
    | {
        /** 日语原文，原样显示。 */
        readonly japanese: string;
        readonly textId?: never;
        readonly image?: never;
    }
    | {
        /** 引用的译文 id，按界面语言显示（中文或英文）。 */
        readonly textId: TextId;
        readonly japanese?: never;
        readonly image?: never;
    }
    | {
        /** 图片路径，相对站点根。 */
        readonly image: string;
        readonly japanese?: never;
        readonly textId?: never;
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
