import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const hookSource = readFileSync(join(root, "lib/useDesignPageHistory.ts"), "utf8");
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
const pageSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);

assert.match(
  hookSource,
  /useState\([\s\S]*?new HistoryManager\(captureSnapshot, restoreSnapshot, onHistoryChange\)/,
  "The history manager should be initialized once from explicit snapshot adapters."
);
assert.match(
  hookSource,
  /flushCoalescedHistoryTransaction\(\);[\s\S]*?history\.begin\(name\);[\s\S]*?action\(\);[\s\S]*?history\.commit\(\);[\s\S]*?history\.rollback\(\);/,
  "Discrete history transactions should flush coalesced work and roll back failed actions."
);
assert.match(
  hookSource,
  /idleMs = 420[\s\S]*?window\.clearTimeout[\s\S]*?window\.setTimeout[\s\S]*?history\.commit\(\)/,
  "Coalesced transactions should retain their original idle window and timer replacement."
);
assert.match(
  hookSource,
  /useEffect\(\(\) => flushCoalescedHistoryTransaction, \[flushCoalescedHistoryTransaction\]\)/,
  "Unmounting the controller should flush pending coalesced history."
);
assert.match(
  documentHistoryControllerSource,
  /useDesignPageHistory\(\{ adapters \}\)/,
  "The document-history controller should compose the generic history controller through its explicit adapter boundary."
);
assert.match(
  documentStateControllerSource,
  /const captureHistorySnapshot = \(\)(?:: DesignPageHistorySnapshot)? => \(\{[\s\S]*?designSnapshot: designSnapshotRef\.current[\s\S]*?floorPlanUnderlay: floorPlanUnderlayRef\.current/,
  "The document-state controller should capture every document and plan field from event-time refs."
);
assert.match(
  documentStateControllerSource,
  /const restoreHistorySnapshot = \(snapshot: DesignPageHistorySnapshot\) => \{[\s\S]*?designSnapshotRef\.current = snapshot\.designSnapshot[\s\S]*?floorPlanUnderlayRef\.current = snapshot\.floorPlanUnderlay[\s\S]*?setFloorPlanUnderlayState\(snapshot\.floorPlanUnderlay\)/,
  "The document-state adapter should restore refs before React state."
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
  pageSource.indexOf("useDesignPageDocumentRoomRegistration({") <
    pageSource.indexOf("useDesignPageSceneRoomReadRegistration({"),
  "The design workspace should register document and room ownership before scene read models."
);

console.log("design page history controller guardrails passed");
