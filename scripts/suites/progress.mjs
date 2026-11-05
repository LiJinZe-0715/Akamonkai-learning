import assert from "node:assert/strict";
import {test} from "../harness.mjs";

/**
 * 学习进度：持久化、并发、导入导出。
 *
 * 每个用例自带一份内存仓储，不存在跨用例共享的 `let stored`。
 * 并发用例显式模拟「两个页面各自拿着陈旧快照同时写」，这是最容易出状态 bug 的地方。
 */

const CLOCK = {now: () => "2026-09-21T00:00:00.000Z"};

/** 一份独立的内存仓储，写入成功。 */
function memoryRepository(initial, {writable = () => true} = {}) {
    const box = {value: structuredClone(initial), writes: 0};
    return {
        box,
        repository: {
            read: () => structuredClone(box.value),
            write: value => {
                if (!writable()) return false;
                box.writes++;
                box.value = structuredClone(value);
                return true;
            },
            exclusive: task => task(true),
        },
    };
}

/* ── 进度状态 ─────────────────────────────────────────────── */

test("全新进度可以标记单词、记录成绩并完整往返", ["progress:empty", "progress:marks", "progress:results"], ({load}) => {
    const {emptyProgress, validateProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {box, repository} = memoryRepository(emptyProgress());
    const progress = new ProgressService(repository, CLOCK);

    assert.deepEqual(progress.load(), emptyProgress(), "首次运行必须给出空进度");
    let state = progress.load();
    const before = structuredClone(state);
    state = progress.mark(state, "word.1", "saved");
    assert.deepEqual(before, emptyProgress(), "标记命令不得改动旧状态");
    state = progress.record(state, "minna-1:grammar-test", 5, 6);
    assert.equal(state.results["minna-1:grammar-test"].at, "2026-09-21T00:00:00.000Z", "成绩必须带上时钟时间");
    progress.save(state);
    assert.deepEqual(progress.load(), state);
    assert(validateProgress(box.value));

    const roundTripped = progress.import(progress.export(state), progress.load());
    assert.deepEqual(roundTripped, state, "导出再导入必须完全一致");

    assert.throws(() => progress.record(state, "x", 7, 6), /Invalid assessment/, "答对数不能超过总数");
    assert.throws(() => progress.record(state, "x", 0, 0), /Invalid assessment/, "总数为零不算一次成绩");
    assert.throws(() => progress.record(state, "x", -1, 6), /Invalid assessment/, "答对数不能为负");
    assert.throws(() => progress.visit(state, "", "words"), "空单元 ID 必须拒绝");
});

test("有上次学习位置时恢复，并过滤掉已失效的目标", ["progress:resuming", "progress:stale"], ({load, fixture}) => {
    const {DashboardService} = load("src/application/dashboard-service.ts");
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {catalogLessons, findLesson, filterCatalog, adjacentLessons} = load("src/modules/curriculum/domain/catalog-queries.ts");
    const catalog = fixture.catalog();
    const byId = new Map(catalog.lessons.map(lesson => [lesson.id, lesson]));
    const dashboard = new DashboardService({
        lessons: catalogLessons,
        adjacent: adjacentLessons,
        search: filterCatalog,
    });
    const [first, second] = catalog.books[0].lessonIds.map(id => byId.get(id));
    const state = {
        ...emptyProgress(),
        words: {w: {saved: true, mastered: false}, x: {saved: false, mastered: true}},
        lastVisited: {unitId: second.id, view: second.views[0], at: "2026-01-01T00:00:00Z"},
        results: {
            "removed:quiz": {correct: 1, total: 1, at: "2026-02-03T00:00:00Z"},
            [`${second.id}:${second.views[0]}`]: {correct: 1, total: 2, at: "2026-02-02T00:00:00Z"},
            [`${first.id}:${first.views[0]}`]: {correct: 2, total: 2, at: "2026-02-01T00:00:00Z"},
        },
    };
    const overview = dashboard.overview(catalog, state, "all", "", 1);
    assert(overview.isResuming, "有上次位置时必须可继续");
    assert.equal(overview.active.lesson.id, second.id);
    assert.equal(findLesson(catalog, second.id, second.views[0]).lesson.id, second.id, "页签必须真的开放");
    assert.deepEqual(overview.summary, {saved: 1, mastered: 1, tests: 3});
    assert.equal(overview.recentResults[0].lesson.id, second.id, "已失效的路由必须在截断前丢弃");

    const stale = dashboard.overview(catalog, {...state, lastVisited: {...state.lastVisited, view: "unavailable"}}, "all", "", 5);
    assert(!stale.isResuming, "失效位置不得当作可继续");
    assert.equal(stale.active.lesson.id, catalog.lessons[0].id, "失效后回落到第一个可用课");
    assert.equal(dashboard.overview({...catalog, books: [], lessons: []}, emptyProgress(), "all", "", 5).active, undefined);
});

test("旧版单字成绩被忽略，不复活已删除的内容", ["progress:legacy-character"], ({load, fixture}) => {
    const {DashboardService} = load("src/application/dashboard-service.ts");
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {CurriculumService} = load("src/modules/curriculum/application/curriculum-service.ts");
    const {HttpCurriculumRepository} = load("src/modules/curriculum/infrastructure/http-curriculum-repository.ts");
    const {catalogLessons, filterCatalog, adjacentLessons} = load("src/modules/curriculum/domain/catalog-queries.ts");
    const catalog = fixture.catalog();
    const book = catalog.books.find(item => item.id === "ichinichi-jugofun-no-kanji-renshu");
    const legacy = ["kanji-intermediate-1", "kanji-intermediate-2"];
    const progress = {
        ...emptyProgress(),
        lastVisited: {unitId: legacy[0], view: "words", at: "2026-10-26T00:00:00Z"},
        results: Object.fromEntries(legacy.map((id, index) =>
            [`${id}:reading-test`, {correct: index, total: index + 1, at: "2026-10-26T00:00:00Z"}])),
    };
    const discovery = {lessons: catalogLessons, adjacent: adjacentLessons, search: filterCatalog};
    const curriculum = new CurriculumService(new HttpCurriculumRepository(async () => catalog));
    const overview = new DashboardService(discovery).overview(catalog, progress, "all", "", 10);

    assert(!overview.isResuming, "旧版单字 id 不再对应任何课");
    assert.equal(overview.active.lesson.id, catalog.lessons[0].id, "回落到第一门教材的第一课");
    assert.deepEqual(overview.recentResults, [], "历史单字成绩不得并进新分组");
    assert.throws(() => curriculum.select(catalog, legacy[0], "words"), /Unavailable/, "旧单字链接必须明确拒绝");
    assert.equal(curriculum.select(catalog, book.lessonIds[0], null).view, "kanji", "新汉字课默认落在汉字页签");
    assert.equal(book.lessonIds.length, 18, "1日15分の漢字練習 应分成 18 课");
});

/* ── 存储 ─────────────────────────────────────────────────── */

test("存储正常时写入成功并可被其他实例读到", ["storage:healthy"], ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressCommandService} = load("src/modules/learning-progress/application/progress-command-service.ts");
    const {box, repository} = memoryRepository(emptyProgress());
    const commands = new ProgressCommandService(new ProgressService(repository, CLOCK));
    return commands.mark(emptyProgress(), "w", "saved").then(outcome => {
        assert(outcome.persisted, "正常存储必须落盘成功");
        assert.equal(box.writes, 1);
        assert(box.value.words.w.saved);
    });
});

test("写入失败时保留内存态，恢复后补写", ["storage:quota", "concurrency:persist-failure"], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressCommandService} = load("src/modules/learning-progress/application/progress-command-service.ts");
    let available = false;
    const box = {value: emptyProgress()};
    const repository = {
        read: () => structuredClone(box.value),
        write: value => {
            if (!available) return false;
            box.value = structuredClone(value);
            return true;
        },
        exclusive: task => task(true),
    };
    const commands = new ProgressCommandService(new ProgressService(repository, CLOCK));

    const marked = await commands.mark(emptyProgress(), "queued", "saved");
    assert(!marked.persisted, "配额满时不得报告落盘成功");
    assert(marked.progress.words.queued.saved, "落盘失败必须保留内存态");

    const mastered = await commands.mark(marked.progress, "queued", "mastered");
    assert.equal(mastered.progress.words.queued.mastered, true, "后续命令必须建立在内存态之上");
    assert(!mastered.persisted);

    available = true;
    const restored = await commands.replace(mastered.progress);
    assert(restored.persisted, "存储恢复后必须补写");
    assert.deepEqual(box.value.words.queued, mastered.progress.words.queued);
});

test("存储里是损坏数据时保留可用部分并备份原文", ["storage:corrupt"], async context => {
    const {load} = context;
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressCommandService} = load("src/modules/learning-progress/application/progress-command-service.ts");
    const {BrowserProgressRepository} = load("src/modules/learning-progress/infrastructure/browser-progress-repository.ts");
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
    const damaged = JSON.stringify({
        version: 1,
        words: {good: {saved: true, mastered: false}, bad: {}},
        results: {bad: {total: 1, correct: 1, at: "bad"}},
    });
    values.set("akamonkai.progress.v1", damaged);
    context.globals({localStorage: storage, navigator: {}});

    const repository = new BrowserProgressRepository();
    const recovering = new ProgressService(repository, CLOCK);
    const recovered = recovering.load();
    assert.equal(recovering.problem(), "corrupt", "必须报告数据已损坏");
    assert(recovered.words.good.saved, "可用部分必须保留");
    assert(!Object.hasOwn(recovered.words, "bad"), "坏掉的条目必须丢弃");
    assert.equal(repository.recovery(), damaged, "原文必须备份以便人工排查");

    // 没有 Web Locks 时只能留在内存，不能冒险覆盖。
    const memoryOnly = await new ProgressCommandService(recovering).mark(recovered, "new", "saved");
    assert(memoryOnly.progress.words.new.saved);
    assert(!memoryOnly.persisted);
    assert.equal(values.get("akamonkai.progress.v1"), damaged, "没有锁支持时不得执行不安全的写入");

    // 有了锁才能写，并且写入前先把损坏原文备份出去。
    context.globals({navigator: {locks: {request: async (_, task) => task()}}});
    const saved = await new ProgressCommandService(recovering).mark(recovered, "new", "saved");
    assert(saved.persisted);
    assert.equal(recovering.problem(), "corrupt", "写入成功不应清除启动时的告警");
    assert.equal(values.get("akamonkai.progress.recovery.v1"), damaged);

    // 备份失败必须阻止覆盖原数据。
    values.set("akamonkai.progress.v1", damaged);
    storage.setItem = (key, value) => {
        if (key.endsWith("recovery.v1")) throw Error("Quota exceeded");
        values.set(key, value);
    };
    assert(!new BrowserProgressRepository().write(emptyProgress()), "备份失败必须阻止覆盖");
    assert.equal(values.get("akamonkai.progress.v1"), damaged);
});

test("存储为空时返回空进度而不是报错", ["storage:absent"], context => {
    const {load} = context;
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {BrowserProgressRepository} = load("src/modules/learning-progress/infrastructure/browser-progress-repository.ts");
    const values = new Map();
    context.globals({
        localStorage: {
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
        },
        navigator: {},
    });
    const progress = new ProgressService(new BrowserProgressRepository(), CLOCK);
    assert.deepEqual(progress.load(), emptyProgress());
    assert(!progress.problem(), "空存储不算异常");
});

test("存储完全不可用时降级为只读内存", ["storage:quota"], context => {
    const {load} = context;
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {BrowserProgressRepository} = load("src/modules/learning-progress/infrastructure/browser-progress-repository.ts");
    // 连 getItem 都抛错（隐私模式 / 被策略禁用）。
    context.globals({
        localStorage: {
            getItem: () => {
                throw Error("Storage unavailable");
            },
            setItem: () => {
                throw Error("Storage unavailable");
            },
        },
        navigator: {},
    });
    const repository = new BrowserProgressRepository();
    const progress = new ProgressService(repository, CLOCK);
    assert.deepEqual(progress.load(), emptyProgress());
    assert.equal(progress.problem(), "unavailable");
    assert(!repository.write(emptyProgress()), "不可写时必须返回 false 而不是抛错");
});

/* ── 并发 ─────────────────────────────────────────────────── */

test("两个陈旧页面并发写，两边的改动都保留", ["concurrency:stale-writes"], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressCommandService} = load("src/modules/learning-progress/application/progress-command-service.ts");
    const {box, repository} = memoryRepository(emptyProgress());
    const left = new ProgressCommandService(new ProgressService(repository, CLOCK));
    const right = new ProgressCommandService(new ProgressService(repository, CLOCK));
    // 两个页面各自拿着同一时刻的陈旧快照。
    const staleLeft = emptyProgress();
    const staleRight = emptyProgress();

    await Promise.all([
        left.mark(staleLeft, "a", "saved"),
        right.mark(staleRight, "b", "mastered"),
    ]);
    assert(box.value.words.a.saved && box.value.words.b.mastered, "后写不得覆盖前写");
});

test("排队的连续操作基于最新值执行，不是各自的快照", ["concurrency:queued-toggles"], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressCommandService} = load("src/modules/learning-progress/application/progress-command-service.ts");
    const {box, repository} = memoryRepository(emptyProgress());
    const commands = new ProgressCommandService(new ProgressService(repository, CLOCK));
    const stale = emptyProgress();

    const [first, second] = await Promise.all([
        commands.mark(stale, "queued", "saved"),
        commands.mark(stale, "queued", "saved"),
    ]);
    assert(first.progress.words.queued.saved);
    assert(!second.progress.words.queued.saved, "第二次点击必须基于第一次的结果（切换而非重复置位）");
    assert(!box.value.words.queued.saved, "最终落盘状态应与第二次一致");
});

/* ── 导入导出 ─────────────────────────────────────────────── */

const fileStore = (content, {size, fail} = {}) => {
    const calls = {reads: 0, downloads: []};
    return {
        calls,
        store: {
            size: () => size ?? content.length,
            read: async () => {
                calls.reads++;
                if (fail) throw Error(fail);
                return content;
            },
            download: value => calls.downloads.push(value),
        },
    };
};

test("导入合法文件后合并到当前进度", ["import:imported"], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressTransferService} = load("src/modules/learning-progress/application/progress-transfer-service.ts");
    const {box, repository} = memoryRepository(emptyProgress());
    const progress = new ProgressService(repository, CLOCK);
    const backup = progress.export(progress.mark(emptyProgress(), "imported", "saved"));
    const {store} = fileStore(backup);
    const outcome = await new ProgressTransferService(progress, store).import({}, emptyProgress());
    assert.equal(outcome.status, "imported");
    assert(outcome.progress.words.imported.saved);
    void box;
});

test("导入更旧的备份不会复活已删除的标记", ["import:older-backup"], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressTransferService} = load("src/modules/learning-progress/application/progress-transfer-service.ts");
    const {repository} = memoryRepository(emptyProgress());
    const progress = new ProgressService(repository, CLOCK);

    let current = progress.mark(emptyProgress(), "a", "saved");
    const oldBackup = progress.export(current);
    // 之后取消了标记并记录了一次成绩。
    current = progress.mark(current, "a", "saved");
    current = progress.record(current, "test", 3, 4);
    const merged = await new ProgressTransferService(progress, fileStore(oldBackup).store).import({}, current);
    assert.equal(merged.status, "imported");
    assert(!merged.progress.words.a.saved, "旧备份不得复活已取消的标记");
    assert.deepEqual(merged.progress.results.test, current.results.test, "成绩取更新的那一份");

    const olderResult = {
        ...emptyProgress(),
        results: {test: {correct: 1, total: 2, at: "2025-01-01T00:00:00Z"}},
    };
    const mergedOlder = await new ProgressTransferService(progress, fileStore(JSON.stringify(olderResult)).store)
        .import({}, current);
    assert.deepEqual(mergedOlder.progress.results.test, current.results.test, "更旧的成绩不得覆盖当前成绩");
});

test("导入超过体积上限的文件时直接拒绝，不读取内容", ["import:oversized"], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressTransferService} = load("src/modules/learning-progress/application/progress-transfer-service.ts");
    const {repository} = memoryRepository(emptyProgress());
    const progress = new ProgressService(repository, CLOCK);
    const {calls, store} = fileStore("{}", {size: 2e6 + 1});
    assert.deepEqual(await new ProgressTransferService(progress, store).import({}, emptyProgress()),
        {status: "invalid-file"});
    assert.equal(calls.reads, 0, "超限文件根本不应被读取");
});

test("读取文件抛错时返回 invalid-file 而不是崩溃", ["import:read-failure"], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressTransferService} = load("src/modules/learning-progress/application/progress-transfer-service.ts");
    const {repository} = memoryRepository(emptyProgress());
    const progress = new ProgressService(repository, CLOCK);
    const outcome = await new ProgressTransferService(progress, fileStore("", {fail: "read failed"}).store)
        .import({}, emptyProgress());
    assert.deepEqual(outcome, {status: "invalid-file"});
});

test("畸形 JSON 与错误版本号都算无效文件", ["import:invalid-file", "import:malformed"], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressTransferService} = load("src/modules/learning-progress/application/progress-transfer-service.ts");
    const {repository} = memoryRepository(emptyProgress());
    const progress = new ProgressService(repository, CLOCK);
    const transfer = (content) => new ProgressTransferService(progress, fileStore(content).store);

    assert.deepEqual(await transfer("{bad").import({}, emptyProgress()), {status: "invalid-file"});
    assert.deepEqual(await transfer('{"version":1,"words":[],"results":{}}').import({}, emptyProgress()),
        {status: "invalid-file"}, "字段类型不对必须拒绝");
    assert.deepEqual(await transfer(JSON.stringify({...emptyProgress(), version: 99})).import({}, emptyProgress()),
        {status: "invalid-file"}, "版本号不认识必须拒绝");
    assert.throws(() => progress.import("{bad", emptyProgress()), "直接导入畸形 JSON 必须抛错");
});

test("导出进度文件交给文件端口", ["export:success"], ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressTransferService} = load("src/modules/learning-progress/application/progress-transfer-service.ts");
    const {repository} = memoryRepository(emptyProgress());
    const progress = new ProgressService(repository, CLOCK);
    const {calls, store} = fileStore("");
    const state = progress.mark(emptyProgress(), "w", "saved");
    new ProgressTransferService(progress, store).export(state);
    assert.deepEqual(calls.downloads, [progress.export(state)], "导出内容必须与序列化结果一致");
});

test("下载被浏览器拦截时仍然释放 Blob URL", ["export:blocked"], context => {
    const {load} = context;
    const {BrowserProgressFileStore} = load("src/modules/learning-progress/infrastructure/browser-progress-file-store.ts");
    const events = [];
    let clickFails = false;
    class SelectedFile {
        constructor(size, content) {
            this.size = size;
            this.content = content;
        }

        async text() {
            return this.content;
        }
    }
    context.globals({
        File: SelectedFile,
        document: {
            createElement: tag => {
                assert.equal(tag, "a");
                return {
                    click: () => {
                        events.push("click");
                        if (clickFails) throw Error("blocked download");
                    },
                };
            },
        },
    });
    context.url({
        createObjectURL: blob => {
            assert.equal(blob.type, "application/json");
            events.push("create");
            return "blob:progress";
        },
        revokeObjectURL: url => {
            assert.equal(url, "blob:progress");
            events.push("revoke");
        },
    });

    const store = new BrowserProgressFileStore();
    const handle = new SelectedFile(25, "progress content");
    assert.equal(store.size(handle), 25);
    assert.throws(() => store.size({size: 25}), /Invalid progress file/);
    store.download("{}");
    assert.deepEqual(events, ["create", "click", "revoke"]);

    events.length = 0;
    clickFails = true;
    assert.throws(() => store.download("{}"), /blocked download/);
    assert.deepEqual(events, ["create", "click", "revoke"], "下载失败也必须释放 URL");
});

test("读取进度文件走文件端口，非文件对象被拒绝", ["export:success", "import:read-failure"], async context => {
    const {load} = context;
    const {BrowserProgressFileStore} = load("src/modules/learning-progress/infrastructure/browser-progress-file-store.ts");
    class SelectedFile {
        constructor(content) {
            this.size = content.length;
            this.content = content;
        }

        async text() {
            return this.content;
        }
    }
    context.globals({File: SelectedFile});
    const store = new BrowserProgressFileStore();
    assert.equal(await store.read(new SelectedFile("abc")), "abc");
    // 校验发生在返回 Promise 之前，所以这里是同步抛错而不是 reject。
    assert.throws(() => store.read({size: 1}), /Invalid progress file/);
});

/* ── 清空学习记录 ─────────────────────────────────────────── */

/** 一份带着收藏、成绩、上次位置的进度。 */
function studiedProgress(progress, emptyProgress) {
    let state = progress.mark(emptyProgress(), "word.1", "saved");
    state = progress.mark(state, "word.1", "mastered");
    state = progress.record(state, "minna-1:grammar-test", 5, 6);
    return progress.visit(state, "minna-1", "words");
}

test("清空后记录全无，内存与其他页面里的旧记录不会合并回来", [], async ({load}) => {
    const {emptyProgress, validateProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressCommandService} = load("src/modules/learning-progress/application/progress-command-service.ts");
    const progress = new ProgressService(memoryRepository(emptyProgress()).repository, CLOCK);
    const studied = studiedProgress(progress, emptyProgress);
    const {box, repository} = memoryRepository(studied);
    const service = new ProgressService(repository, CLOCK);
    const commands = new ProgressCommandService(service);

    const cleared = await commands.clear(studied);
    assert(cleared.persisted, "清空必须写进存储");
    assert.deepEqual(cleared.progress, {version: 1, words: {}, results: {}, generation: 1});
    assert.deepEqual(box.value, cleared.progress, "存储里也必须是空的");
    assert(validateProgress(box.value));

    // 页面自己把结果并回内存状态（StudyContext.applyProgress 就是这么做的）。
    assert.deepEqual(service.merge(studied, cleared.progress), cleared.progress, "内存里的旧记录不得回流");
    assert.deepEqual(service.merge(cleared.progress, studied), cleared.progress, "合并顺序反过来也一样");

    // 另一个页面还拿着清空前的快照，在上面再做一次标记。
    const stale = await new ProgressCommandService(new ProgressService(repository, CLOCK)).mark(studied, "word.2", "saved");
    assert.deepEqual(Object.keys(stale.progress.words), ["word.2"], "陈旧页面只能留下清空之后的新操作");
    assert.deepEqual(stale.progress.results, {});
    assert.equal(stale.progress.lastVisited, undefined);
    assert.equal(box.value.generation, 1);

    // 再清空一次，代数继续往上走。
    assert.equal((await commands.clear(box.value)).progress.generation, 2);
});

test("清空之后仍能用清空前导出的备份恢复", [], async ({load}) => {
    const {emptyProgress} = load("src/modules/learning-progress/domain/progress.ts");
    const {ProgressService} = load("src/modules/learning-progress/application/progress-service.ts");
    const {ProgressCommandService} = load("src/modules/learning-progress/application/progress-command-service.ts");
    const scratch = new ProgressService(memoryRepository(emptyProgress()).repository, CLOCK);
    const studied = studiedProgress(scratch, emptyProgress);
    const backup = scratch.export(studied);
    const {box, repository} = memoryRepository(studied);
    const service = new ProgressService(repository, CLOCK);
    const commands = new ProgressCommandService(service);

    const cleared = (await commands.clear(studied)).progress;
    // 备份是第 0 代，现在是第 1 代：不移植的话会被整个丢掉。
    const imported = service.import(backup, cleared);
    assert.equal(imported.generation, 1, "导入的记录要并进当前这一代");
    assert.deepEqual(imported.words, studied.words);
    assert.deepEqual(imported.results, studied.results);
    assert.deepEqual(imported.lastVisited, studied.lastVisited);

    const saved = await commands.replace(imported);
    assert(saved.persisted);
    assert.deepEqual(box.value.words, studied.words, "恢复的记录必须写进存储");
    assert.deepEqual(service.merge(cleared, saved.progress).words, studied.words, "页面内存合并后也要看得到");
});

test("代数必须是非负整数，坏值在恢复时丢弃", [], ({load}) => {
    const {emptyProgress, validateProgress, recoverProgress} = load("src/modules/learning-progress/domain/progress.ts");
    for (const generation of [-1, 1.5, "1", null])
        assert(!validateProgress({...emptyProgress(), generation}), `非法代数必须拒绝：${generation}`);
    assert(validateProgress({...emptyProgress(), generation: 3}));
    assert.equal(recoverProgress({...emptyProgress(), generation: 3, words: []}).generation, 3, "合法代数在恢复时保留");
    assert.equal(recoverProgress({...emptyProgress(), generation: -1}).generation, undefined);
});

test("清空学习记录时删掉全部测验草稿，不碰其他设置", [], context => {
    const entries = new Map([
        ["akamonkai.assessment-draft.v1:minna-1", "{}"],
        ["akamonkai.assessment-draft.v1:minna-2", "{}"],
        ["akamonkai.theme", "dark"],
        ["akamonkai.progress.v1", "{}"],
    ]);
    context.globals({
        localStorage: {
            get length() {
                return entries.size;
            },
            key: index => [...entries.keys()][index] ?? null,
            getItem: key => entries.get(key) ?? null,
            setItem: (key, value) => entries.set(key, String(value)),
            removeItem: key => entries.delete(key),
        },
    });
    const {BrowserDraftRepository} = context.load("src/modules/assessment/infrastructure/browser-draft-repository.ts");
    const {DraftService} = context.load("src/modules/assessment/application/draft-service.ts");
    assert(new DraftService(new BrowserDraftRepository()).clearAll());
    assert.deepEqual([...entries.keys()], ["akamonkai.theme", "akamonkai.progress.v1"], "只删草稿，主题等设置保留");
});
