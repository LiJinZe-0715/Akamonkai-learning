import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "../harness.mjs";
import {compileExams} from "../exam-compiler.mjs";

/**
 * 真题数据：与教材完全分开的一套模型，所以单独一个套件。
 *
 * 这里既查源数据（data/exams），也查运行时解码器——源数据合法不代表读进来能过，
 * 两边都过才算能上线。
 */

const EXAM_ROOT = "data/exams";

function examFiles(directory = EXAM_ROOT) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return examFiles(target);
        return entry.name.endsWith(".json") ? [target] : [];
    });
}

const sources = () => examFiles().map(file => ({
    file,
    exam: JSON.parse(fs.readFileSync(file, "utf8")),
}));

/**
 * 编译产物：运行时解码器、领域函数吃的是它，不是卷面源数据。
 * questionCount 只给目录用，写盘前会去掉，这里也去掉才能喂严格解码器。
 */
const products = () => compileExams().map(({questionCount: _ignored, ...exam}) => exam);

const groupsOf = exam => [...exam.knowledge.groups, ...exam.reading.groups, ...exam.listening.groups];

const questionsOf = exam => [
    ...exam.knowledge.groups.flatMap(group => group.questions),
    ...exam.reading.groups.flatMap(group => group.passages.flatMap(passage => passage.questions)),
    ...exam.listening.groups.flatMap(group => group.questions),
];

test("真题只有三块：言語知識 → 読解 → 聴解，题目一律选择题", ["exam:structure"], () => {
    const all = sources();
    assert(all.length > 0, "没有找到任何真题");
    const problems = [];
    for (const {file, exam} of all) {
        if (exam.kind !== "exam") problems.push(`${file}: kind 不是 exam`);
        if (exam.schemaVersion !== 1) problems.push(`${file}: schemaVersion 不是 1`);
        for (const [key, kind] of [["knowledge", "knowledge"], ["reading", "reading"], ["listening", "listening"]]) {
            const section = exam[key];
            if (!section) {
                problems.push(`${file}: 缺少 ${key}`);
                continue;
            }
            if (section.kind !== kind) problems.push(`${file}: ${key} 的 kind 不对`);
            if (!Array.isArray(section.groups) || !section.groups.length) problems.push(`${file}: ${key} 没有大题`);
        }
        // 音源缺失的卷（2024-12）用空串，但字段必须是字符串。
        if (typeof exam.listening?.audio !== "string") problems.push(`${file}: 聴解 audio 不是字符串`);
        for (const group of groupsOf(exam)) {
            if (!group.label?.startsWith("問題")) problems.push(`${file}: 大题编号不成「問題N」`);
            const questions = group.questions ?? group.passages?.flatMap(passage => passage.questions) ?? [];
            for (const passage of group.passages ?? []) {
                if (!Array.isArray(passage.body) || !passage.body.length) problems.push(`${file}: ${passage.id} 没有正文`);
            }
            for (const question of questions) {
                // 2–4 个：聴解 問題4 即時応答是 3 択，其余四択。
                if (question.options?.length < 2 || question.options?.length > 4)
                    problems.push(`${file}: ${question.id} 选项不是 2–4 个`);
                if (!Number.isInteger(question.answer) || question.answer < 0
                    || question.answer >= (question.options?.length ?? 0))
                    problems.push(`${file}: ${question.id} 的答案不是合法选项下标`);
                if (!Array.isArray(question.prompt)) problems.push(`${file}: ${question.id} 缺题干数组`);
                // 源数据按卷面抄写；归一成统一 Question 是编译期的事，不能在源文件里混写。
                if (question.kind !== undefined || question.explanationId !== undefined
                    || Array.isArray(question.answer))
                    problems.push(`${file}: ${question.id} 源数据应是卷面形态`);
            }
        }
        if (typeof exam.examLevel !== "string") problems.push(`${file}: 缺考试等级 examLevel`);
    }
    assert.deepEqual(problems.slice(0, 10), [], `共 ${problems.length} 处真题结构问题`);
});

test("真题编译期归一：卷面题与统一 Question 逐字对应", ["exam:compile"], () => {
    const built = products();
    const raw = sources();
    assert.equal(built.length, raw.length, "编译产物与源数据数量不一致");
    for (const {file, exam} of raw) {
        const product = built.find(item => item.id === exam.id);
        assert(product, `${file}: 没有对应的编译产物`);
        const originals = questionsOf(exam);
        const questions = questionsOf(product);
        assert.equal(questions.length, originals.length, `${file}: 题目数在编译中变了`);
        for (const [index, question] of questions.entries()) {
            const original = originals[index];
            assert.equal(question.kind, "choice", `${file}: ${question.id} 缺统一 kind`);
            assert.equal(question.id, original.id, `${file}: 题目 id 变了`);
            assert.equal(question.number, original.number, `${file}: 卷面题号变了`);
            const lines = question.prompt.filter(segment => segment.japanese !== undefined);
            const figures = question.prompt.filter(segment => segment.image !== undefined);
            assert.deepEqual(lines.map(segment => segment.japanese), original.prompt,
                `${file}: ${question.id} 题干文字变了`);
            assert.equal(figures.length, original.image === undefined ? 0 : 1,
                `${file}: ${question.id} 题干图数量不对`);
            if (original.image !== undefined)
                assert.equal(figures[0].image, original.image, `${file}: ${question.id} 题干图变了`);
            assert.deepEqual(question.options.map(([segment]) => segment.japanese !== undefined
                ? {text: segment.japanese} : {image: segment.image}), original.options,
            `${file}: ${question.id} 选项变了`);
            assert.deepEqual(question.answer, [original.answer], `${file}: ${question.id} 答案变了`);
            assert(!("explanation" in question), `${file}: ${question.id} 不该残留裸解析字符串`);
        }
        assert.equal(product.title, exam.title, `${file}: 标题变了`);
        assert.equal(product.examLevel, exam.examLevel, `${file}: 考试等级变了`);
        assert.equal(product.listening.audio, exam.listening.audio, `${file}: 听力音频变了`);
    }
});

test("真题题号按卷面走：知識从 1、読解接续、聴解重新从 1", ["exam:numbering"], () => {
    const problems = [];
    for (const {file, exam} of sources()) {
        const knowledge = exam.knowledge.groups.flatMap(group => group.questions).map(question => question.number);
        const reading = exam.reading.groups.flatMap(group => group.passages)
            .flatMap(passage => passage.questions).map(question => question.number);
        const listening = exam.listening.groups.flatMap(group => group.questions).map(question => question.number);
        knowledge.forEach((number, index) => {
            if (number !== index + 1) problems.push(`${file}: 言語知識第 ${index + 1} 题题号是 ${number}`);
        });
        reading.forEach((number, index) => {
            if (number !== knowledge.length + index + 1) problems.push(`${file}: 読解第 ${index + 1} 题题号是 ${number}`);
        });
        listening.forEach((number, index) => {
            if (number !== index + 1) problems.push(`${file}: 聴解第 ${index + 1} 题题号是 ${number}`);
        });
    }
    assert.deepEqual(problems.slice(0, 10), [], `共 ${problems.length} 处题号问题`);
});

test("真题题目 id 全卷唯一，并与目录索引一致", ["exam:unique-ids"], ({fixture}) => {
    const all = sources();
    for (const {file, exam} of all) {
        const ids = questionsOf(exam).map(question => question.id);
        assert.equal(new Set(ids).size, ids.length, `${file}: 题目 id 有重复`);
        for (const id of ids) assert(id.startsWith(exam.id + "."), `${file}: 题目 id 不属于本场考试：${id}`);
    }
    // 目录里登记的每一场都必须有源文件，且题数对得上。
    const catalog = fixture.source.catalog;
    const byId = new Map(all.map(item => [item.exam.id, item.exam]));
    for (const summary of catalog.exams) {
        const exam = byId.get(summary.id);
        assert(exam, `目录里的真题没有源文件：${summary.id}`);
        assert.equal(summary.questionCount, questionsOf(exam).length, `${summary.id} 的题数与目录不一致`);
        assert.equal(summary.bookId, exam.bookId, `${summary.id} 的教材不一致`);
    }
    assert.equal(catalog.exams.length, all.length, "目录与源文件的真题数量不一致");
    // 教材那套数据里不能再出现真题。
    const units = fixture.source.units.map(lesson => lesson.id);
    for (const {exam} of all) assert(!units.includes(exam.id), `真题不该出现在教材课里：${exam.id}`);
});

test("真题的中间层是小节：知識按大题、読解按文章、聴解按题型", ["exam:sections"], ({load}) => {
    const {examSections, examQuestions} = load("src/modules/exam/domain/exam.ts");
    const order = ["knowledge", "reading", "listening"];
    for (const {file, exam} of sources()) {
        const sections = examSections(exam);
        const expected = [
            ...exam.knowledge.groups.map(group => group.id),
            ...exam.reading.groups.flatMap(group => group.passages.map(passage => passage.id)),
            ...exam.listening.groups.map(group => group.id),
        ];
        assert.deepEqual(sections.map(section => section.id), expected, `${file}: 小节顺序不是卷面顺序`);
        assert.equal(new Set(expected).size, expected.length, `${file}: 小节 id 有重复`);

        // 三块之间不许交错：知識的全部小节都在読解之前，読解都在聴解之前。
        const ranks = sections.map(section => order.indexOf(section.module));
        assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, `${file}: 小节跨块交错`);

        for (const section of sections) {
            assert(section.questions.length > 0, `${file}: 小节 ${section.id} 没有题`);
            assert(section.label.startsWith("問題"), `${file}: 小节 ${section.id} 的大题号不成「問題N」`);
            assert(section.label.length > 0, `${file}: 小节 ${section.id} 没有大题号`);
            assert(typeof section.title === "string", `${file}: 小节 ${section.id} 的小节名不是字符串`);
            // 回归：转录曾把卷面大题指示（截断到 38 字）塞进 passage.title，
            // 页面于是渲染成「問題14 問題14 右のページは…」这种重复断句标题。指示应只留在 instruction 里。
            assert(!section.title.startsWith("問題"), `${file}: 小节 ${section.id} 的 title 混入了大题指示`);
        }

        // 読解一个大题＝若干篇文章，每篇一节；大题指示只挂在第一节上，与卷面一致。
        for (const group of exam.reading.groups) {
            const own = sections.filter(section => section.module === "reading" && section.label === group.label);
            assert.equal(own.length, group.passages.length, `${file}: ${group.label} 的小节数不等于文章数`);
            assert.equal(own[0].instruction, group.instruction, `${file}: ${group.label} 第一篇没有大题指示`);
            for (const section of own.slice(1))
                assert.equal(section.instruction, undefined, `${file}: ${section.id} 重复了大题指示`);
            for (const section of own) assert(section.body?.length > 0, `${file}: ${section.id} 没有正文`);
        }

        // 一题不漏：小节摊平后的题流与全卷题流完全一致。
        assert.deepEqual(
            sections.flatMap(section => section.questions.map(question => question.id)),
            examQuestions(exam).map(question => question.id),
            `${file}: 小节没有覆盖全卷题目`);
    }
});

test("没有音源的卷子，聴解占位题不进交卷条件与成绩", ["exam:no-audio"], ({load}) => {
    const {examQuestions, examScoredQuestions} = load("src/modules/exam/domain/exam.ts");
    const {grade} = load("src/modules/assessment/domain/question.ts");
    const all = products();
    assert(all.some(exam => !exam.listening.audio), "需要至少一场无音源真题，否则这条用例失去意义");

    for (const exam of all) {
        const questions = examQuestions(exam);
        const scored = examScoredQuestions(exam);
        const listeningIds = new Set(
            exam.listening.groups.flatMap(group => group.questions.map(question => question.id)));
        if (exam.listening.audio) {
            assert.deepEqual(scored.map(question => question.id), questions.map(question => question.id),
                `${exam.id}: 有音源时全卷都应计分`);
            continue;
        }
        assert(scored.length > 0, `${exam.id}: 计分题不能为空`);
        assert.equal(scored.length, questions.length - listeningIds.size,
            `${exam.id}: 排除的题数应等于聴解题数`);
        assert(scored.every(question => !listeningIds.has(question.id)),
            `${exam.id}: 计分题里仍混有聴解题`);

        // 只答完计分题就能交卷，成绩也只按这些题算。
        const answers = Object.fromEntries(scored.map(question => [question.id, question.answer[0]]));
        const result = grade(scored, answers);
        assert(result.complete, `${exam.id}: 答完计分题却还不能交卷`);
        assert.equal(result.total, scored.length, `${exam.id}: 成绩总分应只算计分题`);
        assert.equal(result.correct, scored.length, `${exam.id}: 答对的计分题应全部判对`);
        // 同样的答案交给全卷题仍然 incomplete：排除发生在题目集合，不是判分逻辑里放水。
        assert(!grade(questions, answers).complete, `${exam.id}: 全卷判分不该被改成放水`);
    }
});

test("真题页面按计分题接线，无音源聴解只给说明", [], () => {
    const hook = fs.readFileSync("src/modules/exam/presentation/hooks/use-exam-attempt.ts", "utf8");
    assert.match(hook, /grade\(scoredQuestions, answers\)/, "判分必须用计分题，不能退回全卷题");
    const page = fs.readFileSync("src/modules/exam/presentation/pages/ExamPaperScreen.tsx", "utf8");
    assert.match(page, /listeningUnscored && section\.module === "listening"/,
        "无音源的聴解小节要有专门的处理分支");
    assert.match(page, /ui\.examNoAudio/, "无音源的聴解小节要显示不计分说明");
    assert.match(page, /firstUnanswered = submitted \? undefined\s*: scoredQuestions\.find/,
        "漏答跳转只能落在计分题上");
});

test("真题解码器拒绝残缺数据", ["exam:reject"], ({load}) => {
    const {decodeExam} = load("src/modules/exam/infrastructure/exam-decoder.ts");
    const all = products();
    assert(all.length > 0, "没有编译产物可查");
    for (const exam of all) decodeExam(JSON.parse(JSON.stringify(exam)), exam.id); // 每一场都必须能过
    const source = all[0]; // 下面的破坏性测试用第一场
    const clone = () => JSON.parse(JSON.stringify(source));

    // 音声题卷面不印题干：空数组合法，但不能不是数组。
    const emptyPrompt = clone();
    emptyPrompt.knowledge.groups[0].questions[0].prompt = [];
    assert.doesNotThrow(() => decodeExam(emptyPrompt, source.id), "空题干必须能过解码器");

    const broken = [
        ["缺聴解", exam => delete exam.listening],
        ["选项少一个", exam => exam.knowledge.groups[0].questions[0].options.pop()],
        ["答案越界", exam => { exam.knowledge.groups[0].questions[0].answer = [4]; }],
        ["答案不是数组", exam => { exam.knowledge.groups[0].questions[0].answer = 0; }],
        ["答案多于一个", exam => { exam.knowledge.groups[0].questions[0].answer = [0, 1]; }],
        ["缺 kind", exam => { delete exam.knowledge.groups[0].questions[0].kind; }],
        ["kind 不对", exam => { exam.knowledge.groups[0].questions[0].kind = "fill-in"; }],
        ["题号跳号", exam => { exam.knowledge.groups[0].questions[0].number = 2; }],
        ["id 重复", exam => { exam.knowledge.groups[0].questions[1].id = exam.knowledge.groups[0].questions[0].id; }],
        ["多出字段", exam => { exam.knowledge.groups[0].questions[0].hint = "x"; }],
        ["空指示", exam => { exam.knowledge.groups[0].instruction = ""; }],
        ["题干不是数组", exam => { exam.knowledge.groups[0].questions[0].prompt = "x"; }],
        ["题干片段没有内容", exam => { exam.knowledge.groups[0].questions[0].prompt[0] = {}; }],
        ["题干片段文字与图并存", exam => {
            exam.knowledge.groups[0].questions[0].prompt[0] = {japanese: "x", image: "y"};
        }],
        ["真题片段不许引用译文", exam => {
            exam.knowledge.groups[0].questions[0].prompt[0] = {textId: "ui.answer"};
        }],
        ["选项片段为空", exam => { exam.knowledge.groups[0].questions[0].options[0] = []; }],
        ["顶层漏考试等级", exam => { delete exam.examLevel; }],
    ];
    for (const [label, mutate] of broken) {
        const exam = clone();
        mutate(exam);
        assert.throws(() => decodeExam(exam, source.id), `「${label}」应当被拒绝`);
    }
});

/** 内存草稿仓库：读写都做副本，避免用例之间共享可变对象。 */
function memoryDrafts() {
    const box = new Map();
    return {
        box,
        repository: {
            read: key => box.has(key) ? structuredClone(box.get(key)) : null,
            write: (key, value) => {
                box.set(key, structuredClone(value));
                return true;
            },
            remove: key => {
                box.delete(key);
                return true;
            },
        },
    };
}

test("真题作答草稿可保存恢复，提交后清除", ["exam:draft"], ({load}) => {
    const {ExamDraftService} = load("src/modules/exam/application/exam-draft-service.ts");
    const {examQuestions} = load("src/modules/exam/domain/exam.ts");
    const exam = products()[0];
    const questions = examQuestions(exam);
    const {box, repository} = memoryDrafts();
    const service = new ExamDraftService(repository);
    const key = exam.id + ":exam";
    const state = {
        answers: {[questions[0].id]: 1, [questions[1].id]: 3},
        revealed: [questions[2].id],
    };

    assert.equal(service.restore(exam.id, questions), undefined, "还没有草稿时不应恢复出内容");
    assert(service.save(exam.id, questions, state), "保存应成功");
    assert(box.has(key), "草稿键必须是 <examId>:exam");
    assert.deepEqual(service.restore(exam.id, questions), state, "答案与核对记录都要恢复");
    assert(service.clear(exam.id), "提交后应能清除");
    assert.equal(service.restore(exam.id, questions), undefined, "清除后不应再恢复");
    assert(service.save(exam.id, questions, {answers: {}, revealed: []}), "空进度保存也应返回成功");
    assert(!box.has(key), "空进度应删掉记录，而不是留一条空草稿");
});

test("损坏或过期的真题草稿被丢弃", ["exam:draft-reject"], ({load}) => {
    const {ExamDraftService} = load("src/modules/exam/application/exam-draft-service.ts");
    const {examQuestions} = load("src/modules/exam/domain/exam.ts");
    const exam = products()[0];
    const questions = examQuestions(exam);
    const {box, repository} = memoryDrafts();
    const service = new ExamDraftService(repository);
    const key = exam.id + ":exam";
    const good = {answers: {[questions[0].id]: 0}, revealed: []};
    assert(service.save(exam.id, questions, good));
    const valid = structuredClone(box.get(key));

    const broken = [
        ["不是对象", "x"],
        ["是数组", []],
        ["缺字段", {}],
        ["版本不对", {...valid, version: 2}],
        ["签名过期", {...valid, signature: "stale"}],
        ["答案题目不存在", {...valid, answers: {"nope": 0}}],
        ["答案越界", {...valid, answers: {[questions[0].id]: questions[0].options.length}}],
        ["答案不是整数", {...valid, answers: {[questions[0].id]: 1.5}}],
        ["答案是字符串", {...valid, answers: {[questions[0].id]: "1"}}],
        ["核对记录有未知 id", {...valid, revealed: ["nope"]}],
        ["核对记录不是数组", {...valid, revealed: {}}],
        ["答案是数组", {...valid, answers: []}],
        ["没有 answers", {...valid, answers: undefined}],
    ];
    for (const [label, value] of broken) {
        repository.write(key, value);
        assert.equal(service.restore(exam.id, questions), undefined, `「${label}」应被丢弃`);
    }
    repository.write(key, valid);
    assert.deepEqual(service.restore(exam.id, questions), good, "合法草稿仍应能恢复");
});

/** 递归找出对象里所有 image 字段：题干图、文章图、选项图都不漏。 */
function imagePaths(value, found = []) {
    if (Array.isArray(value)) {
        for (const entry of value) imagePaths(entry, found);
    } else if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
            if (key === "image" && typeof entry === "string") found.push(entry);
            else imagePaths(entry, found);
        }
    }
    return found;
}

test("真题引用的音频和图片文件都存在", ["exam:media"], () => {
    const all = sources();
    assert(all.length > 0, "没有真题可查");
    const checked = [];
    for (const {file, exam} of all) {
        // 空串表示该卷没有音源，不是待检查的文件路径。
        for (const relative of [exam.listening.audio, ...imagePaths(exam)].filter(Boolean)) {
            const target = path.join("public", relative);
            assert(fs.existsSync(target), `${file}: 引用的媒体不存在 ${target}`);
            checked.push(relative);
        }
    }
    assert(checked.length > 0, "一场真题都没引用任何媒体，用例失去意义");
});
