import fs from "node:fs";
import path from "node:path";
import { compileUnits } from "./content-library.mjs";
const publicRoot = path.resolve("public");
const output = path.resolve(publicRoot, "content");
if (path.dirname(output) !== publicRoot || path.basename(output) !== "content")
  throw new Error("Invalid generated content directory");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync("public/content/units", { recursive: true });
fs.copyFileSync("data/content/catalog.json", "public/content/catalog.json");
for (const unit of compileUnits())
  fs.writeFileSync(
    "public/content/units/" + unit.id + ".json",
    JSON.stringify(unit),
  );

fs.copyFileSync("data/content/localization/ui.json", "public/content/ui.json");
fs.copyFileSync("data/content/word-aliases.json", "public/content/word-aliases.json");
