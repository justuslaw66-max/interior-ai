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
const presentationWorkspaceSource = readFileSync(
  join(process.cwd(), "lib/useDesignPagePresentationWorkspaceRegistration.ts"),
  "utf8"
);
const editorChromeControllerSource = readFileSync(
  join(process.cwd(), "lib/useDesignPageEditorChromeController.ts"),
  "utf8"
);

assert.match(
  commandBarSource,
  /data-testid="save-status"/,
  "Save status should render inside the editor command bar."
);
assert.match(
  commandBarSource,
  /data-testid="save-status"[\s\S]*?className=\{`hidden h-7 min-w-0[\s\S]*?md:flex/,
  "Save status should be a compact command-bar chip that avoids crowding smaller screens."
);
assert.match(
  commandBarSource,
  /data-testid="save-status-retry"/,
  "Save status retry should stay available from the command bar."
);
assert.match(
  commandBarSource,
  /data-last-successful-save-at=/,
  "Save status should expose the exact last successful save time."
);
assert.match(
  commandBarSource,
  /role="status"[\s\S]*?aria-live="polite"/,
  "Save progress and failures should be announced without stealing focus."
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
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?isSaving:\s*persistence\.state\.persistence\.isSaving,[\s\S]*?saveStatus:\s*persistence\.state\.persistence\.saveStatus[\s\S]*?persistence:\s*\{[\s\S]*?saveDesignToCloud:[\s\S]*?persistence\.actions\.persistence\.saveDesignToCloud,[\s\S]*?retrySaveStatus:\s*persistence\.actions\.persistence\.retrySaveStatus/,
  "The presentation workspace should inject save state and persistence collaborators into the presentation/QA facade."
);
assert.match(
  editorChromeControllerSource,
  /const save = async \(\) => \{[\s\S]*?!commandState\.isAuthed[\s\S]*?openGuestPrompt\("save", \(\) => \{\}\)[\s\S]*?await actions\.persistence\.saveDesignToCloud\(\)[\s\S]*?actions\.showToast\("Saved to cloud"\)[\s\S]*?onSave: save,[\s\S]*?onRetrySaveStatus: actions\.persistence\.retrySaveStatus/,
  "The chrome controller should preserve guest/cloud save and retry behavior at the typed command boundary."
);
assert.doesNotMatch(
  designPageSource,
  /<EditorCommandBar\b/,
  "The workspace should not bypass the design-page command wrapper."
);

console.log("Command bar save status checks passed.");
