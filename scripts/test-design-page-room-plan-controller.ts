import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoom, deleteRoom, type DesignSnapshot } from "@/lib/room-types";

const onlyRoom = createRoom("only-room", "Only room");
const sourceSnapshot: DesignSnapshot = {
  version: 3,
  rooms: [onlyRoom],
  activeRoomId: onlyRoom.id,
  floorPlan: { canonicalGeometryHash: "source-plan" },
};
const blankSnapshot = deleteRoom(sourceSnapshot, onlyRoom.id);
assert.deepEqual(blankSnapshot.rooms, []);
assert.equal(blankSnapshot.activeRoomId, "");
assert.equal(blankSnapshot.floorPlan, undefined);
assert.equal(sourceSnapshot.rooms.length, 1, "Deleting must not mutate the saved source snapshot.");

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const presentationWorkspaceSource = readFileSync(
  join(root, "lib/useDesignPagePresentationWorkspaceRegistration.ts"),
  "utf8"
);
const commandBarWrapperSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageEditorCommandBar.tsx"),
  "utf8"
);
const editorChromeControllerSource = readFileSync(
  join(root, "lib/useDesignPageEditorChromeController.ts"),
  "utf8"
);
const controllerSource = readFileSync(
  join(root, "lib/useDesignPageRoomPlanController.ts"),
  "utf8"
);
const deleteRoomActionSource = readFileSync(
  join(root, "lib/useDesignPageDeleteRoomAction.ts"),
  "utf8"
);
const planEditingFacadeSource = readFileSync(
  join(root, "lib/useDesignPagePlanEditingFacade.ts"),
  "utf8"
);
const planWorkspaceFacadeSource = readFileSync(
  join(root, "lib/useDesignPagePlanWorkspaceFacade.ts"),
  "utf8"
);
const planAuthoringRegistrationSource = readFileSync(
  join(root, "lib/useDesignPagePlanAuthoringRegistration.ts"),
  "utf8"
);
const viewportRegionAdapterSource = readFileSync(
  join(root, "lib/design-page-viewport-region-adapter.ts"),
  "utf8"
);

assert.match(
  planEditingFacadeSource,
  /useDesignPageRoomPlanController\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The plan-editing facade should compose the room-plan controller through grouped contracts."
);
assert.match(planWorkspaceFacadeSource, /useDesignPagePlanEditingFacade\(\{/);
assert.match(
  planAuthoringRegistrationSource,
  /useDesignPagePlanWorkspaceRegistrationFacade\(\{/,
  "Plan authoring should register the grouped plan boundary through its controller adapter."
);

for (const contract of ["state", "configuration", "refs", "actions"]) {
  assert.match(
    controllerSource,
    new RegExp(`\\b${contract}\\b`),
    `The controller should retain its grouped ${contract} contract.`
  );
}

for (const inlineHandler of [
  "handleSwitchRoom",
  "handleRenameSelectedPlanRoom",
  "handleDuplicateSelectedPlanRoom",
  "handleDeleteSelectedPlanRoom",
  "handleResizeRoom2D",
  "handleCommitRoomDimensionEdit2D",
  "handleCommitActiveRoomDimension",
  "handleRoomPresetChange",
  "nudgeSelectedPlanRoom",
]) {
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`const ${inlineHandler}\\s*=\\s*useCallback`),
    `${inlineHandler} should remain owned by the extracted controller.`
  );
}

for (const [source, historyLabel] of [
  [controllerSource, "Duplicate room"],
  [deleteRoomActionSource, "Delete room"],
  [controllerSource, "Edit room dimension"],
  [controllerSource, "Resize room"],
  [controllerSource, "Nudge room"],
] as const) {
  assert.match(
    source,
    new RegExp(`(?:begin|runHistoryTransaction)\\(\"${historyLabel}\"`),
    `The owning module should preserve the ${historyLabel} history transaction.`
  );
}

for (const [source, eventName] of [
  [controllerSource, "editor_room_switched"],
  [controllerSource, "floor_plan_room_duplicated"],
  [deleteRoomActionSource, "floor_plan_room_deleted"],
  [controllerSource, "editor_room_dimension_edited"],
  [controllerSource, "editor_room_resized"],
] as const) {
  assert.match(
    source,
    new RegExp(`track\\(\"${eventName}\"`),
    `The owning module should preserve the ${eventName} analytics event.`
  );
}

assert.match(
  controllerSource,
  /const deleteSelectedRoom = useDesignPageDeleteRoomAction\(\{[\s\S]*?clearPlanForEmptyCanvas,[\s\S]*?\}\);/,
  "The controller must delegate room deletion to the focused delete-room action."
);

assert.match(
  planEditingFacadeSource,
  /actions:\s*\{[\s\S]*?setDesignSnapshot:\s*actions\.document\.setDesignSnapshot,[\s\S]*?setPlanOpenings:\s*actions\.document\.setPlanOpenings,[\s\S]*?renameRoom:\s*actions\.room\.renameRoom,[\s\S]*?moveRoom2D:\s*actions\.room\.moveRoom2D/,
  "The controller must receive the synchronous snapshot/opening setters and history-aware room adapters."
);
assert.match(
  controllerSource,
  /valueMeters > ROOM_DIMENSION_DEFAULTS\.max[\s\S]*?showToast\("Enter a valid room dimension\."\)/,
  "Numeric room edits should retain explicit dimension validation."
);
assert.doesNotMatch(
  controllerSource + deleteRoomActionSource,
  /Keep at least one room/,
  "The editor must allow the final room to transition into its existing empty-plan state."
);
assert.match(
  viewportRegionAdapterSource,
  /canDeleteSelectedRoom:\s*state\.selectionInspector\.designRoomCount > 0/,
  "The room inspector must keep Delete enabled for the final room."
);
assert.match(
  deleteRoomActionSource,
  /deletingLastRoom[\s\S]*?clearPlanForEmptyCanvas\(\)[\s\S]*?All rooms deleted\. Start with a blank canvas\./,
  "Deleting the final room should clear plan artifacts and explain the blank-canvas transition."
);
assert.match(
  commandBarWrapperSource,
  /const room = state\.room;[\s\S]*?const contextVisible\s*=\s*!state\.commandBar\.isClientPreview[\s\S]*?Boolean\(room \|\| state\.commandBar\.viewMode === "3d"\)/,
  "The command wrapper should hide room and scene context in client preview."
);
assert.match(
  commandBarWrapperSource,
  /<RoomPlanStatusBar[\s\S]*?roomName=\{room\.roomName\}[\s\S]*?onViewModeChange=\{actions\.room\.onViewModeChange\}[\s\S]*?onFitPlan=\{actions\.room\.onFitPlan\}/,
  "The command wrapper should own the room-status context slot and preserve its actions."
);
assert.match(
  commandBarWrapperSource,
  /data-testid="editor-command-overflow-rename-room"[\s\S]*?actions\.room\.rename\(room\.id\)/,
  "The command wrapper should own overflow room rename and target the active room."
);
assert.match(
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?activeRoom:\s*documentRoom\.derived\.room\.activeRoom \?\? null[\s\S]*?room:\s*\{[\s\S]*?rename:\s*planWorkspace\.actions\.room\.startRoomRename/,
  "The presentation workspace should inject room state and rename through the typed presentation/QA boundary."
);
assert.match(
  editorChromeControllerSource,
  /room:\s*\{[\s\S]*?rename: actions\.room\.rename/,
  "The editor-chrome controller should pass rename through the command-wrapper boundary."
);
assert.doesNotMatch(
  workspaceSource,
  /<RoomPlanStatusBar\b/,
  "The workspace should delegate room-status composition to the command wrapper."
);

console.log("design page room-plan controller guardrails passed");
