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

const saveStatusTestIdIndex = commandBarSource.indexOf(
  'data-testid="save-status"'
);
assert.notEqual(
  saveStatusTestIdIndex,
  -1,
  "Save status should render inside the editor command bar."
);
const saveStatusTagStart = commandBarSource.lastIndexOf("<", saveStatusTestIdIndex);
const saveStatusTagEnd = commandBarSource.indexOf(">", saveStatusTestIdIndex);
assert.ok(
  saveStatusTagStart >= 0 && saveStatusTagEnd > saveStatusTagStart,
  "Save status should remain a concrete command-bar element."
);
const saveStatusOpeningTag = commandBarSource.slice(
  saveStatusTagStart,
  saveStatusTagEnd + 1
);
assert.match(
  saveStatusOpeningTag,
  /^<[A-Za-z][\w.-]*\s/,
  "Save status should remain on one concrete opening element."
);
const saveStatusClassName = saveStatusOpeningTag.match(
  /className=\{`([\s\S]*?)`\}/
)?.[1];
assert.ok(
  saveStatusClassName,
  "Save status should expose its responsive command-bar geometry."
);
assert.equal(
  [...saveStatusClassName.matchAll(/\$\{/g)].length,
  2,
  "Save status geometry should have exactly two statically audited class contributors."
);
assert.match(
  saveStatusClassName,
  /\$\{\s*saveStatus\.canRetry\s*\?\s*"shrink-0"\s*:\s*""\s*\}\s*\$\{\s*getSaveStatusClassName\(\s*saveStatus\.tone,\s*dark\s*\)\s*\}/,
  "Save status dynamic classes should stay limited to shrink behavior and tone styling."
);
const saveStatusToneHelperStart = commandBarSource.indexOf(
  "function getSaveStatusClassName"
);
const saveStatusToneHelperEnd = commandBarSource.indexOf(
  "function getSaveStatusDotClassName",
  saveStatusToneHelperStart
);
assert.ok(
  saveStatusToneHelperStart >= 0 &&
    saveStatusToneHelperEnd > saveStatusToneHelperStart,
  "Save status tone classes should remain statically inspectable."
);
const saveStatusToneHelperSource = commandBarSource.slice(
  saveStatusToneHelperStart,
  saveStatusToneHelperEnd
);
const saveStatusToneClassValues = [
  ...saveStatusToneHelperSource.matchAll(/\breturn\s+"([^"]*)"/g),
].map((match) => match[1]);
assert.equal(
  saveStatusToneClassValues.length,
  saveStatusToneHelperSource.match(/\breturn\b/g)?.length ?? 0,
  "Every save-status tone return should remain a static class string."
);
const saveStatusClassTokens = new Set(
  [
    saveStatusClassName.replace(/\$\{[\s\S]*?\}/g, " "),
    ...saveStatusToneClassValues,
  ]
    .flatMap((classNames) => classNames.trim().split(/\s+/))
    .filter(Boolean)
);

const displayUtilities = new Set([
  "block",
  "contents",
  "flex",
  "flow-root",
  "grid",
  "hidden",
  "inline",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "inline-table",
  "list-item",
  "table",
  "table-caption",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row",
  "table-row-group",
]);
const tailwindUtility = (token: string) =>
  (token.split(":").at(-1) ?? token).replace(/^!|!$/g, "");
const isDisplayToken = (token: string) =>
  displayUtilities.has(tailwindUtility(token)) || /\[display:/.test(token);
const isHeightToken = (token: string) =>
  /^(?:h|min-h|max-h|size)-/.test(tailwindUtility(token)) ||
  /\[(?:height|min-height|max-height):/.test(token);
const saveStatusDisplayTokens = [...saveStatusClassTokens]
  .filter(isDisplayToken)
  .sort();
const saveStatusHeightTokens = [...saveStatusClassTokens]
  .filter(isHeightToken)
  .sort();

for (const override of ["max-md:flex", "md:h-7", "min-h-9"] as const) {
  assert.ok(
    isDisplayToken(override) || isHeightToken(override),
    `Geometry guard should recognize the ${override} override.`
  );
}

assert.deepEqual(
  saveStatusDisplayTokens,
  ["hidden", "md:flex"].sort(),
  "Save status should stay hidden below the desktop breakpoint and render from md upward."
);
assert.deepEqual(
  saveStatusHeightTokens,
  ["h-[30px]"],
  "Save status should use the exact 30px desktop command-bar height."
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
assert.ok(
  /\brole="status"/.test(saveStatusOpeningTag) &&
    /\baria-live="polite"/.test(saveStatusOpeningTag),
  "Desktop save progress and failures should be announced without stealing focus."
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
