import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandBarSource = readFileSync(
  join(process.cwd(), "components/editor/EditorCommandBar.tsx"),
  "utf8"
);
const designPageSource = readFileSync(
  join(process.cwd(), "app/design/page.tsx"),
  "utf8"
);

assert.match(
  commandBarSource,
  /data-testid="save-status"/,
  "Save status should render inside the editor command bar."
);
assert.match(
  commandBarSource,
  /max-w-\[240px\][\s\S]*lg:flex/,
  "Save status should be a compact command-bar chip that avoids crowding smaller screens."
);
assert.match(
  commandBarSource,
  /data-testid="save-status-retry"/,
  "Save status retry should stay available from the command bar."
);
assert.doesNotMatch(
  designPageSource,
  /fixed right-4 top-16[\s\S]*data-testid="save-status"/,
  "Save status should not render as a floating canvas overlay."
);

console.log("Command bar save status checks passed.");
