import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const historyManagerSource = readFileSync(join(root, "lib/historyManager.ts"), "utf8");
const hookSource = readFileSync(join(root, "lib/useDesignPageHistory.ts"), "utf8");
const itemDocumentControllerSource = readFileSync(
  join(root, "lib/useDesignPageItemDocumentController.ts"),
  "utf8"
);
const sceneItemDragSource = readFileSync(
  join(root, "lib/useDesignPageSceneItemDrag.ts"),
  "utf8"
);
const furnitureItemSource = readFileSync(
  join(root, "components/scene/FurnitureItem.tsx"),
  "utf8"
);
const documentStateControllerSource = readFileSync(
  join(root, "lib/useDesignPageDocumentStateController.ts"),
  "utf8"
);
const documentHistoryControllerSource = readFileSync(
  join(root, "lib/useDesignPageDocumentHistoryController.ts"),
  "utf8"
);
const documentHistoryWorkspaceSource = readFileSync(
  join(root, "lib/useDesignPageDocumentHistoryWorkspace.ts"),
  "utf8"
);
const documentRoomRegistrationSource = readFileSync(
  join(root, "lib/useDesignPageDocumentRoomRegistration.ts"),
  "utf8"
);
const sceneRoomReadRegistrationSource = readFileSync(
  join(root, "lib/useDesignPageSceneRoomReadRegistration.ts"),
  "utf8"
);
const documentSelectionRegistrationSource = readFileSync(
  join(root, "lib/useDesignPageDocumentSelectionRegistrationFacade.ts"),
  "utf8"
);

assert.match(
  hookSource,
  /useState\([\s\S]*?new HistoryManager\(captureSnapshot, restoreSnapshot, onHistoryChange\)/,
  "The history manager should be initialized once from explicit snapshot adapters."
);
assert.match(
  hookSource,
  /flushCoalescedHistoryTransaction\(\);[\s\S]*?history\.executeCommand\(\{[\s\S]*?description: name,[\s\S]*?execute: action/,
  "Discrete history transactions should use the atomic command boundary."
);
assert.match(
  hookSource,
  /idleMs = 420[\s\S]*?window\.setTimeout[\s\S]*?history\.commit\(\)[\s\S]*?catch \(error\)[\s\S]*?history\.rollback\(\)/,
  "Coalesced transactions should retain their idle window and roll back failed updates."
);
assert.match(
  hookSource,
  /useEffect\(\(\) => flushCoalescedHistoryTransaction, \[flushCoalescedHistoryTransaction\]\)/,
  "Unmounting the controller should flush pending coalesced history."
);
assert.match(
  historyManagerSource,
  /executeCommand<TInput, TResult>[\s\S]*?structuredCloneValue\(command\.input\)[\s\S]*?command\.execute\(input\)[\s\S]*?this\.commit\(\)[\s\S]*?this\.rollback\(\)/,
  "Commands should clone deterministic input and commit or roll back atomically."
);
assert.match(
  historyManagerSource,
  /beginContinuousCommand[\s\S]*?updateContinuousCommand[\s\S]*?commitContinuousCommand[\s\S]*?rollbackContinuousCommand/,
  "Continuous interactions should have an explicit one-gesture transaction API."
);
assert.match(
  historyManagerSource,
  /DEFAULT_HISTORY_MAX_ENTRIES = 100[\s\S]*?getStatus\(\): HistoryStatus/,
  "History should expose its bounded memory policy and lightweight diagnostics."
);
assert.match(
  documentHistoryControllerSource,
  /useDesignPageHistory\(\{ adapters \}\)/,
  "The document-history controller should compose the generic history controller through its explicit adapter boundary."
);
assert.match(
  documentStateControllerSource,
  /const captureHistorySnapshot = \(\)(?:: DesignPageHistorySnapshot)? => \(\{[\s\S]*?designSnapshot: designSnapshotRef\.current[\s\S]*?planAnnotations: planAnnotationsRef\.current[\s\S]*?floorPlanUnderlay: floorPlanUnderlayRef\.current/,
  "The document-state controller should capture persistent document fields from event-time refs."
);
assert.match(
  documentStateControllerSource,
  /const restoreHistorySnapshot = \(snapshot: DesignPageHistorySnapshot\) => \{[\s\S]*?setDesignSnapshot\(snapshot\.designSnapshot\)[\s\S]*?setPlanAnnotations\(snapshot\.planAnnotations\)[\s\S]*?setFloorPlanUnderlay\(snapshot\.floorPlanUnderlay\)/,
  "The document-state adapter should restore through owner setters that synchronize refs and React state."
);
assert.doesNotMatch(
  hookSource.slice(
    hookSource.indexOf("export type DesignPageHistorySnapshot"),
    hookSource.indexOf("export interface UseDesignPageHistoryInput")
  ),
  /planTheme|planLayers|planLayerPreset|planMeasurementUnit|exportStylePreset/,
  "View and export preferences must not be captured in scene undo snapshots."
);
assert.match(
  documentHistoryControllerSource,
  /annotations: planAnnotations[\s\S]*?setPlanAnnotations\([\s\S]*?floorPlan\.annotations/,
  "Plan annotations should be projected into project persistence and restored on hydration."
);
assert.match(
  itemDocumentControllerSource,
  /history\.executeCommand\(\{[\s\S]*?applyReplaceRoomItemsCommand/,
  "Item document mutations should use deterministic scene commands."
);
assert.doesNotMatch(
  itemDocumentControllerSource,
  /history\.(?:begin|commit)\(/,
  "The item document controller should not manually bracket scene mutations."
);
assert.match(
  sceneItemDragSource,
  /beginContinuousCommand[\s\S]*?updateContinuousCommand[\s\S]*?commitContinuousCommand/,
  "Item drags should use the explicit continuous-command path."
);
assert.match(
  sceneItemDragSource,
  /publishAllMovedItems[\s\S]*?previewItems\(update\)[\s\S]*?commitActiveDrag[\s\S]*?setItems\(input\)/,
  "Single-item pointer previews should stay off root document state until the gesture commits."
);
const pointerUpSource = furnitureItemSource.slice(
  furnitureItemSource.indexOf("const onPointerUp"),
  furnitureItemSource.indexOf("const onPointerMove")
);
assert.ok(
  pointerUpSource.indexOf("onDragEnd(instanceId, position)") <
    pointerUpSource.indexOf("onDraggingChange?.(false)"),
  "Pointer-up should commit or roll back the document gesture before the canvas closes it."
);
assert.doesNotMatch(
  documentHistoryControllerSource,
  /history\.begin\("Apply plan template"\)/,
  "Persistence hydration must not leave an uncommitted user-history transaction."
);
assert.match(
  documentHistoryWorkspaceSource,
  /useDesignPageDocumentRefSynchronization\(\{[\s\S]*?useDesignPageDocumentHistoryController\(\{/,
  "The document workspace should compose synchronization before history."
);
assert.match(
  documentRoomRegistrationSource,
  /useDesignPageDocumentHistoryWorkspace\(\{[\s\S]*?useDesignPageRoomFloorWorkspace\(\{/,
  "Document-room registration should preserve history-before-room hook order."
);
assert.match(
  sceneRoomReadRegistrationSource,
  /useDesignPageSceneRoomReadFacade\(\{/,
  "Scene-room registration should adapt the existing grouped read facade."
);
assert.ok(
  documentSelectionRegistrationSource.indexOf(
    "useDesignPageDocumentRoomRegistration({"
  ) <
    documentSelectionRegistrationSource.indexOf(
      "useDesignPageSceneRoomReadRegistration({"
    ),
  "The document facade should register room ownership before scene read models."
);

console.log("design page history controller guardrails passed");
