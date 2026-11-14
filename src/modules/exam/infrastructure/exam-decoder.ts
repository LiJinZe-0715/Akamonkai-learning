import type {
    Exam,
    ExamKnowledgeGroup,
    ExamListeningGroup,
    ExamPassage,
    ExamQuestion,
    ExamReadingGroup,
} from "../domain/exam";
import type {Segment} from "../../../shared/kernel/text-types";

/**
 * 真题数据的严格解码。
 *
 * 真题和教材各走一条读取口，但题目本身是同一套 Question：
 * 这里是产物的严格校验，编译期已把卷面形态归一成 Segment / answer 数组。
 * 不做「缺字段就凑合显示」，结构不对整份拒收——一份卷子错一处，做的人会一路错到底。
 */

const pathId = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;
const bookIdPattern = /^[a-z0-9-]+$/;
const groupLabel = /^問題\d+$/;

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error("Invalid exam data: " + message);
}

function expectObject(value: unknown, at: string): asserts value is Record<string, unknown> {
    assert(value && typeof value === "object" && !Array.isArray(value), at + ": expected object");
}

function expectText(value: unknown, at: string): asserts value is string {
    assert(typeof value === "string" && value.trim().length > 0, at + ": expected text");
}

/** 文章标题允许为空串：卷面没有独立标题时，小节名由大题号充当。 */
function expectOptionalText(value: unknown, at: string): asserts value is string {
    assert(typeof value === "string", at + ": expected string (may be empty)");
}

function expectList(value: unknown, at: string): asserts value is unknown[] {
    assert(Array.isArray(value), at + ": expected list");
    assert(value.length > 0, at + ": expected non-empty list");
}

function expectKeys(value: Record<string, unknown>, allowed: readonly string[], at: string) {
    for (const key of Object.keys(value)) assert(allowed.includes(key), `${at}: unexpected field ${key}`);
}

function expectId(value: unknown, at: string) {
    expectText(value, at);
    assert(pathId.test(value), at + ": invalid id");
}

/** 内容片段：日语原文或图片，恰好一个。真题不做多语言，不接受译文 id。 */
function expectSegments(value: unknown, at: string, allowEmpty = false): Segment[] {
    assert(Array.isArray(value), at + ": expected list");
    if (!allowEmpty) assert(value.length > 0, at + ": expected non-empty list");
    return value.map((candidate, index) => {
        const label = `${at}[${index}]`;
        expectObject(candidate, label);
        expectKeys(candidate, ["japanese", "image", "textId"], label);
        const present = ["japanese", "image", "textId"].filter(field => candidate[field] !== undefined);
        assert(present.length === 1, `${label}: 片段必须恰好是 japanese / image 之一`);
        assert(candidate.textId === undefined, `${label}: 真题不走译文目录`);
        if (candidate.japanese !== undefined) expectText(candidate.japanese, label + ".japanese");
        if (candidate.image !== undefined) expectText(candidate.image, label + ".image");
        return candidate.image !== undefined
            ? {image: candidate.image as string}
            : {japanese: candidate.japanese as string};
    });
}

/**
 * 选项：2–4 个，每个是一串内容片段。
 *
 * 言語知識・読解・聴解 問題1/2/3/5 都是四択，只有聴解 問題4（即時応答）是 3 択。
 * 卷面怎样就收怎样，不为凑格式补一个假选项。
 */
function expectOptions(value: unknown, at: string) {
    expectList(value, at);
    assert(value.length >= 2 && value.length <= 4,
        `${at}: 选择题选项必须是 2–4 个（实际 ${value.length}）`);
    return value.map((option, index) => expectSegments(option, `${at}[${index}]`));
}

function expectQuestion(value: unknown, at: string, ids: Set<string>): ExamQuestion {
    expectObject(value, at);
    expectKeys(value, ["kind", "id", "number", "prompt", "instructionId", "explanationId", "options", "answer"], at);
    assert(value.kind === "choice", at + ".kind: 真题只收选择题");
    expectId(value.id, at + ".id");
    const id = value.id as string;
    assert(!ids.has(id), `${at}: 题目 id 重复 ${id}`);
    ids.add(id);
    assert(typeof value.number === "number" && Number.isInteger(value.number) && value.number > 0,
        at + ".number: 卷面题号必须是正整数");
    // 音声题卷面不印题干，prompt 允许空数组；但类型仍必须是数组。
    const prompt = expectSegments(value.prompt, at + ".prompt", true);
    if (value.instructionId !== undefined) expectText(value.instructionId, at + ".instructionId");
    if (value.explanationId !== undefined) expectText(value.explanationId, at + ".explanationId");
    const options = expectOptions(value.options, at + ".options");
    const answer = value.answer;
    expectList(answer, at + ".answer");
    const index = answer[0];
    // 上界跟 options.length 走，不在第二处再写一遍选项个数。
    assert(answer.length === 1 && typeof index === "number" && Number.isInteger(index)
        && index >= 0 && index < options.length,
        at + ".answer: 单选答案必须是单个合法下标");
    return {
        kind: "choice",
        id,
        number: value.number as number,
        prompt,
        options,
        answer: [index],
        ...(value.instructionId === undefined ? {} : {instructionId: value.instructionId as string}),
        ...(value.explanationId === undefined ? {} : {explanationId: value.explanationId as string}),
    };
}

/** 题号必须从 start 开始连续；缺题要在这里暴露，不能靠页面兜底。 */
function expectNumbering(questions: readonly ExamQuestion[], start: number, at: string) {
    for (const [index, question] of questions.entries()) {
        const expected = start + index;
        assert(question.number === expected, `${at}: 第 ${index + 1} 题题号应为 ${expected}（实际 ${question.number}）`);
    }
}

function expectGroupHead(value: Record<string, unknown>, at: string) {
    expectId(value.id, at + ".id");
    expectText(value.label, at + ".label");
    assert(groupLabel.test(value.label as string), `${at}.label: 大题号应写成「問題N」`);
    expectText(value.title, at + ".title");
}

function expectInstruction(value: unknown, at: string) {
    expectText(value, at);
    // 卷面指示不会带换行；抄进来时压成一行，避免渲染出来断在半句。
    assert(!/\n/.test(value as string), at + ": 答题指示应压成一行");
}

function expectKnowledgeGroups(value: unknown, at: string, ids: Set<string>, startNumber: number): ExamKnowledgeGroup[] {
    expectList(value, at);
    let next = startNumber;
    return value.map((candidate, index) => {
        const label = `${at}[${index}]`;
        expectObject(candidate, label);
        expectKeys(candidate, ["id", "label", "title", "instruction", "questions"], label);
        expectGroupHead(candidate, label);
        expectInstruction(candidate.instruction, label + ".instruction");
        expectList(candidate.questions, label + ".questions");
        const questions = candidate.questions.map((question, position) =>
            expectQuestion(question, `${label}.questions[${position}]`, ids));
        expectNumbering(questions, next, `${label}.questions`);
        next += questions.length;
        return {
            id: candidate.id as string,
            label: candidate.label as string,
            title: candidate.title as string,
            instruction: candidate.instruction as string,
            questions,
        };
    });
}

function expectPassages(value: unknown, at: string, ids: Set<string>, startNumber: number): {
    passages: ExamPassage[];
    next: number;
} {
    expectList(value, at);
    let next = startNumber;
    const passages = value.map((candidate, index) => {
        const label = `${at}[${index}]`;
        expectObject(candidate, label);
        expectKeys(candidate, ["id", "title", "body", "image", "questions"], label);
        expectId(candidate.id, label + ".id");
        expectOptionalText(candidate.title, label + ".title");
        expectList(candidate.body, label + ".body");
        for (const [position, line] of candidate.body.entries()) expectText(line, `${label}.body[${position}]`);
        if (candidate.image !== undefined) expectText(candidate.image, label + ".image");
        expectList(candidate.questions, label + ".questions");
        const questions = candidate.questions.map((question, position) =>
            expectQuestion(question, `${label}.questions[${position}]`, ids));
        expectNumbering(questions, next, `${label}.questions`);
        next += questions.length;
        return {
            id: candidate.id as string,
            title: candidate.title as string,
            body: candidate.body as string[],
            ...(candidate.image === undefined ? {} : {image: candidate.image}),
            questions,
        };
    });
    return {passages, next};
}

function expectReadingGroups(value: unknown, at: string, ids: Set<string>, startNumber: number): ExamReadingGroup[] {
    expectList(value, at);
    let next = startNumber;
    return value.map((candidate, index) => {
        const label = `${at}[${index}]`;
        expectObject(candidate, label);
        expectKeys(candidate, ["id", "label", "title", "instruction", "passages"], label);
        expectGroupHead(candidate, label);
        expectInstruction(candidate.instruction, label + ".instruction");
        const {passages, next: after} = expectPassages(candidate.passages, label + ".passages", ids, next);
        next = after;
        return {
            id: candidate.id as string,
            label: candidate.label as string,
            title: candidate.title as string,
            instruction: candidate.instruction as string,
            passages,
        };
    });
}

function expectListeningGroups(value: unknown, at: string, ids: Set<string>): ExamListeningGroup[] {
    expectList(value, at);
    let next = 1;
    return value.map((candidate, index) => {
        const label = `${at}[${index}]`;
        expectObject(candidate, label);
        expectKeys(candidate, ["id", "label", "title", "instruction", "questions"], label);
        expectGroupHead(candidate, label);
        if (candidate.instruction !== undefined) expectInstruction(candidate.instruction, label + ".instruction");
        expectList(candidate.questions, label + ".questions");
        const questions = candidate.questions.map((question, position) =>
            expectQuestion(question, `${label}.questions[${position}]`, ids));
        // 聴解在卷面上是另一张卡，题号重新从 1 开始。
        expectNumbering(questions, next, `${label}.questions`);
        next += questions.length;
        return {
            id: candidate.id as string,
            label: candidate.label as string,
            title: candidate.title as string,
            ...(candidate.instruction === undefined ? {} : {instruction: candidate.instruction as string}),
            questions,
        };
    });
}

export function decodeExam(value: unknown, expectedId: string): Exam {
    expectObject(value, "exam");
    expectKeys(value, ["schemaVersion", "kind", "id", "bookId", "title", "examLevel",
        "knowledge", "reading", "listening"], "exam");
    assert(value.schemaVersion === 1, "exam: unsupported schema");
    assert(value.kind === "exam", "exam: wrong kind");
    expectText(value.id, "exam.id");
    assert(value.id === expectedId, "exam: identity mismatch");
    expectId(value.bookId, "exam.bookId");
    assert(bookIdPattern.test(value.bookId as string), "exam.bookId: 不能带点号");
    assert((value.id as string).startsWith(value.bookId + "."), "exam.id: 必须属于 bookId");
    expectText(value.title, "exam.title");
    expectText(value.examLevel, "exam.examLevel");

    const ids = new Set<string>();

    expectObject(value.knowledge, "exam.knowledge");
    expectKeys(value.knowledge, ["kind", "groups"], "exam.knowledge");
    assert(value.knowledge.kind === "knowledge", "exam.knowledge: wrong kind");
    const knowledge = expectKnowledgeGroups(value.knowledge.groups, "exam.knowledge.groups", ids, 1);

    expectObject(value.reading, "exam.reading");
    expectKeys(value.reading, ["kind", "groups"], "exam.reading");
    assert(value.reading.kind === "reading", "exam.reading: wrong kind");
    const knowledgeCount = knowledge.reduce((total, group) => total + group.questions.length, 0);
    const reading = expectReadingGroups(value.reading.groups, "exam.reading.groups", ids, knowledgeCount + 1);

    expectObject(value.listening, "exam.listening");
    expectKeys(value.listening, ["kind", "audio", "groups"], "exam.listening");
    assert(value.listening.kind === "listening", "exam.listening: wrong kind");
    // 原本不含听力册的卷（2024-12）没有音源，audio 允许空串。
    expectOptionalText(value.listening.audio, "exam.listening.audio");
    const listening = expectListeningGroups(value.listening.groups, "exam.listening.groups", ids);

    return {
        schemaVersion: 1,
        kind: "exam",
        id: value.id as string,
        bookId: value.bookId as string,
        title: value.title as string,
        examLevel: value.examLevel as string,
        knowledge: {kind: "knowledge", groups: knowledge},
        reading: {kind: "reading", groups: reading},
        listening: {kind: "listening", audio: value.listening.audio as string, groups: listening},
    };
}
