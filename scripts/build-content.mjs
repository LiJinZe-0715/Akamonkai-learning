import fs from "node:fs";
import path from "node:path";
import {buildCatalog, characterSummary, compileUnits, kanjiBookIds} from "./compile-content.mjs";

const publicRoot = path.resolve("public");
const output = path.resolve(publicRoot, "content");
if (path.dirname(output) !== publicRoot || path.basename(output) !== "content")
    throw new Error("Invalid generated content directory");
fs.rmSync(output, {recursive: true, force: true});
fs.mkdirSync("public/content/units", {recursive: true});
const units = compileUnits();
fs.writeFileSync("public/content/catalog.json", JSON.stringify(buildCatalog(units)));
for (const bookId of kanjiBookIds)
    fs.writeFileSync("public/content/" + bookId + ".json", JSON.stringify({schemaVersion: 1, bookId, units: units.filter(unit => unit.bookId === bookId)}));
for (const unit of units.filter(unit => !kanjiBookIds.includes(unit.bookId))) {
    const {characters, ...group} = unit;
    fs.writeFileSync(
        "public/content/units/" + unit.id + ".json",
        JSON.stringify(characters ? {...group, characters: characters.map(characterSummary)} : unit),
    );
    for (const character of characters ?? [])
        fs.writeFileSync("public/content/units/" + character.id + ".json", JSON.stringify(character));
}

fs.copyFileSync("data/content/localization/ui.json", "public/content/ui.json");
fs.copyFileSync("data/content/word-aliases.json", "public/content/word-aliases.json");
