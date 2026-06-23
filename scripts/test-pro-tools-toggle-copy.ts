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
assert.match(
  source,
  /data-testid="designer-mode-toggle"[\s\S]*"hidden h-10 w-40 shrink-0 items-center justify-center/,
  "Pro tools toggle should keep a fixed footprint when entering and exiting Pro tools"
);
assert.match(
  source,
  /<div className="hidden h-10 w-28 shrink-0 sm:block">[\s\S]*data-testid="present-mode"[\s\S]*<span className="block h-10 w-full" aria-hidden="true" \/>/,
  "Preview should reserve a stable slot so Pro tools and Load do not shift"
);
assert.doesNotMatch(
  source,
  /Designer on|Exit Designer Mode|Enter Designer Mode/,
  "Pro tools toggle should not mix Designer wording with Pro tools wording"
);

console.log("Pro tools toggle copy checks passed");
