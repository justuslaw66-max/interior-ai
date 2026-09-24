import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { syncGestureTransaction } from "@/lib/design-page-gesture-history";
import { SCENE_ITEM_DRAG_COMMAND_ID } from "@/lib/design-page-item-commands";
import { createRoom, type RoomSnapshot } from "@/lib/room-types";
import {
  useDesignPageHistory,
  type DesignPageHistorySnapshot,
  type UseDesignPageHistoryInput,
} from "@/lib/useDesignPageHistory";

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
assert.match(
  furnitureItemSource,
  /onFinish: \(cancelled, finalPosition\)[\s\S]*?try \{ if \(!cancelled && interactive\) onDragEnd\?\.\(instanceId, finalPosition\); \}[\s\S]*?finally \{ onDraggingChange\?\.\(false\); \}/,
  "Accepted release must commit before the canvas closes the gesture; cancellation must skip commit and use its rollback."
);
assert.doesNotMatch(
  documentHistoryControllerSource,
  /history\.begin\("Apply plan template"\)/,
  "Persistence hydration must not leave an uncommitted user-history transaction."
);
const floorPlanUnderlayControllerSource = readFileSync(
  join(root, "lib/useDesignPageFloorPlanUnderlayController.ts"),
  "utf8"
);
assert.equal(
  floorPlanUnderlayControllerSource.match(/history\.commit\(\)/g)?.length ?? 0,
  floorPlanUnderlayControllerSource.match(/history\.begin\(/g)?.length ?? 0,
  "Every floor-plan history commit must close a transaction the same controller began."
);
const applyPlanTemplateSource = floorPlanUnderlayControllerSource.slice(
  floorPlanUnderlayControllerSource.indexOf("const applyPlanTemplate = useCallback"),
  floorPlanUnderlayControllerSource.indexOf("const confirmPendingTemplateReplacement")
);
assert.match(
  applyPlanTemplateSource,
  /const replacePlanDocument = \([\s\S]*?runHistoryTransaction\("Apply plan template", \(\) => \{[\s\S]*?setDesignSnapshot\(snapshot\);\s*\}\);/,
  "Applying a template must replace the plan inside one undoable history transaction."
);
assert.equal(
  applyPlanTemplateSource.match(/replacePlanDocument\(/g)?.length,
  2,
  "Canonical and generated templates should both use the transactional plan replacement."
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

const canvasInteractionControllerSource = readFileSync(
  join(root, "lib/useDesignPageCanvasInteractionController.ts"),
  "utf8"
);
const editorInteractionRegistrationSource = readFileSync(
  join(root, "lib/useDesignPageEditorInteractionRegistration.ts"),
  "utf8"
);
assert.doesNotMatch(
  canvasInteractionControllerSource,
  /history\.(?:begin|commit)\(/,
  "Room moves, room resizes and overlay drags must open and close their transactions through "
  + "syncGestureTransaction, not by driving the history manager directly."
);
assert.match(
  canvasInteractionControllerSource,
  /syncGestureTransaction\(\s*history,\s*flushCoalescedHistoryTransaction,/,
  "The canvas controller must hand syncGestureTransaction the design page's coalesced flush."
);
for (const gesture of [
  /syncGestureHistory\(roomDragHistoryActiveRef, dragging, "Move room"\)/,
  /syncGestureHistory\(roomResizeHistoryActiveRef, resizing, "Resize room"\)/,
  /syncGestureHistory\(\s*overlayDragHistoryActiveRef,\s*dragging,\s*getPlanOverlayMoveHistoryLabel\(kind\)\s*\)/,
]) {
  assert.match(
    canvasInteractionControllerSource,
    gesture,
    "Every canvas gesture should bracket its history transaction the same way."
  );
}
assert.match(
  editorInteractionRegistrationSource,
  /const \{ flushCoalescedHistoryTransaction \} = documentRoom\.actions\.history;[\s\S]*?canvas: \{ history, flushCoalescedHistoryTransaction \}/,
  "The canvas controller must receive the design page's own coalesced-transaction flush."
);

// Behavioural: syncGestureTransaction against the real design-page history. The hook renders once
// on the server so its callbacks can be driven directly; runCoalescedHistoryTransaction schedules
// its idle commit on window, which node does not define.
if (typeof window === "undefined") Object.assign(globalThis, { window: globalThis });

type DesignPageHistory = ReturnType<typeof useDesignPageHistory>;

function DesignPageHistoryProbe({
  adapters,
  onRender,
}: {
  adapters: UseDesignPageHistoryInput["adapters"];
  onRender: (designHistory: DesignPageHistory) => void;
}) {
  const designHistory = useDesignPageHistory({ adapters });
  onRender(designHistory);
  return null;
}

function renderDesignPageHistory() {
  const room = createRoom("gesture-room", "Gesture room");
  let snapshot: DesignPageHistorySnapshot = {
    designSnapshot: { version: 3, rooms: [room], activeRoomId: room.id },
    planAnnotations: [],
    planFixedElements: [],
    planOpenings: [],
    floorPlanUnderlay: null,
  };
  const editRoom = (edit: (target: RoomSnapshot) => RoomSnapshot) => {
    snapshot = {
      ...snapshot,
      designSnapshot: {
        ...snapshot.designSnapshot,
        rooms: snapshot.designSnapshot.rooms.map(edit),
      },
    };
  };
  const probe: { designHistory: DesignPageHistory | null } = { designHistory: null };
  renderToStaticMarkup(
    createElement(DesignPageHistoryProbe, {
      adapters: {
        captureSnapshot: () => snapshot,
        restoreSnapshot: (next) => {
          snapshot = next;
        },
        onHistoryChange: () => undefined,
      },
      onRender: (designHistory) => {
        probe.designHistory = designHistory;
      },
    })
  );
  assert.ok(probe.designHistory, "The design-page history should render.");
  return {
    designHistory: probe.designHistory,
    room: () => {
      const [current] = snapshot.designSnapshot.rooms;
      assert.ok(current);
      return current;
    },
    setCeilingHeight: (height: number) =>
      editRoom((target) => ({ ...target, geometry: { ...target.geometry, height } })),
    moveRoom: (x: number) => editRoom((target) => ({ ...target, planPosition: { x, z: 0 } })),
  };
}

function captureHistoryWarnings(run: () => void): string[] {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    run();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

{
  const fixture = renderDesignPageHistory();
  const { history, runCoalescedHistoryTransaction, flushCoalescedHistoryTransaction } =
    fixture.designHistory;
  const gestureActive = { current: false };
  const setMoving = (active: boolean) =>
    syncGestureTransaction(
      history,
      flushCoalescedHistoryTransaction,
      gestureActive,
      active,
      "Move room"
    );
  const warnings = captureHistoryWarnings(() => {
    runCoalescedHistoryTransaction("Change ceiling height", () => fixture.setCeilingHeight(2.9));
    setMoving(true);
    fixture.moveRoom(1.5);
    setMoving(false);
    // What the slider's idle timer does 420 ms later.
    flushCoalescedHistoryTransaction();
  });
  assert.deepEqual(
    warnings,
    [],
    "A gesture started inside a slider's coalesced transaction must open its own instead of "
    + "joining the slider's and committing it."
  );
  assert.equal(history.getUndoName(), "Move room", "The gesture should be its own undo step.");
  history.undo();
  assert.deepEqual(fixture.room().planPosition, { x: 0, z: 0 }, "Undo should revert the gesture.");
  assert.equal(fixture.room().geometry.height, 2.9, "Undoing the gesture must keep the slider edit.");
  assert.equal(history.getUndoName(), "Change ceiling height");
}

{
  const fixture = renderDesignPageHistory();
  const { history, flushCoalescedHistoryTransaction } = fixture.designHistory;
  const gestureActive = { current: false };
  const setResizing = (active: boolean) =>
    syncGestureTransaction(
      history,
      flushCoalescedHistoryTransaction,
      gestureActive,
      active,
      "Resize room"
    );
  const warnings = captureHistoryWarnings(() => {
    history.beginContinuousCommand({ id: SCENE_ITEM_DRAG_COMMAND_ID, description: "Move item" });
    setResizing(true);
    fixture.moveRoom(2);
    setResizing(false);
    history.commitContinuousCommand(SCENE_ITEM_DRAG_COMMAND_ID);
  });
  assert.deepEqual(
    warnings,
    ['Transaction already active: "Move item". Ignoring begin("Resize room")'],
    "A gesture whose begin() is refused should report it once and do nothing else."
  );
  assert.equal(
    history.getUndoName(),
    "Move item",
    "A gesture must never commit a transaction it did not open."
  );
}

console.log("design page history controller guardrails passed");
