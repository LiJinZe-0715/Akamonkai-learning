import { validateProgress, type Progress, type WordMark } from "./progress";
export class LearningProgress {
  constructor(private readonly state: Progress) {
    if (!validateProgress(state)) throw new Error("Invalid progress");
  }
  mark(id: string, field: keyof WordMark, at: string): Progress {
    if (!id.trim()) throw new Error("Invalid word ID");
    if (!Number.isFinite(Date.parse(at))) throw new Error("Invalid word timestamp");
    const before = this.state.words[id] ?? { saved: false, mastered: false };
    return { ...this.state, words: { ...this.state.words, [id]: { ...before, [field]: !before[field] } },
      wordUpdatedAt: { ...this.state.wordUpdatedAt, [id]: { ...this.state.wordUpdatedAt?.[id], [field]: at } } };
  }
  record(id: string, correct: number, total: number, at: string): Progress {
    if (!id.trim() || !Number.isInteger(total) || total <= 0 || !Number.isInteger(correct) || correct < 0 || correct > total || !Number.isFinite(Date.parse(at)))
      throw new Error("Invalid assessment result");
    return { ...this.state, results: { ...this.state.results, [id]: { correct, total, at } } };
  }
  visit(unitId: string, view: string, at: string): Progress {
    if (!unitId.trim() || !view.trim() || !Number.isFinite(Date.parse(at)))
      throw new Error("Invalid lesson visit");
    return { ...this.state, lastVisited: { unitId, view, at } };
  }
  merge(next: Progress): Progress {
    if (!validateProgress(next)) throw new Error("Invalid progress file");
    const previousVisit = this.state.lastVisited;
    const incomingVisit = next.lastVisited;
    const lastVisited = incomingVisit && (!previousVisit || Date.parse(incomingVisit.at) > Date.parse(previousVisit.at))
      ? incomingVisit : previousVisit;
    const words = { ...this.state.words }, wordUpdatedAt = { ...this.state.wordUpdatedAt }, results = { ...this.state.results };
    for (const [id, incoming] of Object.entries(next.words)) {
      const previous = Object.hasOwn(words, id) ? words[id] : undefined;
      const mark = { ...(previous ?? { saved: false, mastered: false }) };
      for (const field of ["saved", "mastered"] as const) {
        const oldTime = this.state.wordUpdatedAt?.[id]?.[field], newTime = next.wordUpdatedAt?.[id]?.[field];
        if (!previous || (newTime && (!oldTime || Date.parse(newTime) > Date.parse(oldTime)))) {
          mark[field] = incoming[field];
          if (newTime) wordUpdatedAt[id] = { ...wordUpdatedAt[id], [field]: newTime };
        }
      }
      words[id] = mark;
    }
    for (const [id, result] of Object.entries(next.results)) {
      if (!Object.hasOwn(results, id) || Date.parse(result.at) > Date.parse(results[id].at)) results[id] = result;
    }
    return { ...this.state, ...(lastVisited ? { lastVisited } : {}), words, results,
      ...(Object.keys(wordUpdatedAt).length ? { wordUpdatedAt } : {}) };
  }
  rekey(aliases: Readonly<Record<string, string>>): Progress {
    if (!Object.keys(aliases).length) return this.state;
    const words: Progress["words"] = {}, wordUpdatedAt: NonNullable<Progress["wordUpdatedAt"]> = {};
    for (const [id, incoming] of Object.entries(this.state.words)) {
      const canonical = Object.hasOwn(aliases, id) ? aliases[id] : id;
      const mark = { ...(words[canonical] ?? { saved: false, mastered: false }) };
      for (const field of ["saved", "mastered"] as const) {
        const oldTime = wordUpdatedAt[canonical]?.[field], newTime = this.state.wordUpdatedAt?.[id]?.[field];
        if (newTime && (!oldTime || Date.parse(newTime) > Date.parse(oldTime))) {
          mark[field] = incoming[field];
          wordUpdatedAt[canonical] = { ...wordUpdatedAt[canonical], [field]: newTime };
        } else if (!oldTime && !newTime) mark[field] ||= incoming[field];
      }
      words[canonical] = mark;
    }
    return { ...this.state, words, ...(Object.keys(wordUpdatedAt).length ? { wordUpdatedAt } : { wordUpdatedAt: undefined }) };
  }
}
