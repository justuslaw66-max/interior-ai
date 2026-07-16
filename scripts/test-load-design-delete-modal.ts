import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const designPagePath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageWorkspace.tsx"
);
const source = fs.readFileSync(designPagePath, "utf8");
const controllerPath = path.join(process.cwd(), "lib", "useDesignPagePersistence.ts");
const controllerSource = fs.readFileSync(controllerPath, "utf8");
const dialogPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "MyDesignsDialog.tsx"
);
const dialogSource = fs.readFileSync(dialogPath, "utf8");

assert.match(
  controllerSource,
  /const \[selectedSavedDesignIds, setSelectedSavedDesignIds\] = useState<Set<string>>\([\s\S]*?new Set\(\)[\s\S]*?\);/,
  "The load-design modal should track selected saved designs for bulk actions."
);

assert.match(
  controllerSource,
  /const \[deletingDesignIds, setDeletingDesignIds\] = useState<Set<string>>\(new Set\(\)\);/,
  "The load-design modal should track all saved designs currently being deleted."
);

assert.match(
  controllerSource,
  /const \[pendingDeleteDesign, setPendingDeleteDesign\][\s\S]*?useState<PendingSavedDesignDelete \| null>/,
  "The load-design modal should keep pending batch delete metadata for confirmation copy."
);

assert.match(
  controllerSource,
  /const toggleSavedDesignSelection = useCallback\(\(id: string\) => \{[\s\S]*?setSelectedSavedDesignIds/,
  "Saved designs should support individual checkbox selection."
);

assert.match(
  controllerSource,
  /const toggleAllSavedDesignSelection = useCallback\(\(\) => \{[\s\S]*?setSelectedSavedDesignIds\([\s\S]*?allSavedDesignsSelected \? new Set\(\) : new Set\(allSavedDesignIds\)/,
  "Saved designs should support selecting every row."
);

assert.match(
  controllerSource,
  /const handleDeleteSavedDesign = useCallback\(async \(\) => \{[\s\S]*?for \(const targetId of targetIds\) \{[\s\S]*?fetch\(`\/api\/designs\/\$\{targetId\}`,[\s\S]*?method: "DELETE"/,
  "Deleting from My Designs should call the existing design DELETE API for each selected design."
);

assert.match(
  controllerSource,
  /setMyDesigns\(\(previous\) =>[\s\S]*?previous\.filter\(\(design\) => !deletedIds\.has\(design\.id\)\)/,
  "Deleting from My Designs should remove deleted rows without requiring a full page refresh."
);

assert.match(
  controllerSource,
  /if \(designId && deletedIds\.has\(designId\)\) \{[\s\S]*?setDesignId\(null\);[\s\S]*?setShareToken\(null\);[\s\S]*?setShareEnabled\(false\);[\s\S]*?\}/,
  "Deleting the currently loaded design should detach the editor from the removed cloud design."
);

assert.match(
  dialogSource,
  /data-testid="load-designs-bulk-toolbar"[\s\S]*?data-testid="select-all-saved-designs"[\s\S]*?data-testid="delete-selected-saved-designs"[\s\S]*?data-testid="delete-all-saved-designs"/,
  "The My Designs modal should expose select-all, delete-selected, and delete-all controls."
);

assert.match(
  dialogSource,
  /data-testid=\{`select-saved-design-\$\{design\.id\}`\}/,
  "Each saved design row should expose a checkbox for multi-select."
);

assert.match(
  dialogSource,
  /data-testid=\{`delete-saved-design-\$\{design\.id\}`\}/,
  "Each saved design row should expose a delete button for e2e coverage."
);

assert.match(
  dialogSource,
  /<ConfirmDialog[\s\S]*?open=\{Boolean\(pendingDeleteDesign\)\}[\s\S]*?pendingDeleteDesign\?\.mode === "all"[\s\S]*?pendingDeleteDesign\?\.mode === "selected"[\s\S]*?destructive[\s\S]*?onConfirm=\{onConfirmDelete\}/,
  "Saved design deletion should require a destructive confirmation dialog for single and bulk delete modes."
);

assert.match(
  source,
  /<MyDesignsDialog[\s\S]*?onToggleAll=\{toggleAllSavedDesignSelection\}[\s\S]*?onToggleSelection=\{toggleSavedDesignSelection\}[\s\S]*?onLoadDesign=\{handleLoadDesign\}[\s\S]*?onRequestDelete=\{requestDeleteSavedDesigns\}[\s\S]*?onConfirmDelete=\{handleDeleteSavedDesign\}/,
  "The extracted dialog should remain wired to the page-owned load, selection, and delete actions."
);

console.log("Load design delete modal guardrails passed.");
