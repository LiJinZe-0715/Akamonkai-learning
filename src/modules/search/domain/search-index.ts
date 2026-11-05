/** 检索条目类型：文法条目、例句、本文句子、单词、汉字、会话台词。 */
export type SearchKind = "grammar" | "example" | "passage" | "word" | "kanji" | "dialogue";

export interface SearchUnit {
    id: string;
    bookId: string;
    bookTitle: string;
    title: string;
    group: string;
    /** 这一课由模块推导出的页签；结果跳转要落到一个真实存在的页签上。 */
    views: string[];
}

export interface SearchEntry {
    /** units 数组下标。 */
    unit: number;
    kind: SearchKind;
    ja: string;
    zh: string;
}

export interface SearchIndex {
    units: SearchUnit[];
    entries: SearchEntry[];
}

export interface SearchHit {
    unit: SearchUnit;
    kind: SearchKind;
    ja: string;
    zh: string;
    /** 跳转用的页签，已经按课实际开放的页签挑过。 */
    view: string;
    score: number;
}

const kinds: readonly SearchKind[] = ["grammar", "example", "passage", "word", "kanji", "dialogue"];
const isKind = (value: unknown): value is SearchKind => typeof value === "string" && kinds.some(kind => kind === value);

/**
 * 解码构建期生成的索引。
 *
 * 索引是构建产物，不是用户输入，但它跟源码不同步时（旧包配新前端）会静默搜不到东西，
 * 所以结构不对就整份拒绝，让页面显示「加载失败」而不是一个永远空的结果页。
 */
export function decodeSearchIndex(value: unknown): SearchIndex {
    if (!value || typeof value !== "object") throw new Error("Invalid search index");
    const source = value as { schemaVersion?: unknown; units?: unknown; entries?: unknown };
    if (source.schemaVersion !== 1) throw new Error("Unsupported search index schema");
    if (!Array.isArray(source.units) || !Array.isArray(source.entries)) throw new Error("Invalid search index");
    const units = source.units.map((unit, index) => {
        if (!Array.isArray(unit) || unit.length !== 6) throw new Error("Invalid search unit " + index);
        const [id, bookId, bookTitle, title, group, views] = unit;
        if (![id, bookId, bookTitle, title, group].every(field => typeof field === "string"))
            throw new Error("Invalid search unit " + index);
        if (!Array.isArray(views) || !views.every(view => typeof view === "string")) throw new Error("Invalid search unit " + index);
        return {id, bookId, bookTitle, title, group, views: [...views]};
    });
    const entries = source.entries.map((entry, index) => {
        if (!Array.isArray(entry) || entry.length !== 4) throw new Error("Invalid search entry " + index);
        const [unit, kind, ja, zh] = entry;
        if (!Number.isInteger(unit) || !units[unit]) throw new Error("Invalid search entry " + index);
        if (!isKind(kind) || typeof ja !== "string" || typeof zh !== "string") throw new Error("Invalid search entry " + index);
        return {unit, kind, ja, zh};
    });
    return {units, entries};
}

/** 检索结果落到哪个页签：优先该条目所在的模块，否则退到这一课的第一个页签。 */
export function viewForEntry(entry: Pick<SearchEntry, "kind">, unit: Pick<SearchUnit, "views">): string {
    const views = unit.views;
    const pick = (...preferred: string[]) => preferred.find(view => views.includes(view)) ?? views[0];
    switch (entry.kind) {
        case "word":
            return pick("words");
        case "kanji":
            return pick("kanji");
        case "passage":
            return pick("articles");
        case "dialogue":
            return pick("dialogues", "articles");
        case "grammar":
        case "example":
            return pick("grammar", "articles", "dialogues");
    }
    return pick();
}

/** 全角/半角、大小写都归一：中文输入法经常给出全角字母与标点。 */
const normalize = (value: string) => value.normalize("NFKC").toLowerCase();

/**
 * 空格分隔的多个词是「与」关系：每个词都要命中日文或中文，结果才保留。
 * 排序先按命中强度（完全相同 > 前缀 > 包含 > 仅中文），同分保持索引顺序（教材顺序）。
 */
export function searchIndex(index: SearchIndex, query: string, limit = 60): SearchHit[] {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const hits: SearchHit[] = [];
    for (const entry of index.entries) {
        const unit = index.units[entry.unit];
        if (!unit) continue;
        const ja = normalize(entry.ja);
        const zh = normalize(entry.zh);
        let score = 0;
        let matched = true;
        for (const term of terms) {
            if (ja === term) score += 100;
            else if (ja.startsWith(term)) score += 70;
            else if (ja.includes(term)) score += 50;
            else if (zh.includes(term)) score += 25;
            else {
                matched = false;
                break;
            }
        }
        if (!matched) continue;
        hits.push({unit, kind: entry.kind, ja: entry.ja, zh: entry.zh, view: viewForEntry(entry, unit), score});
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
}
