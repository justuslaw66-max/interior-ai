import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const registrationSource = readSource(
  "lib/useDesignPageSceneRegionWorkspaceRegistration.ts"
);
const sceneItemDragSource = readSource("lib/useDesignPageSceneItemDrag.ts");

assert.match(
  workspaceSource,
  /useDesignPageSceneRegionWorkspaceRegistration\(\{[\s\S]*?presentation: presentationQaWorkspace/
);
assert.match(registrationSource, /useDesignPageSceneItemDrag\(\{/);
assert.match(registrationSource, /buildDesignPageSceneRegionAdapter\(\{/);
assert.doesNotMatch(workspaceSource, /useDesignPageSceneItemDrag\(\{/);
assert.doesNotMatch(workspaceSource, /buildDesignPageSceneRegionAdapter\(\{/);

for (const group of [
  "boundaries",
  "state",
  "derived",
  "configuration",
  "refs",
  "actions",
  "regions",
] as const) {
  assert.match(registrationSource, new RegExp(`\\b${group}:`));
}

assert.match(
  registrationSource,
  /selectedIds: itemSelection\.refs\.selectedIds,[\s\S]*?dragCommit: camera\.refs\.canvas\.itemDragCommit/,
  "Drag behavior should retain selection and camera commit refs."
);
assert.match(
  registrationSource,
  /setItems: itemDocument\.actions\.setItemsPresent,[\s\S]*?history: documentRoom\.refs\.documentHistory\.history/,
  "Drag mutations should remain connected to document and history owners."
);
assert.match(
  registrationSource,
  /flushCoalescedHistoryTransaction:[\s\S]*?documentRoom\.actions\.history\.flushCoalescedHistoryTransaction/,
  "Scene dragging should flush a pending coalesced edit before opening its gesture transaction."
);
assert.match(
  registrationSource,
  /onRenderReadyChange:[\s\S]*?sceneRoomRead\.actions\.scene\.handleSceneRenderItemReadyChange/,
  "Scene readiness should remain connected to the scene read controller."
);
assert.match(
  registrationSource,
  /onDragPointerMove: scene\.hasWholeHousePlan[\s\S]*?camera\.actions\.navigation\.nudgeWholeHomeCameraForDrag/,
  "Whole-home drag camera nudging should remain conditional."
);
assert.match(
  sceneItemDragSource,
  /const moverRoom = roomSnapshotById\.get\(sceneEntry\.roomId\) \?\? activeRoom;[\s\S]*?!isPlacementContained\([\s\S]*?localPosition,[\s\S]*?mover\.rotationY \?\? 0,[\s\S]*?configuredPlanningDims[\s\S]*?Move blocked by a wall\.[\s\S]*?return false;[\s\S]*?const moverBounds/,
  "Same-room dragging must reject a full rotated footprint that crosses a room wall before collision checks or item mutation."
);
assert.match(
  sceneItemDragSource,
  /flushCoalescedHistoryTransaction\(\);[\s\S]*?rollbackInterruptedSceneItemDrag\(history\);[\s\S]*?history\.beginContinuousCommand/,
  "A new scene drag should recover an interrupted drag transaction before beginning another one."
);
assert.match(
  sceneItemDragSource,
  /setCrossRoomDragTarget\(null\);[\s\S]*?Could not move the item\. Try again\./,
  "Unexpected drag failures should clear the room-target overlay instead of leaving the item stuck in transfer mode."
);

assert.ok(registrationSource.split("\n").length <= 440);
assert.ok(workspaceSource.split("\n").length <= 820);

console.log("design page scene-region workspace registration guardrails passed");
