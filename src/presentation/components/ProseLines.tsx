import type {TranslationCatalog} from "../../shared/kernel/text-types";
import {useLanguage, useServices} from "../StudyContext";

/** 句末换行，让拆解内容一条一行。 */
const sentenceEnd = /(?<=[。！？])|(?<=\.)\s+(?=[A-Z「（(])/u;

/**
 * 拆解和注释都是好几句连着写的。印成一整块会糊在一起，
 * 所以每句单独占一行。
 */
export function ProseLines({id, catalog}: { id: string; catalog: TranslationCatalog }) {
    const services = useServices();
    const {locale} = useLanguage();
    const lines = services.localization.text(catalog, id, locale)
        .split(sentenceEnd)
        .map(line => line.trim())
        .filter(Boolean);
    return <span lang={locale === "zh" ? "zh-CN" : "en"} data-content-id={id}>
        {lines.map((line, index) => <span className="prose-line" key={index}>{line}</span>)}
    </span>;
}
