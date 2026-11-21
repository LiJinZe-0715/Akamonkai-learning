import fs from "node:fs";
import path from "node:path";

/**
 * 真题编译：真题与教材是两套数据，这里只做真题。
 *
 * 源文件放在 data/exams/<bookId>/<id>.json，产物是 public/content/exams/<id>.json。
 * 源数据按卷面形态抄写（题干 string[]、选项 {text|image}、答案标量），转录成果不用返工；
 * 编译时把每道题归一成全站统一的 Question（Segment 片段、answer 数组），
 * 教材和真题从此共用一套题目结构与判分。除此之外只做搬运与索引，卷面文字原样出来。
 */

const examRoot = "data/exams";
const check = (condition, message) => {
    if (!condition) throw new Error("真题编译失败：" + message);
};
const read = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        throw new Error(`读取真题失败：${file}（${error.message}）`, {cause: error});
    }
};

function examFiles(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry =>
        entry.isDirectory()
            ? examFiles(path.join(directory, entry.name))
            : entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : []);
}

/** 三块都在，且顺序由字段决定；这里只查存在性，细节由 check 与运行时解码器把关。 */
function sectionsOf(source, file) {
    const sections = [source.knowledge, source.reading, source.listening];
    check(sections.every(Boolean), `${file} 缺少知識・読解・聴解中的一块`);
    check(source.knowledge.kind === "knowledge" && source.reading.kind === "reading"
        && source.listening.kind === "listening", `${file} 的模块类型不对`);
    return sections;
}

function countQuestions(source) {
    const count = group => (group.questions ?? []).length + (group.passages ?? [])
        .reduce((sum, passage) => sum + passage.questions.length, 0);
    return [source.knowledge.groups, source.reading.groups, source.listening.groups]
        .reduce((total, groups) => total + groups.reduce((sum, group) => sum + count(group), 0), 0);
}

/**
 * 卷面题 -> 统一 Question：题干每行包成 {japanese}，题干图挂在 prompt 末尾，
 * 选项各包成一个单元素 Segment 数组，答案标量包成单元素数组。
 * 只换承载结构，文字与路径一字不动；转换完立刻做逐字段可逆断言。
 */
function convertQuestion(source, file) {
    const at = `${file}:${source?.id ?? "?"}`;
    check(source && typeof source === "object" && !Array.isArray(source), `${at} 题目不是对象`);
    check(typeof source.id === "string" && source.id.length > 0, `${at} 缺 id`);
    check(Number.isInteger(source.number) && source.number > 0, `${at} 卷面题号不对`);
    check(Array.isArray(source.prompt) && source.prompt.every(line => typeof line === "string"),
        `${at} 题干必须是文字数组`);
    check(Array.isArray(source.options) && source.options.length >= 2 && source.options.length <= 4,
        `${at} 选项必须 2–4 个`);
    check(Number.isInteger(source.answer) && source.answer >= 0 && source.answer < source.options.length,
        `${at} 答案必须是合法选项下标`);
    // 答题解析全站统一是 explanationId（译文 id）。真题目前没有解析内容；
    // 真要加必须走译文目录，不能把裸字符串留在卷面数据里。
    check(source.explanation === undefined,
        `${at} 源数据不写裸字符串 explanation，答题解析请走译文目录 explanationId`);

    const prompt = source.prompt.map(line => ({japanese: line}));
    if (source.image !== undefined) {
        check(typeof source.image === "string" && source.image.length > 0, `${at} 题干图路径不对`);
        prompt.push({image: source.image});
    }
    const options = source.options.map((option, index) => {
        check(option && typeof option === "object" && !Array.isArray(option), `${at} 选项 ${index} 不是对象`);
        const keys = Object.keys(option);
        check(keys.length === 1 && (keys[0] === "text" || keys[0] === "image"),
            `${at} 选项 ${index} 必须是 text / image 二选一`);
        const kind = keys[0];
        check(typeof option[kind] === "string" && option[kind].length > 0, `${at} 选项 ${index} 内容为空`);
        return [kind === "text" ? {japanese: option.text} : {image: option.image}];
    });
    const question = {
        kind: "choice",
        id: source.id,
        number: source.number,
        prompt,
        options,
        answer: [source.answer],
    };

    // 可逆性：原文逐行、图片、选项、答案、题号、id 一个不少且一字不差。
    const lines = prompt.filter(segment => segment.japanese !== undefined);
    const figures = prompt.filter(segment => segment.image !== undefined);
    check(lines.length === source.prompt.length
        && lines.every((segment, index) => segment.japanese === source.prompt[index]),
    `${at} 题干文字在转换中变了`);
    check(figures.length === (source.image === undefined ? 0 : 1)
        && (source.image === undefined || figures[0].image === source.image),
    `${at} 题干图在转换中变了`);
    check(options.length === source.options.length && options.every(([segment], index) => {
        const original = source.options[index];
        return "text" in original ? segment.japanese === original.text : segment.image === original.image;
    }), `${at} 选项在转换中变了`);
    check(question.answer[0] === source.answer && question.number === source.number
        && question.id === source.id, `${at} 答案/题号/id 在转换中变了`);
    return question;
}

/** 三块结构原样保留，只把叶子上的题目归一。 */
function convertExam(source, file) {
    const questionsOf = group => (group.questions ?? []).map(question => convertQuestion(question, file));
    return {
        ...source,
        knowledge: {
            ...source.knowledge,
            groups: source.knowledge.groups.map(group => ({...group, questions: questionsOf(group)})),
        },
        reading: {
            ...source.reading,
            groups: source.reading.groups.map(group => ({
                ...group,
                passages: (group.passages ?? []).map(passage => ({
                    ...passage, questions: (passage.questions ?? []).map(question => convertQuestion(question, file)),
                })),
            })),
        },
        listening: {
            ...source.listening,
            groups: source.listening.groups.map(group => ({...group, questions: questionsOf(group)})),
        },
    };
}

export function compileExams() {
    return examFiles(examRoot).map(file => {
        const source = read(file);
        const bookId = path.relative(examRoot, file).split(path.sep)[0];
        const slug = path.basename(file, ".json");
        check(source.kind === "exam", `${file} 不是真题`);
        check(source.bookId === bookId, `${file} 必须放在所属教材目录里`);
        check(source.id === bookId + "." + slug, `${file} 的 id 与文件名不一致`);
        check(typeof source.examLevel === "string" && source.examLevel.length > 0, `${file} 缺考试等级 examLevel`);
        sectionsOf(source, file);
        check(Array.isArray(source.knowledge.groups) && source.knowledge.groups.length > 0, `${file} 言語知識 没有大题`);
        check(Array.isArray(source.reading.groups) && source.reading.groups.length > 0, `${file} 読解 没有大题`);
        check(Array.isArray(source.listening.groups) && source.listening.groups.length > 0, `${file} 聴解 没有大题`);
        // 2024-12 原本不含听力册，也没有音源；audio 允许空串（仍必须是字符串）。
        check(typeof source.listening.audio === "string", `${file} 聴解 audio 不是字符串`);
        const before = countQuestions(source);
        check(before > 0, `${file} 没有任何题目`);
        const exam = convertExam(source, file);
        check(countQuestions(exam) === before, `${file} 题目数在转换中变了`);
        return {...exam, questionCount: before};
    });
}

export function examSummaries(exams) {
    return exams.map(exam => ({
        id: exam.id,
        bookId: exam.bookId,
        title: exam.title,
        examLevel: exam.examLevel,
        questionCount: exam.questionCount,
    }));
}
