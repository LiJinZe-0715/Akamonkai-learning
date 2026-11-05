import type {Dialogue} from "../../../shared/kernel/sentence";

export interface SpeechLine {
    text: string;
    role?: string;
    lessonId?: string;
}

/**
 * 朗读文本：只把振假名标记换成假名，其余原样。
 *
 * 标点、括号、引号都留给引擎——停顿和语气由它按文本自己决定。我们不再切段、不再
 * 剥段尾标点、也不再自己补静音：这些「比引擎更懂」的定制都是听感问题的来源。
 */
export function spokenText(text: string): string {
    return text.replace(/\[([^:\]]+):([^\]]+)\]/g, "$2").trim();
}

/**
 * 一条 utterance 的字数上限。
 *
 * 本地神经引擎（VOICEVOX 这类）合成是 CPU 密集的：40 字约 3.5 秒、120 字约 14 秒，
 * 整篇一次送会等几十秒才有结尾。100 字既能早点开口，又和引擎内部的 100 字切分对齐，
 * 不会切出它又得再拼的碎片。标点仍然交给引擎。
 */
export const utteranceCharLimit = 100;

/**
 * 把一段文本切成不超过上限的几条，切点优先落在句末，其次顿号逗号，最后才硬切。
 * 不删任何字符：标点留在原来的位置，停顿依旧由引擎按标点自己给。
 */
export function splitLongText(text: string, limit = utteranceCharLimit): string[] {
    const parts: string[] = [];
    let rest = text.trim();
    while (rest.length > limit) {
        const head = rest.slice(0, limit);
        const sentence = Math.max(head.lastIndexOf("。"), head.lastIndexOf("！"), head.lastIndexOf("？"));
        const clause = Math.max(head.lastIndexOf("、"), head.lastIndexOf("，"));
        const cut = sentence >= 0 ? sentence : clause >= limit / 2 ? clause : limit - 1;
        parts.push(rest.slice(0, cut + 1));
        rest = rest.slice(cut + 1).trim();
    }
    if (rest) parts.push(rest);
    return parts;
}

/**
 * 按句切开：一条 utterance 只放一句。
 *
 * 句末是 。！？（含半角 !?），紧跟在后面的右括号、右引号算在这一句里（「…。」 不能把 」
 * 甩给下一句）。标点一个不删，停顿仍由引擎按标点给。句与句之间的空白由播放端的
 * 流水线消掉——读这一句时，下一句已经在合成了。
 */
export function splitSentences(text: string): string[] {
    const sentences: string[] = [];
    let current = "", depth = 0;
    const close = (last = false) => {
        const sentence = current.trim();
        if (!sentence) return;
        // 只有标点、没有可读的字：并进前一句；开头就是标点时留着并进后一句。
        // 单独送给引擎的话，有的引擎会一声不吭地吞掉它。
        if (!/[\p{L}\p{N}]/u.test(sentence)) {
            if (sentences.length) sentences[sentences.length - 1] += sentence;
            else if (!last) return;
            else sentences.push(sentence);
        } else sentences.push(sentence);
        current = "";
    };
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        current += char;
        if (openers.includes(char)) depth++;
        else if (closers.includes(char)) depth = Math.max(0, depth - 1);
        // 括号、引号里面的句号不算句末：「行きます。」と言った。 是一句，不能把「と言った」甩出去单读。
        else if (depth === 0 && terminators.includes(char)) {
            while (index + 1 < text.length && (terminators.includes(text[index + 1]) || closers.includes(text[index + 1])))
                current += text[++index];
            close();
        }
    }
    close(true);
    return sentences;
}

const terminators = "。！？!?";
const openers = "「『（(【〈《“‘";
const closers = "」』）)】〉》”’";

/**
 * 一段文本变成要交给引擎的若干条：先按句切，句子本身太长再按字数上限切。
 */
export function speechChunks(text: string): string[] {
    return splitSentences(text).flatMap(sentence => splitLongText(sentence));
}

/**
 * 把连续的行并成尽量少的几段。
 *
 * 原文的行是排版折断的，不是句子边界：先按行并起来，再由 speechChunks 按真正的句末切开，
 * 一句跨两行时才不会被读成两截。
 *
 * 不同角色要换声音，所以在角色或教材变化处断开；字数预算只是防止一段无限长。
 */
export function chunkLines(lines: readonly SpeechLine[], budget = 800): SpeechLine[] {
    const chunks: SpeechLine[] = [];
    let current: SpeechLine | undefined;
    for (const line of lines) {
        const text = line.text.trim();
        if (!text) continue;
        if (current && (current.role !== line.role || current.lessonId !== line.lessonId)) {
            chunks.push(current);
            current = undefined;
        }
        if (!current) current = {...line, text};
        else if (current.text.length + text.length > budget) {
            chunks.push(current);
            current = {...line, text};
        }
        // 原文的行是排版折断的，不是句子边界。补一个「。」，读出来就是凭空多一句的
        // 停顿——正是「挤成两行时两行之间卡一下」的那个 bug。所以直接接上。
        else current.text += text;
    }
    if (current) chunks.push(current);
    return chunks;
}

/**
 * 一段 Dialogue 变成朗读行：直接读结构化的 lines，不再用正则从原文里猜角色。
 * 角色原样保留，roleVoiceKey 会按它分配音色。
 */
export function dialogueLines(dialogue: Dialogue, lessonId?: string): SpeechLine[] {
    return dialogue.lines.map(line => ({
        text: line.sentences.map(sentence => sentence.text).join(""),
        role: line.role,
        lessonId,
    }));
}