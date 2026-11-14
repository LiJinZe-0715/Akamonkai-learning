import {isLibraryLevel, isView, type Book, type Catalog, type LessonSummary, type View} from "../domain/catalog";
import type {Lesson} from "../application/contracts";
import type {ExamSummary} from "../../exam/public";

/** 模块 key -> kind，与 scripts/content-compiler.mjs 保持一致。 */
const moduleKinds: Readonly<Record<string, string>> = {
    kanji: "kanji-module",
    words: "word-module",
    articles: "article-module",
    dialogues: "dialogue-module",
    grammar: "grammar-module",
};

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error("Invalid curriculum data: " + message);
}

function expectObject(value: unknown, label: string): asserts value is Record<string, unknown> {
    assert(value && typeof value === "object" && !Array.isArray(value), `${label}: expected object`);
}

function expectText(value: unknown, label: string): asserts value is string {
    assert(typeof value === "string" && value.length > 0, `${label}: expected text`);
}

function expectList(value: unknown, label: string): asserts value is unknown[] {
    assert(Array.isArray(value), `${label}: expected list`);
}

/** id 是路径：小写英文、数字、-，点号只用来分层。 */
const pathId = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;
const bookIdPattern = /^[a-z0-9-]+$/;

function expectPathId(value: unknown, label: string): asserts value is string {
    assert(typeof value === "string" && pathId.test(value), `${label}: invalid ID ${String(value)}`);
}

function expectKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
    for (const key of Object.keys(value))
        assert(allowed.includes(key), `${label}: unexpected field ${key}`);
}

function expectKind(value: Record<string, unknown>, kind: string, label: string) {
    assert(value.kind === kind, `${label}: expected kind ${kind}`);
}

interface Context {
    translations: Record<string, unknown>;
    ids: Set<string>;
    label: string;
}

function expectTranslation(id: unknown, context: Context, label: string) {
    expectText(id, label);
    assert(Object.hasOwn(context.translations, id), `${label}: missing translation ${id}`);
}

function expectOptionalTranslation(value: unknown, context: Context, label: string) {
    if (value !== undefined) expectTranslation(value, context, label);
}

function expectOptionalText(value: unknown, label: string) {
    if (value !== undefined) expectText(value, label);
}

/** 音频只收站点内 media/ 下的 mp3：内容数据不写外部地址，也不留路径穿越的余地。 */
function expectAudio(value: unknown, label: string) {
    if (value === undefined) return;
    expectText(value, label);
    assert(/^media\/[a-z0-9./-]+\.mp3$/.test(value) && !value.includes(".."),
        `${label}: expected a site-relative mp3 under media/`);
}

function expectId(value: unknown, context: Context, label: string) {
    expectPathId(value, label);
    assert(!context.ids.has(value), `${label}: duplicate ID ${value}`);
    context.ids.add(value);
}

function expectSegments(value: unknown, context: Context, label: string) {
    expectList(value, label);
    assert(value.length > 0, `${label}: empty segments`);
    for (const [index, candidate] of value.entries()) {
        const at = `${label}[${index}]`;
        expectObject(candidate, at);
        expectKeys(candidate, ["japanese", "textId", "image"], at);
        const present = ["japanese", "textId", "image"].filter((field) => candidate[field] !== undefined);
        assert(present.length === 1, `${at}: segment needs exactly one of japanese / textId / image`);
        if (candidate.japanese !== undefined) expectText(candidate.japanese, at + ".japanese");
        else if (candidate.image !== undefined) expectText(candidate.image, at + ".image");
        else expectTranslation(candidate.textId, context, at + ".textId");
    }
}

function expectQuestions(value: unknown, context: Context, label: string) {
    expectList(value, label);
    for (const [index, candidate] of value.entries()) {
        const at = `${label}[${index}]`;
        expectObject(candidate, at);
        expectId(candidate.id, context, at + ".id");
        const kind = candidate.kind;
        assert(kind === "choice" || kind === "fill-in", `${at}: unknown question kind`);
        if (kind === "choice") {
            expectKeys(candidate, ["kind", "id", "prompt", "instructionId", "explanationId", "options", "answer"], at);
            expectSegments(candidate.prompt, context, at + ".prompt");
            expectOptionalTranslation(candidate.instructionId, context, at + ".instructionId");
            expectOptionalTranslation(candidate.explanationId, context, at + ".explanationId");
            expectList(candidate.options, at + ".options");
            const options = candidate.options;
            assert(options.length >= 2, `${at}: need at least two options`);
            options.forEach((option, position) => expectSegments(option, context, `${at}.options[${position}]`));
            expectList(candidate.answer, at + ".answer");
            const correct = candidate.answer;
            assert(correct.length > 0 && correct.every(index =>
                Number.isInteger(index) && (index as number) >= 0 && (index as number) < options.length),
            `${at}: invalid answer`);
        } else {
            expectKeys(candidate, ["kind", "id", "prompt", "instructionId", "explanationId", "requiredScript", "answer"], at);
            expectSegments(candidate.prompt, context, at + ".prompt");
            expectOptionalTranslation(candidate.instructionId, context, at + ".instructionId");
            expectOptionalTranslation(candidate.explanationId, context, at + ".explanationId");
            assert(candidate.requiredScript === "any-kana" || candidate.requiredScript === "katakana", `${at}: invalid requiredScript`);
            expectList(candidate.answer, at + ".answer");
            assert(candidate.answer.length > 0 && candidate.answer.every(answer =>
                typeof answer === "string" && answer.trim().length > 0), `${at}: invalid answer`);
        }
    }
}

function expectSentence(value: unknown, context: Context, label: string, withTranslation = true) {
    expectObject(value, label);
    expectKeys(value, ["kind", "text", "translationId", "analysisId"], label);
    expectKind(value, "sentence", label);
    expectText(value.text, label + ".text");
    if (withTranslation) expectOptionalTranslation(value.translationId, context, label + ".translationId");
    else assert(value.translationId === undefined, `${label}: dialogue lines carry their own translation`);
    expectOptionalTranslation(value.analysisId, context, label + ".analysisId");
}

/** 词性枚举，与 src/modules/vocabulary/domain/word.ts 的 PartOfSpeech 一一对应。 */
const partsOfSpeech = new Set([
    "noun", "verbal-noun", "verb", "i-adjective", "na-adjective", "adverb",
    "conjunction", "adnominal", "interjection", "prefix", "suffix", "counter",
    "expression", "other",
]);
const transitivityValues = new Set(["intransitive", "transitive", "both"]);
/** 只有这两类词能标自他。 */
const verbParts = new Set(["verb", "verbal-noun"]);

/** 词的解析字段：词性、自他、基本形、搭配骨架、近义辨析。形状对不上就整份拒收。 */
function expectWordAnalysis(candidate: Record<string, unknown>, context: Context, at: string) {
    if (candidate.lemma !== undefined) {
        expectText(candidate.lemma, at + ".lemma");
        assert(!/[～\s（）()。]/.test(candidate.lemma), `${at}.lemma: 基本形不带括号、波浪号、空格或句号`);
    }
    if (candidate.pos !== undefined) {
        assert(partsOfSpeech.has(candidate.pos as string), `${at}.pos: 词性不在枚举里`);
    }
    if (candidate.transitivity !== undefined) {
        assert(transitivityValues.has(candidate.transitivity as string), `${at}.transitivity: 取值不合法`);
        assert(verbParts.has(candidate.pos as string), `${at}.transitivity: 只有动词能标自他`);
    }
    if (candidate.patterns !== undefined) {
        expectList(candidate.patterns, at + ".patterns");
        const patterns = candidate.patterns;
        patterns.forEach((entry, position) => {
            const label = `${at}.patterns[${position}]`;
            expectObject(entry, label);
            expectKeys(entry, ["pattern", "usageId"], label);
            expectText(entry.pattern, label + ".pattern");
            assert(entry.pattern.split("<w>").length === 2, `${label}.pattern: 必须正好一个 <w>`);
            expectTranslation(entry.usageId, context, label + ".usageId");
        });
    }
    if (candidate.contrasts !== undefined) {
        expectList(candidate.contrasts, at + ".contrasts");
        const contrasts = candidate.contrasts;
        contrasts.forEach((entry, position) => {
            const label = `${at}.contrasts[${position}]`;
            expectObject(entry, label);
            expectKeys(entry, ["word", "glossId", "wordId", "differenceId"], label);
            expectText(entry.word, label + ".word");
            assert(entry.word !== candidate.word, `${label}.word: 不能拿本词做辨析对象`);
            expectTranslation(entry.glossId, context, label + ".glossId");
            if (entry.wordId !== undefined) expectPathId(entry.wordId, label + ".wordId");
            expectTranslation(entry.differenceId, context, label + ".differenceId");
        });
    }
}

function expectWords(value: unknown, context: Context, label: string) {
    expectList(value, label);
    for (const [index, candidate] of value.entries()) {
        const at = `${label}[${index}]`;
        expectObject(candidate, at);
        expectKeys(candidate, [
            "kind", "id", "word", "reading", "lemma", "pos", "transitivity",
            "meaningId", "noteIds", "patterns", "contrasts", "analysisId", "questions",
        ], at);
        expectKind(candidate, "word", at);
        expectId(candidate.id, context, at + ".id");
        expectText(candidate.word, at + ".word");
        expectText(candidate.reading, at + ".reading");
        expectOptionalText(candidate.lemma, at + ".lemma");
        expectTranslation(candidate.meaningId, context, at + ".meaningId");
        if (candidate.noteIds !== undefined) {
            expectList(candidate.noteIds, at + ".noteIds");
            candidate.noteIds.forEach((id, position) =>
                expectTranslation(id, context, `${at}.noteIds[${position}]`));
        }
        expectOptionalTranslation(candidate.analysisId, context, at + ".analysisId");
        expectWordAnalysis(candidate, context, at);
        expectQuestions(candidate.questions, context, at + ".questions");
    }
}

function expectKanji(value: unknown, context: Context, label: string) {
    expectList(value, label);
    for (const [index, candidate] of value.entries()) {
        const at = `${label}[${index}]`;
        expectObject(candidate, at);
        expectKeys(candidate, ["kind", "id", "character", "strokeCount", "meaningId", "onReadings", "kunReadings", "specialReadings", "words", "examples"], at);
        expectKind(candidate, "kanji", at);
        expectId(candidate.id, context, at + ".id");
        expectText(candidate.character, at + ".character");
        assert(/^\p{Script=Han}$/u.test(candidate.character), `${at}: character is not one kanji`);
        if (candidate.strokeCount !== undefined)
            assert(Number.isInteger(candidate.strokeCount) && (candidate.strokeCount as number) > 0, `${at}: invalid strokeCount`);
        expectOptionalTranslation(candidate.meaningId, context, at + ".meaningId");
        for (const field of ["onReadings", "kunReadings"]) {
            expectList(candidate[field], `${at}.${field}`);
            assert((candidate[field] as unknown[]).every(reading => typeof reading === "string"), `${at}.${field}: invalid reading`);
        }
        expectList(candidate.specialReadings, at + ".specialReadings");
        for (const reading of candidate.specialReadings) {
            expectObject(reading, at + ".specialReadings[]");
            expectKeys(reading, ["word", "reading"], at + ".specialReadings[]");
            expectText(reading.word, at + ".specialReadings[].word");
            expectText(reading.reading, at + ".specialReadings[].reading");
        }
        expectWords(candidate.words, context, at + ".words");
        expectList(candidate.examples, at + ".examples");
        candidate.examples.forEach((example, position) => expectSentence(example, context, `${at}.examples[${position}]`));
    }
}

function expectArticles(value: unknown, context: Context, label: string) {
    expectList(value, label);
    for (const [index, candidate] of value.entries()) {
        const at = `${label}[${index}]`;
        expectObject(candidate, at);
        expectKeys(candidate, ["kind", "id", "title", "audio", "introductionId", "paragraphs", "questions"], at);
        expectKind(candidate, "article", at);
        expectId(candidate.id, context, at + ".id");
        expectText(candidate.title, at + ".title");
        expectAudio(candidate.audio, at + ".audio");
        expectOptionalTranslation(candidate.introductionId, context, at + ".introductionId");
        expectList(candidate.paragraphs, at + ".paragraphs");
        assert(candidate.paragraphs.length > 0, `${at}: empty article`);
        for (const [position, paragraph] of candidate.paragraphs.entries()) {
            const pat = `${at}.paragraphs[${position}]`;
            expectObject(paragraph, pat);
            expectKeys(paragraph, ["kind", "id", "section", "group", "role", "sentences"], pat);
            expectKind(paragraph, "paragraph", pat);
            expectId(paragraph.id, context, pat + ".id");
            expectOptionalText(paragraph.section, pat + ".section");
            expectOptionalText(paragraph.group, pat + ".group");
            expectOptionalText(paragraph.role, pat + ".role");
            expectList(paragraph.sentences, pat + ".sentences");
            assert(paragraph.sentences.length > 0, `${pat}: empty paragraph`);
            paragraph.sentences.forEach((sentence, number) => expectSentence(sentence, context, `${pat}.sentences[${number}]`));
        }
        expectQuestions(candidate.questions, context, at + ".questions");
    }
}

function expectDialogueLines(value: unknown, context: Context, label: string) {
    expectList(value, label);
    assert(value.length >= 2, `${label}: a dialogue needs at least two lines`);
    for (const [index, candidate] of value.entries()) {
        const at = `${label}[${index}]`;
        expectObject(candidate, at);
        expectKeys(candidate, ["section", "group", "role", "translationId", "sentences"], at);
        expectOptionalText(candidate.section, at + ".section");
        expectOptionalText(candidate.group, at + ".group");
        expectText(candidate.role, at + ".role");
        expectOptionalTranslation(candidate.translationId, context, at + ".translationId");
        expectList(candidate.sentences, at + ".sentences");
        assert(candidate.sentences.length > 0, `${at}: empty line`);
        candidate.sentences.forEach((sentence, position) =>
            expectSentence(sentence, context, `${at}.sentences[${position}]`, false));
    }
}

function expectDialogue(value: unknown, context: Context, label: string) {
    expectObject(value, label);
    expectKeys(value, ["kind", "id", "title", "introductionId", "analysisId", "lines", "questions"], label);
    expectKind(value, "dialogue", label);
    expectId(value.id, context, label + ".id");
    expectOptionalText(value.title, label + ".title");
    expectOptionalTranslation(value.introductionId, context, label + ".introductionId");
    expectOptionalTranslation(value.analysisId, context, label + ".analysisId");
    expectDialogueLines(value.lines, context, label + ".lines");
    expectQuestions(value.questions, context, label + ".questions");
}

function expectGrammars(value: unknown, context: Context, label: string) {
    expectList(value, label);
    for (const [index, candidate] of value.entries()) {
        const at = `${label}[${index}]`;
        expectObject(candidate, at);
        expectKeys(candidate, ["kind", "id", "title", "formationId", "meaningId", "usageId", "pitfallId", "examples", "noteIds", "children", "questions"], at);
        expectKind(candidate, "grammar", at);
        expectId(candidate.id, context, at + ".id");
        expectText(candidate.title, at + ".title");
        for (const field of ["formationId", "meaningId", "usageId", "pitfallId"])
            expectOptionalTranslation(candidate[field], context, `${at}.${field}`);
        expectList(candidate.examples, at + ".examples");
        for (const [position, example] of candidate.examples.entries()) {
            expectObject(example, `${at}.examples[${position}]`);
            if (example.kind === "dialogue") expectDialogue(example, context, `${at}.examples[${position}]`);
            else expectSentence(example, context, `${at}.examples[${position}]`);
        }
        expectList(candidate.noteIds, at + ".noteIds");
        candidate.noteIds.forEach((id, position) => expectTranslation(id, context, `${at}.noteIds[${position}]`));
        expectGrammars(candidate.children, context, at + ".children");
        expectQuestions(candidate.questions, context, at + ".questions");
    }
}

function expectModules(value: unknown, context: Context) {
    expectObject(value, "modules");
    expectKeys(value, ["kanji", "words", "articles", "dialogues", "grammar"], "modules");
    const keys = Object.keys(value);
    assert(keys.length > 0, "modules: a lesson needs at least one module");
    for (const key of keys) {
        const kind = (moduleKinds as Record<string, string>)[key];
        assert(kind, `modules: unknown module ${key}`);
        const module = value[key];
        expectObject(module, "modules." + key);
        expectKeys(module, ["kind", "instructionId", "items"], "modules." + key);
        assert(module.kind === kind, `modules.${key}: wrong kind`);
        expectOptionalTranslation(module.instructionId, context, `modules.${key}.instructionId`);
        expectList(module.items, `modules.${key}.items`);
        assert(module.items.length > 0, `modules.${key}: empty module`);
        if (key === "kanji") expectKanji(module.items, context, "modules.kanji.items");
        else if (key === "words") expectWords(module.items, context, "modules.words.items");
        else if (key === "articles") expectArticles(module.items, context, "modules.articles.items");
        else if (key === "dialogues") {
            for (const [position, item] of module.items.entries())
                expectDialogue(item, context, `modules.dialogues.items[${position}]`);
        } else expectGrammars(module.items, context, "modules.grammar.items");
    }
}

export function decodeCatalog(value: unknown): Catalog {
    expectObject(value, "catalog");
    expectKeys(value, ["schemaVersion", "siteTitle", "books", "lessons", "exams"], "catalog");
    assert(value.schemaVersion === 1, "catalog: unsupported schema");
    expectText(value.siteTitle, "catalog.siteTitle");
    expectList(value.books, "catalog.books");
    expectList(value.lessons, "catalog.lessons");
    const bookIds = new Set<string>();
    const books: Book[] = value.books.map((candidate, index) => {
        const label = `catalog.books[${index}]`;
        expectObject(candidate, label);
        expectKeys(candidate, ["kind", "id", "title", "shelfLevel", "lessonIds", "examIds"], label);
        expectKind(candidate, "book", label);
        expectPathId(candidate.id, label + ".id");
        assert(bookIdPattern.test(candidate.id), `${label}: book id must not contain dots`);
        assert(!bookIds.has(candidate.id), `${label}: duplicate book ${candidate.id}`);
        bookIds.add(candidate.id);
        expectText(candidate.title, label + ".title");
        assert(isLibraryLevel(candidate.shelfLevel), `${label}: invalid library level`);
        // 教材书有课，真题书有考试；两者至少有一个，不能都不写。
        const lessonIds = candidate.lessonIds === undefined ? [] : candidate.lessonIds;
        const examIds = candidate.examIds === undefined ? [] : candidate.examIds;
        expectList(lessonIds, label + ".lessonIds");
        expectList(examIds, label + ".examIds");
        assert(lessonIds.length + examIds.length > 0, `${label}: book has no lessons or exams`);
        const seen = new Set<string>();
        for (const [position, id] of (lessonIds as string[]).entries()) {
            expectPathId(id, `${label}.lessonIds[${position}]`);
            assert(id.startsWith(candidate.id + "."), `${label}.lessonIds[${position}]: lesson belongs to another book`);
            assert(!seen.has(id), `${label}: duplicate lesson ${id}`);
            seen.add(id);
        }
        for (const [position, id] of (examIds as string[]).entries()) {
            expectPathId(id, `${label}.examIds[${position}]`);
            assert(id.startsWith(candidate.id + "."), `${label}.examIds[${position}]: exam belongs to another book`);
            assert(!seen.has(id), `${label}: duplicate entry ${id}`);
            seen.add(id);
        }
        return {
            kind: "book", id: candidate.id, title: candidate.title,
            shelfLevel: candidate.shelfLevel, lessonIds: lessonIds as string[],
            ...((examIds as string[]).length ? {examIds: examIds as string[]} : {}),
        } as Book;
    });
    const lessonIds = new Set<string>();
    const lessons: LessonSummary[] = value.lessons.map((candidate, index) => {
        const label = `catalog.lessons[${index}]`;
        expectObject(candidate, label);
        expectKeys(candidate, ["id", "bookId", "title", "group", "wordCount", "questionCount", "views"], label);
        expectPathId(candidate.id, label + ".id");
        assert(!lessonIds.has(candidate.id), `${label}: duplicate lesson ${candidate.id}`);
        lessonIds.add(candidate.id);
        expectPathId(candidate.bookId, label + ".bookId");
        assert(bookIds.has(candidate.bookId), `${label}: unknown book ${candidate.bookId}`);
        expectText(candidate.title, label + ".title");
        expectOptionalText(candidate.group, label + ".group");
        for (const field of ["wordCount", "questionCount"])
            assert(Number.isInteger(candidate[field]) && (candidate[field] as number) >= 0, `${label}: invalid ${field}`);
        expectList(candidate.views, label + ".views");
        assert(candidate.views.length > 0 && new Set(candidate.views).size === candidate.views.length
            && candidate.views.every(isView), `${label}: invalid views`);
        return {
            id: candidate.id, bookId: candidate.bookId, title: candidate.title,
            ...(candidate.group !== undefined ? {group: candidate.group as string} : {}),
            wordCount: candidate.wordCount as number, questionCount: candidate.questionCount as number,
            views: candidate.views as View[],
        };
    });
    for (const book of books)
        for (const id of book.lessonIds)
            assert(lessonIds.has(id), `catalog: missing lesson summary ${id}`);
    assert(lessons.length === books.reduce((sum, book) => sum + book.lessonIds.length, 0), "catalog: orphan lesson summary");

    const examIds = new Set<string>();
    const exams: ExamSummary[] = (value.exams === undefined ? [] : value.exams as unknown[]).map((candidate, index) => {
        const label = `catalog.exams[${index}]`;
        expectObject(candidate, label);
        expectKeys(candidate, ["id", "bookId", "title", "examLevel", "questionCount"], label);
        expectPathId(candidate.id, label + ".id");
        assert(!examIds.has(candidate.id), `${label}: duplicate exam ${candidate.id}`);
        examIds.add(candidate.id);
        expectPathId(candidate.bookId, label + ".bookId");
        assert(bookIds.has(candidate.bookId), `${label}: unknown book ${candidate.bookId}`);
        assert((candidate.id as string).startsWith(candidate.bookId + "."), `${label}: exam belongs to another book`);
        expectText(candidate.title, label + ".title");
        expectText(candidate.examLevel, label + ".examLevel");
        assert(Number.isInteger(candidate.questionCount) && (candidate.questionCount as number) > 0,
            `${label}: invalid questionCount`);
        return {
            id: candidate.id as string, bookId: candidate.bookId as string,
            title: candidate.title as string, examLevel: candidate.examLevel as string,
            questionCount: candidate.questionCount as number,
        };
    });
    for (const book of books)
        for (const id of book.examIds ?? [])
            assert(examIds.has(id), `catalog: missing exam summary ${id}`);
    assert(exams.length === books.reduce((sum, book) => sum + (book.examIds?.length ?? 0), 0),
        "catalog: orphan exam summary");
    return {schemaVersion: 1, siteTitle: value.siteTitle, books, lessons, exams};
}

export function decodeLesson(value: unknown, expectedId: string): Lesson {
    expectObject(value, "lesson");
    expectKeys(value, ["kind", "id", "bookId", "title", "modules", "texts", "wordQuiz"], "lesson");
    expectKind(value, "lesson", "lesson");
    if (value.wordQuiz !== undefined)
        assert(typeof value.wordQuiz === "boolean", "lesson: wordQuiz must be a boolean");
    expectPathId(value.id, "lesson.id");
    assert(value.id === expectedId, "lesson: identity mismatch");
    expectPathId(value.bookId, "lesson.bookId");
    assert(bookIdPattern.test(value.bookId), "lesson: bookId must not contain dots");
    assert(value.id.startsWith(value.bookId + "."), "lesson: id does not belong to bookId");
    expectText(value.title, "lesson.title");
    expectObject(value.texts, "lesson.texts");
    const translations = value.texts;
    for (const [id, entry] of Object.entries(translations)) {
        expectPathId(id, `lesson.texts key ${id}`);
        expectObject(entry, `lesson.texts[${id}]`);
        expectKeys(entry, ["zh", "en"], `lesson.texts[${id}]`);
        expectText(entry.zh, `lesson.texts[${id}].zh`);
        expectText(entry.en, `lesson.texts[${id}].en`);
    }
    const context: Context = {translations, ids: new Set<string>(), label: expectedId};
    expectModules(value.modules, context);
    // 每条译文都要有地方引用；编译器只收了被引用的译文。
    const referenced = new Set<string>();
    const scan = (item: unknown): void => {
        if (Array.isArray(item)) return item.forEach(scan);
        if (!item || typeof item !== "object") return;
        for (const [key, child] of Object.entries(item)) {
            if (key.endsWith("Id") && typeof child === "string" && Object.hasOwn(translations, child)) referenced.add(child);
            else if (key.endsWith("Ids") && Array.isArray(child))
                child.forEach(id => { if (typeof id === "string" && Object.hasOwn(translations, id)) referenced.add(id); });
            if (key !== "texts") scan(child);
        }
    };
    scan(value);
    for (const id of Object.keys(translations))
        assert(referenced.has(id), `lesson: orphan translation ${id}`);
    // 上面已按 Lesson 的形状逐层校验过；这一步只做深拷贝，断开与响应对象的引用关系。
    // 未出现在 expectKeys 里的嵌套字段会原样带出，但页面只读已知字段。
    // 双重断言在这里是必须的：value 已被 expectObject 收窄成 Record<string, unknown>，
    // 与 Lesson 没有重叠属性，单层 as 会被拒绝。
    return structuredClone(value) as unknown as Lesson;
}
