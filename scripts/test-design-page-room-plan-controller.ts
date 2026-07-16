import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
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
const planEditingFacadeSource = readFileSync(
  join(root, "lib/useDesignPagePlanEditingFacade.ts"),
  "utf8"
);

assert.match(
  planEditingFacadeSource,
  /useDesignPageRoomPlanController\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The plan-editing facade should compose the room-plan controller through grouped contracts."
);
assert.match(workspaceSource, /useDesignPagePlanEditingFacade\(\{/);

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

for (const historyLabel of [
  "Duplicate room",
  "Delete room",
  "Edit room dimension",
  "Resize room",
  "Nudge room",
]) {
  assert.match(
    controllerSource,
    new RegExp(`(?:begin|runHistoryTransaction)\\(\"${historyLabel}\"`),
    `The controller should preserve the ${historyLabel} history transaction.`
  );
}

for (const eventName of [
  "editor_room_switched",
  "floor_plan_room_duplicated",
  "floor_plan_room_deleted",
  "editor_room_dimension_edited",
  "editor_room_resized",
]) {
  assert.match(
    controllerSource,
    new RegExp(`track\\(\"${eventName}\"`),
    `The controller should preserve the ${eventName} analytics event.`
  );
}

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
  workspaceSource,
  /useDesignPageEditorChromeController\(\{[\s\S]*?room:\s*activeRoom[\s\S]*?id:\s*activeRoom\.id[\s\S]*?roomName:\s*activeRoom\.name[\s\S]*?room:\s*\{[\s\S]*?rename:\s*handleRenameSelectedPlanRoom/,
  "The workspace should inject room status and rename through the typed editor-chrome boundary."
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
