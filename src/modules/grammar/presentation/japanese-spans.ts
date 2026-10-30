/** Ranges of `text` that are Japanese, found by script rather than by 「」. */

const WORD = /[\u3040-\u30ff\u4e00-\u9fff\u3005\u30fc\u301c\uff5e／]/;
const KANJI = /[\u4e00-\u9fff\u3005]/;
const KANA = /[\u3040-\u30ff\u30fc]/;
/** Anything that can sit between two terms: punctuation, quotes, brackets, space. */
const BREAK = /[\s、。，．,.：:；;！!？?｜|／\/（）()「」『』“”"…—―]/;
/** Where a headword may start: the beginning of the paragraph or of a sentence.
 *  A ｜ label like 第一段｜人物介绍 must not count, or 人物介绍 becomes a headword. */
const SENTENCE_START = /^[。；;！!？?]/;

export interface Span {
    start: number;
    end: number;
    /** A headword written in kanji only — the same characters exist in Chinese,
     *  so it gets emphasis rather than the Japanese colour. */
    head: boolean;
}

/**
 * Glossary and summary paragraphs are written as plain prose with Japanese mixed
 * in, so the only usable signal is the script itself. Kanji are shared with
 * Chinese, which is what makes this fiddly:
 *
 * - a run of Japanese characters only counts when it contains kana;
 * - a run that starts in the middle of Chinese (`…重点是つまり如何…`) has to be
 *   trimmed on the left, or 是 would be coloured as Japanese;
 * - a run that ends in Chinese has to be trimmed on the right, unless a colon
 *   follows — that is the `見出し：释义` shape, where the headword really can end
 *   in kanji (`インスタント食品：…`).
 */
export function japaneseSpans(text: string): Span[] {
    const spans: Span[] = [];
    let i = 0;
    while (i < text.length) {
        if (!WORD.test(text[i])) {
            i += 1;
            continue;
        }
        let start = i;
        while (i < text.length && WORD.test(text[i])) i += 1;
        const stop = i;
        const headword = text[stop] === "：" || text[stop] === ":";
        const opensSentence = start === 0 || SENTENCE_START.test(text[start - 1]);

        if (!KANA.test(text.slice(start, stop))) {
            // No kana at all: it can still be a headword, but only a short one at
            // the head of a sentence — otherwise 康复中心在做什么 passes for Japanese.
            if (headword && opensSentence && stop - start <= 6) spans.push({start, end: stop, head: true});
            continue;
        }

        // Kanji in front of the first kana belong to the Chinese sentence unless
        // the run opens a sentence and the kanji are a word's worth (本気で, 行ったら).
        if (start > 0 && !BREAK.test(text[start - 1])) {
            while (start < stop && !KANA.test(text[start])) start += 1;
        } else {
            let kanji = 0;
            while (start + kanji < stop && KANJI.test(text[start + kanji])) kanji += 1;
            if (kanji > 2) start += kanji;
        }
        let end = stop;
        if (!headword) {
            while (end > start && !KANA.test(text[end - 1])) end -= 1;
        }
        // A lone particle in Chinese prose is noise, not a Japanese word.
        if (end - start > 1) spans.push({start, end, head: false});
    }
    return spans;
}
