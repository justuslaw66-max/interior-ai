import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Only the history modules drive a transaction by hand. Everything else records an edit through
// runHistoryTransaction (discrete edits: it flushes a slider's coalesced transaction first and
// refuses to nest) or syncGestureTransaction (gestures: it keeps begin()'s answer).
//
// A hand-written begin()/commit() pair drops begin()'s answer. begin() refuses to nest, and a
// slider's coalesced transaction stays open for its 420 ms idle window, so an edit made inside
// that window had its begin ignored, its commit closed the slider's transaction instead, one undo
// reverted both, and the slider's own commit later warned "No active transaction to commit".
// #48 and #49 fixed ten such callers; this guard covers the last fourteen and keeps the class out.

const root = process.cwd();
const SOURCE_ROOTS = ["app", "components", "features", "lib"];
const HISTORY_OWNERS = new Set([
  "lib/historyManager.ts",
  "lib/useDesignPageHistory.ts",
  "lib/design-page-gesture-history.ts",
]);
const DIRECT_TRANSACTION_CALL = /\bhistory\s*\.\s*(begin|commit|rollback)\s*\(/;
// The hand-rolled adapters these hooks used to receive: { begin: (name: string) => void; ... }.
const HISTORY_ADAPTER_TYPE = /\bbegin\s*:\s*\(\s*name\s*:\s*string\s*\)\s*=>/;

function sourceFiles(directory: string): string[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [relative] : [];
  });
}

const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const files = SOURCE_ROOTS.flatMap((directory) => sourceFiles(directory));
assert.ok(files.length > 1000, `The guard must read the app; it found ${files.length} files.`);
for (const owner of HISTORY_OWNERS) {
  assert.ok(files.includes(owner), `${owner} should still own the history transactions.`);
}
assert.match(
  read("lib/design-page-gesture-history.ts"),
  DIRECT_TRANSACTION_CALL,
  "The guard's pattern must recognise the gesture helper's own begin()."
);

const violations = files
  .filter((file) => !HISTORY_OWNERS.has(file))
  .flatMap((file) =>
    read(file)
      .split("\n")
      .flatMap((line, index) => [
        ...(DIRECT_TRANSACTION_CALL.test(line)
          ? [`${file}:${index + 1} drives a history transaction by hand: ${line.trim()}`]
          : []),
        ...(HISTORY_ADAPTER_TYPE.test(line)
          ? [`${file}:${index + 1} declares a begin/commit history adapter: ${line.trim()}`]
          : []),
      ])
  );
assert.deepEqual(
  violations,
  [],
  `Record edits through runHistoryTransaction or syncGestureTransaction:\n${violations.join("\n")}`
);

// Each of the fourteen edits opens its own transaction and makes its writes inside it.
const TRANSACTIONS: Array<[file: string, pattern: RegExp, edit: string]> = [
  [
    "lib/useDesignPageFloorPlanLifecycleRegistration.ts",
    /runHistoryTransaction\("Change floor-plan orientation", \(\) => \{\s*setDesignSnapshot\(reoriented\.snapshot\);\s*setPlanOpenings\(reoriented\.openings\);\s*setPlanFixedElements\(reoriented\.fixedElements\);\s*\}\);/,
    "Change floor-plan orientation",
  ],
  [
    "lib/useDesignPageFloorPlanTracing.ts",
    /runHistoryTransaction\(opening\.kind === "door" \? "Trace door" : "Trace window", \(\) =>\s*setPlanOpenings\(/,
    "Trace door / Trace window",
  ],
  [
    "lib/useDesignPageFloorPlanTracing.ts",
    /runHistoryTransaction\(opening\.kind === "door" \? "Place door" : "Place window", \(\) =>\s*setPlanOpenings\(/,
    "Place door / Place window",
  ],
  [
    "lib/useDesignPageFloorPlanUnderlayController.ts",
    /runHistoryTransaction\("Upload floor plan", \(\) =>\s*setFloorPlanUnderlay\(\{/,
    "Upload floor plan",
  ],
  [
    "lib/useDesignPageFloorPlanUnderlayController.ts",
    /runHistoryTransaction\("Change floor plan page", \(\) =>\s*setFloorPlanUnderlay\(\(previous\) =>/,
    "Change floor plan page",
  ],
  [
    "lib/useDesignPageFloorPlanUnderlayController.ts",
    /runHistoryTransaction\("Clear floor plan", \(\) => \{\s*setFloorPlanPdfSourceReady\(false\);\s*setFloorPlanUnderlay\(null\);\s*\}\);/,
    "Clear floor plan",
  ],
  [
    "lib/useDesignPageLayoutVersionsController.ts",
    /runHistoryTransaction\(`Restore \$\{version\.name\}`, \(\) => \{\s*setDesignSnapshot\(\(previous\) => \{[\s\S]*?\}\);\s*updateSelection\(new Set\(\), null\);\s*\}\);/,
    "Restore <version>",
  ],
  [
    "lib/useDesignPageRoomGeometry.ts",
    /runHistoryTransaction\(actionName, \(\) => \{\s*designSnapshotRef\.current = nextSnapshot;\s*setDesignSnapshot\(nextSnapshot\);\s*\}\);/,
    "room geometry edits (actionName)",
  ],
  [
    "lib/useDesignPageRoomGeometry.ts",
    /runHistoryTransaction\(visible \? "Show ceiling" : "Hide ceiling", \(\) => \{\s*designSnapshotRef\.current = nextSnapshot;\s*setDesignSnapshot\(nextSnapshot\);\s*\}\);/,
    "Show ceiling / Hide ceiling",
  ],
  [
    "lib/useDesignPageRoomGeometry.ts",
    /runHistoryTransaction\("Edit ceiling colour", \(\) => \{\s*designSnapshotRef\.current = nextSnapshot;\s*setDesignSnapshot\(nextSnapshot\);\s*\}\);/,
    "Edit ceiling colour",
  ],
  [
    "lib/useDesignPageSelectionCoordinator.ts",
    /const deleted = runHistoryTransaction\(\s*deletedOpening \? `Delete \$\{deletedOpening\.kind\}` : "Delete plan item",\s*\(\) => \{\s*const canonicalDelete = deletedOpening[\s\S]*?if \(canonicalDelete === "blocked"\) return false;[\s\S]*?\}\s*\);\s*if \(deleted\) setSelectedPlanOverlayId\(null\);\s*return deleted;/,
    "Delete <opening> / Delete plan item",
  ],
  [
    "lib/useDesignPageZoneController.ts",
    /runHistoryTransaction\("Create zone", \(\) =>\s*setDesignSnapshot\(\(previous\) => updateActiveRoomZones\(previous, nextZones\)\)\s*\);/,
    "Create zone",
  ],
  [
    "lib/useDesignPageZoneController.ts",
    /runHistoryTransaction\("Create seating area", \(\) =>\s*setDesignSnapshot\(\(previous\) => updateActiveRoomZones\(previous, nextZones\)\)\s*\);/,
    "Create seating area",
  ],
  [
    "lib/useDesignPageZoneController.ts",
    /runHistoryTransaction\("Ungroup zone", \(\) =>\s*setDesignSnapshot\(\(previous\) => updateActiveRoomZones\(previous, nextZones\)\)\s*\);/,
    "Ungroup zone",
  ],
];
for (const [file, pattern, edit] of TRANSACTIONS) {
  assert.match(read(file), pattern, `${file}: "${edit}" must run inside its own runHistoryTransaction.`);
}

console.log(`Design-page history caller checks passed (${files.length} files, ${TRANSACTIONS.length} edits).`);
