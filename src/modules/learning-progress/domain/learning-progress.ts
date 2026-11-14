import {type Progress, validateProgress, type WordMark} from "./progress";

const generationOf = (progress: Progress) => progress.generation ?? 0;

export class LearningProgress {
    constructor(private readonly state: Progress) {
        if (!validateProgress(state)) throw new Error("Invalid progress");
    }

    mark(id: string, field: keyof WordMark, at: string): Progress {
        if (!id.trim()) throw new Error("Invalid word ID");
        if (!Number.isFinite(Date.parse(at))) throw new Error("Invalid word timestamp");
        const before = this.state.words[id] ?? {saved: false, mastered: false};
        return {
            ...this.state, words: {...this.state.words, [id]: {...before, [field]: !before[field]}},
            wordUpdatedAt: {...this.state.wordUpdatedAt, [id]: {...this.state.wordUpdatedAt?.[id], [field]: at}}
        };
    }

    record(id: string, correct: number, total: number, at: string): Progress {
        if (!id.trim() || !Number.isInteger(total) || total <= 0 || !Number.isInteger(correct) || correct < 0 || correct > total || !Number.isFinite(Date.parse(at)))
            throw new Error("Invalid assessment result");
        return {...this.state, results: {...this.state.results, [id]: {correct, total, at}}};
    }

    visit(unitId: string, view: string, at: string): Progress {
        if (!unitId.trim() || !view.trim() || !Number.isFinite(Date.parse(at)))
            throw new Error("Invalid lesson visit");
        return {...this.state, lastVisited: {unitId, view, at}};
    }

    /** 清空：代数 +1，记录全部去掉。 */
    clear(): Progress {
        return {version: 1, words: {}, results: {}, generation: generationOf(this.state) + 1};
    }

    /**
     * 把导入的备份并进当前这一代。
     * 备份可能是清空之前导出的，代数更低；不移植的话，合并会把它整个丢掉，清空后就再也恢复不了。
     */
    adopt(imported: Progress): Progress {
        if (!validateProgress(imported)) throw new Error("Invalid progress file");
        const {generation: _ignored, ...records} = imported;
        return this.merge(generationOf(this.state) ? {...records, generation: generationOf(this.state)} : records);
    }

    merge(next: Progress): Progress {
        if (!validateProgress(next)) throw new Error("Invalid progress file");
        // 代数不同，说明中间清空过：新一代整体胜出，旧一代的记录一条都不留。
        if (generationOf(next) !== generationOf(this.state))
            return generationOf(next) > generationOf(this.state) ? next : this.state;
        const previousVisit = this.state.lastVisited;
        const incomingVisit = next.lastVisited;
        const lastVisited = incomingVisit && (!previousVisit || Date.parse(incomingVisit.at) > Date.parse(previousVisit.at))
            ? incomingVisit : previousVisit;
        const words = {...this.state.words}, wordUpdatedAt = {...this.state.wordUpdatedAt},
            results = {...this.state.results};
        for (const [id, incoming] of Object.entries(next.words)) {
            const previous = Object.hasOwn(words, id) ? words[id] : undefined;
            const mark = {...(previous ?? {saved: false, mastered: false})};
            for (const field of ["saved", "mastered"] as const) {
                const oldTime = this.state.wordUpdatedAt?.[id]?.[field], newTime = next.wordUpdatedAt?.[id]?.[field];
                // 只有 incoming 带时间戳、且确实更新时才覆盖。没有时间戳说明是旧格式数据，
                // 判断不了新旧，宁可保留当前记录——否则导入一份老备份会把新标记降级。
                if (!previous || (newTime && (!oldTime || Date.parse(newTime) > Date.parse(oldTime)))) {
                    mark[field] = incoming[field];
                    if (newTime) wordUpdatedAt[id] = {...wordUpdatedAt[id], [field]: newTime};
                }
            }
            words[id] = mark;
        }
        for (const [id, result] of Object.entries(next.results)) {
            if (!Object.hasOwn(results, id) || Date.parse(result.at) > Date.parse(results[id].at)) results[id] = result;
        }
        return {
            ...this.state, ...(lastVisited ? {lastVisited} : {}), words, results,
            ...(Object.keys(wordUpdatedAt).length ? {wordUpdatedAt} : {})
        };
    }

}
