import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const source = fs.readFileSync(designPagePath, "utf8");

assert.match(
  source,
  /const \[selectedSavedDesignIds, setSelectedSavedDesignIds\] = useState<Set<string>>\(new Set\(\)\);/,
  "The load-design modal should track selected saved designs for bulk actions."
);

assert.match(
  source,
  /const \[deletingDesignIds, setDeletingDesignIds\] = useState<Set<string>>\(new Set\(\)\);/,
  "The load-design modal should track all saved designs currently being deleted."
);

assert.match(
  source,
  /const \[pendingDeleteDesign, setPendingDeleteDesign\] = useState<\{[\s\S]*?ids: string\[\];[\s\S]*?mode: "single" \| "selected" \| "all";/,
  "The load-design modal should keep pending batch delete metadata for confirmation copy."
);

assert.match(
  source,
  /const toggleSavedDesignSelection = \(id: string\) => \{[\s\S]*?setSelectedSavedDesignIds/,
  "Saved designs should support individual checkbox selection."
);

assert.match(
  source,
  /const toggleAllSavedDesignSelection = \(\) => \{[\s\S]*?setSelectedSavedDesignIds\(allSavedDesignsSelected \? new Set\(\) : new Set\(allSavedDesignIds\)\);/,
  "Saved designs should support selecting every row."
);

assert.match(
  source,
  /const handleDeleteSavedDesign = async \(\) => \{[\s\S]*?for \(const targetId of targetIds\) \{[\s\S]*?fetch\(`\/api\/designs\/\$\{targetId\}`,[\s\S]*?method: "DELETE"/,
  "Deleting from My Designs should call the existing design DELETE API for each selected design."
);

assert.match(
  source,
  /setMyDesigns\(\(prev\) => prev\.filter\(\(design\) => !deletedIds\.has\(design\.id\)\)\);/,
  "Deleting from My Designs should remove deleted rows without requiring a full page refresh."
);

assert.match(
  source,
  /if \(designId && deletedIds\.has\(designId\)\) \{[\s\S]*?setDesignId\(null\);[\s\S]*?setShareToken\(null\);[\s\S]*?setShareEnabled\(false\);[\s\S]*?\}/,
  "Deleting the currently loaded design should detach the editor from the removed cloud design."
);

assert.match(
  source,
  /data-testid="load-designs-bulk-toolbar"[\s\S]*?data-testid="select-all-saved-designs"[\s\S]*?data-testid="delete-selected-saved-designs"[\s\S]*?data-testid="delete-all-saved-designs"/,
  "The My Designs modal should expose select-all, delete-selected, and delete-all controls."
);

assert.match(
  source,
  /data-testid=\{`select-saved-design-\$\{design\.id\}`\}/,
  "Each saved design row should expose a checkbox for multi-select."
);

assert.match(
  source,
  /data-testid=\{`delete-saved-design-\$\{design\.id\}`\}/,
  "Each saved design row should expose a delete button for e2e coverage."
);

assert.match(
  source,
  /<ConfirmDialog[\s\S]*?open=\{Boolean\(pendingDeleteDesign\)\}[\s\S]*?pendingDeleteDesign\?\.mode === "all"[\s\S]*?pendingDeleteDesign\?\.mode === "selected"[\s\S]*?destructive[\s\S]*?onConfirm=\{handleDeleteSavedDesign\}/,
  "Saved design deletion should require a destructive confirmation dialog for single and bulk delete modes."
);

console.log("Load design delete modal guardrails passed.");
