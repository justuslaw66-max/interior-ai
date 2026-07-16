import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandBarSource = readFileSync(
  join(process.cwd(), "components/editor/EditorCommandBar.tsx"),
  "utf8"
);
const designPageCommandBarSource = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/DesignPageEditorCommandBar.tsx"
  ),
  "utf8"
);
const designPageSource = readFileSync(
  join(process.cwd(), "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);

assert.match(
  commandBarSource,
  /data-testid="save-status"/,
  "Save status should render inside the editor command bar."
);
assert.match(
  commandBarSource,
  /data-testid="save-status"[\s\S]*?className=\{`hidden h-9 min-w-0[\s\S]*?md:flex/,
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
assert.match(
  designPageCommandBarSource,
  /<EditorCommandBar[\s\S]*?\{\.\.\.state\.commandBar\}[\s\S]*?\{\.\.\.actions\.commandBar\}[\s\S]*?dark=\{configuration\.dark\}/,
  "The design-page command wrapper should forward save state and actions to the command-bar leaf."
);
assert.match(
  designPageSource,
  /<DesignPageEditorCommandBar[\s\S]*?commandBar:\s*\{[\s\S]*?isSaving,[\s\S]*?saveStatus,[\s\S]*?actions=\{\{[\s\S]*?onSave:\s*async\s*\(\)\s*=>[\s\S]*?onRetrySaveStatus:\s*retrySaveStatus/,
  "The workspace should supply save state and persistence actions through the typed command-wrapper boundary."
);
assert.doesNotMatch(
  designPageSource,
  /<EditorCommandBar\b/,
  "The workspace should not bypass the design-page command wrapper."
);

console.log("Command bar save status checks passed.");
