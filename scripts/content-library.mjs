import fs from "node:fs";
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export function compileUnits() {
  const words = read("data/content/vocabulary.json"),
    texts = read("data/content/localization/learning.json"),
    aliases = read("data/content/word-aliases.json");
  const lessons = fs.readdirSync("data/content/units").map((file) => {
    const source = read("data/content/units/" + file),
      refs = new Set();
    const { wordRefs, ...lesson } = source;
    lesson.words = wordRefs.map(({ wordId, ...overrides }) => {
      if (!words[wordId]) throw Error("Missing word " + wordId);
      const word = { ...words[wordId], ...overrides };
      return aliases[word.id] ? { ...word, progressId: aliases[word.id] } : word;
    });
    const scan = (x) => {
      if (typeof x === "string" && texts[x]) refs.add(x);
      else if (Array.isArray(x)) x.forEach(scan);
      else if (x && typeof x === "object") Object.values(x).forEach(scan);
    };
    scan(lesson);
    lesson.texts = Object.fromEntries([...refs].map((id) => [id, texts[id]]));
    return lesson;
  });
  // The reference owns all its text and examples. Never resolve it against
  // textbook vocabulary or localization data, or regenerate it from lessons.
  return [...lessons, read("data/content/reference/verbs.json")];
}
