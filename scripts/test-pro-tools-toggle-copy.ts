import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "components/editor/EditorCommandBar.tsx"),
  "utf8"
);

assert.match(
  source,
  /title=\{isDesigner \? "Exit Pro tools" : "Enter Pro tools"\}/,
  "Pro tools toggle should use matching enter/exit titles"
);
assert.match(
  source,
  /\{isDesigner \? "Exit Pro tools" : "Pro tools"\}/,
  "Pro tools toggle should use matching active/inactive labels"
);
assert.doesNotMatch(
  source,
  /Designer on|Exit Designer Mode|Enter Designer Mode/,
  "Pro tools toggle should not mix Designer wording with Pro tools wording"
);

console.log("Pro tools toggle copy checks passed");
