import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isDesignPageSelectionShortcutBlocked,
  resolvePendingPlacementKeyboardCommand,
  resolveSelectedItemKeyboardCommand,
  resolveSelectedPlanKeyboardCommand,
} from "@/lib/design-page-selection-keyboard-commands";
import {
  isFloorPlanRectangleWallShortcut,
  resolveDesignPageHigherPriorityKeyboardOwner,
} from "@/lib/design-page-keyboard-context";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const keyboardSource = readFileSync(
  join(root, "lib/useDesignPageSelectionKeyboard.ts"),
  "utf8"
);
const selectionCoordinatorSource = readFileSync(
  join(root, "lib/useDesignPageSelectionCoordinator.ts"),
  "utf8"
);
const itemInteractionFacadeSource = readFileSync(
  join(root, "lib/useDesignPageItemInteractionFacade.ts"),
  "utf8"
);
const placementSelectionFacadeSource = readFileSync(
  join(root, "lib/useDesignPagePlacementSelectionWorkspaceFacade.ts"),
  "utf8"
);
const selectionWorkspaceSource = readFileSync(
  join(root, "lib/useDesignPageSelectionWorkspaceRegistration.ts"),
  "utf8"
);
const selectionTransformsSource = readFileSync(
  join(root, "lib/useDesignPageSelectionTransforms.ts"),
  "utf8"
);
const furnitureSource = readFileSync(
  join(root, "components/scene/FurnitureItem.tsx"),
  "utf8"
);
const rotationControlsSource = readFileSync(
  join(root, "components/editor/SelectedItemRotationControls.tsx"),
  "utf8"
);
const floorPlanTracingSource = readFileSync(
  join(root, "lib/useDesignPageFloorPlanTracing.ts"),
  "utf8"
);
const floorPlanWorkflowSource = readFileSync(
  join(root, "lib/useDesignPageFloorPlanWorkflowState.ts"),
  "utf8"
);

assert.match(
  selectionCoordinatorSource,
  /useDesignPageDeleteSelectionShortcut\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The selection coordinator should delegate Delete and Backspace handling through grouped contracts."
);
assert.match(
  itemInteractionFacadeSource,
  /useDesignPageSelectionKeyboardController\(\{[\s\S]*?state:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The item-interaction facade should delegate placement, item, and plan-room shortcuts through grouped contracts."
);
assert.match(
  itemInteractionFacadeSource,
  /useDesignPageSelectionKeyboardController\(\{[\s\S]{0,700}?selectedItemId:\s*state\.selection\.selectedItem\?\.instanceId \?\? null,/,
  "The keyboard controller should receive selected-item identity for rotation input synchronization."
);
assert.match(
  placementSelectionFacadeSource,
  /useDesignPageItemInteractionFacade\(\{/,
  "The placement/selection workspace facade should compose item interactions."
);
assert.match(
  selectionWorkspaceSource,
  /useDesignPagePlacementSelectionWorkspaceFacade\(\{/,
  "The selection workspace should compose the placement/selection facade."
);
assert.match(
  keyboardSource,
  /if \(!state\.selectedItemId\)[\s\S]*?setRotationInputValue\(String\(state\.selectedRotationDegrees\)\)/,
  "Rotation input synchronization should rerun when the selected item identity changes."
);
assert.doesNotMatch(
  furnitureSource,
  /Keyboard listener for rotation|source:\s*"keyboard"/,
  "Scene items must not own global rotation keyboard commands."
);
assert.match(
  keyboardSource,
  /window\.addEventListener\("keydown", handleSelectedItemShortcut, true\)/,
  "The central selected-item router should capture accepted commands before component-level handlers."
);
assert.match(
  keyboardSource,
  /event\.stopImmediatePropagation\(\)/,
  "An accepted central command should prevent a second routing layer from interpreting the keypress."
);
assert.match(
  keyboardSource,
  /hasSelectedItem:\s*Boolean\(input\.refs\.primaryId\.current\)/,
  "Keyboard commands should resolve selection from the current primary-item ref."
);
assert.match(
  keyboardSource,
  /resolveDesignPageHigherPriorityKeyboardOwner\([\s\S]{0,300}?floorPlanTraceRoomMode:\s*input\.refs\.floorPlanTraceRoomMode\.current[\s\S]{0,160}?if \(higherPriorityOwner\) return;[\s\S]{0,160}?resolvePendingPlacementKeyboardCommand/,
  "The selected-item router should decline a current tracing-owned command before placement or item routing."
);
assert.match(
  floorPlanTracingSource,
  /isDesignPageSelectionShortcutBlocked\(event\.target\)/,
  "Floor-plan tracing should apply the shared focus exclusions."
);
assert.match(
  floorPlanTracingSource,
  /isFloorPlanRectangleWallShortcut\(keyboardInput\)[\s\S]{0,160}?changeDrawRoomMode\("rectangle_wall"\)/,
  "Floor-plan tracing should use the exact rectangle-wall shortcut resolver."
);
assert.match(
  floorPlanWorkflowSource,
  /floorPlanTraceRoomModeRef\.current = resolved;[\s\S]{0,120}?setFloorPlanTraceRoomModeState\(resolved\)/,
  "Tracing ownership should update its event-time ref before scheduling the React state update."
);
assert.match(
  selectionTransformsSource,
  /const selectedId = getPrimaryId\(\);[\s\S]{0,180}?getItems\(\)\.find/,
  "Rotation commands should resolve the current item at execution time instead of retaining a stale item closure."
);
assert.match(
  selectionTransformsSource,
  /source: options\?\.source \?\? "inspector"/,
  "The shared transform path should preserve keyboard versus inspector analytics sources."
);
assert.match(
  rotationControlsSource,
  /onClick=\{\(\) => onRotateByDegrees\(90\)\}[\s\S]*?onClick=\{onResetRotation\}/,
  "Toolbar rotation and reset controls should remain independent of global keyboard ownership."
);
for (const formerInlineOwner of [
  "handleDeleteKey",
  "handleSelectedItemShortcut",
  "handleSelectedPlanObjectShortcut",
]) {
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`const ${formerInlineOwner}\\s*=`),
    `${formerInlineOwner} should remain owned by the keyboard hook.`
  );
  assert.match(
    keyboardSource,
    new RegExp(`const ${formerInlineOwner}\\s*=`),
    `${formerInlineOwner} should be implemented by the keyboard hook.`
  );
}

const pendingBase = {
  canEdit: true,
  hasPendingPlacement: true,
} as const;

assert.deepEqual(
  resolvePendingPlacementKeyboardCommand({
    ...pendingBase,
    key: "Escape",
    canEdit: false,
  }),
  { type: "cancel" },
  "Escape should cancel a pending preview even when editing is unavailable."
);
assert.deepEqual(
  resolvePendingPlacementKeyboardCommand({ ...pendingBase, key: "Enter" }),
  { type: "confirm" },
  "Enter should confirm an editable pending preview."
);
assert.deepEqual(
  resolvePendingPlacementKeyboardCommand({ ...pendingBase, key: "r" }),
  { type: "rotate", direction: "right" },
  "R should rotate a pending preview right."
);
assert.deepEqual(
  resolvePendingPlacementKeyboardCommand({ ...pendingBase, key: "R", shiftKey: true }),
  { type: "rotate", direction: "left" },
  "Shift+R should rotate a pending preview left."
);
assert.deepEqual(
  resolvePendingPlacementKeyboardCommand({ ...pendingBase, key: "ArrowLeft" }),
  { type: "nudge", deltaX: -0.1, deltaZ: 0 },
  "Placement arrow keys should use the 0.1 metre fine step."
);
assert.deepEqual(
  resolvePendingPlacementKeyboardCommand({
    ...pendingBase,
    key: "ArrowDown",
    shiftKey: true,
  }),
  { type: "nudge", deltaX: 0, deltaZ: 0.25 },
  "Shift+Arrow should use the 0.25 metre coarse placement step."
);
assert.equal(
  resolvePendingPlacementKeyboardCommand({
    ...pendingBase,
    key: "Enter",
    hasPendingPlacement: false,
  }),
  null,
  "Placement commands should require an active preview."
);
assert.equal(
  resolvePendingPlacementKeyboardCommand({
    ...pendingBase,
    key: "r",
    keyboardShortcutsEnabled: false,
  }),
  null,
  "Captured canvas interactions should suppress pending-placement transforms."
);
assert.deepEqual(
  resolvePendingPlacementKeyboardCommand({
    ...pendingBase,
    key: "Escape",
    keyboardShortcutsEnabled: false,
  }),
  { type: "cancel" },
  "Escape should remain available to cancel a captured pending placement."
);

const selectedItemBase = {
  canEdit: true,
  hasSelectedItem: true,
  keyboardShortcutsEnabled: true,
  rotationSnapEnabled: true,
  rotationSnapStepDegrees: 15,
} as const;

const tracingOwnerBase = {
  floorPlanTraceRoomMode: true,
  keyboardShortcutsEnabled: true,
} as const;

assert.equal(
  resolveDesignPageHigherPriorityKeyboardOwner({
    ...tracingOwnerBase,
    key: "r",
  }),
  "floor-plan-tracing",
  "Active room tracing should own unmodified R independently of selection."
);
assert.equal(
  resolveDesignPageHigherPriorityKeyboardOwner({
    ...tracingOwnerBase,
    key: "r",
    repeat: true,
  }),
  "floor-plan-tracing",
  "A repeated tracing R event should still have exactly one owner."
);
for (const unownedTracingInput of [
  { key: "r", floorPlanTraceRoomMode: false },
  { key: "R", shiftKey: true },
  { key: "r", metaKey: true },
  { key: "r", ctrlKey: true },
  { key: "r", altKey: true },
  { key: "q" },
  { key: "e" },
  { key: "0" },
  { key: "r", keyboardShortcutsEnabled: false },
] as const) {
  assert.equal(
    resolveDesignPageHigherPriorityKeyboardOwner({
      ...tracingOwnerBase,
      ...unownedTracingInput,
    }),
    null,
    "Tracing should claim only plain R in an active, uncaptured room-draw context."
  );
}
assert.equal(
  isFloorPlanRectangleWallShortcut({ key: "r" }),
  true,
  "Plain R should remain the rectangle-wall tracing alias."
);
assert.equal(
  isFloorPlanRectangleWallShortcut({ key: "r", ctrlKey: true }),
  false,
  "Browser refresh modifiers must not be intercepted by floor-plan tracing."
);

assert.deepEqual(
  resolveSelectedItemKeyboardCommand({
    ...selectedItemBase,
    key: "d",
    metaKey: true,
  }),
  { type: "duplicate" },
  "Cmd/Ctrl+D should duplicate the selected item."
);
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({ ...selectedItemBase, key: "r" }),
  { type: "rotate", degrees: 90, snap: true },
  "R should rotate the selected item by a quarter turn."
);
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({
    ...selectedItemBase,
    key: "R",
    shiftKey: true,
  }),
  { type: "rotate", degrees: -90, snap: true },
  "Shift+R should rotate the selected item by a negative quarter turn."
);
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({
    ...selectedItemBase,
    key: "q",
    rotationSnapStepDegrees: 5,
  }),
  { type: "rotate", degrees: -5, snap: true },
  "Q should rotate left by the current snap step."
);
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({
    ...selectedItemBase,
    key: "e",
    rotationSnapStepDegrees: 5,
  }),
  { type: "rotate", degrees: 5, snap: true },
  "E should rotate right by the current snap step."
);
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({
    ...selectedItemBase,
    key: "e",
    rotationSnapEnabled: false,
  }),
  { type: "rotate", degrees: 1, snap: false },
  "Free rotation should preserve the existing one-degree keyboard step."
);
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({ ...selectedItemBase, key: "0" }),
  { type: "reset-rotation" },
  "0 should reset the selected item rotation."
);
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({
    ...selectedItemBase,
    key: "r",
    repeat: true,
  }),
  { type: "rotate", degrees: 90, snap: true },
  "Each accepted key-repeat event should resolve to one rotation command."
);
for (const modifier of ["metaKey", "ctrlKey", "altKey"] as const) {
  assert.equal(
    resolveSelectedItemKeyboardCommand({
      ...selectedItemBase,
      key: "r",
      [modifier]: true,
    }),
    null,
    `${modifier} rotation variants should remain unassigned.`
  );
}
for (const disabledState of [
  { hasSelectedItem: false },
  { canEdit: false },
  { keyboardShortcutsEnabled: false },
] as const) {
  assert.equal(
    resolveSelectedItemKeyboardCommand({
      ...selectedItemBase,
      ...disabledState,
      key: "r",
    }),
    null,
    "Rotation should be a safe no-op when selection, editing, or the interaction context disallows it."
  );
}
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({ ...selectedItemBase, key: "ArrowUp" }),
  { type: "nudge", deltaX: 0, deltaZ: -0.05 },
  "Selected-item arrow keys should use the 0.05 metre fine step."
);
assert.deepEqual(
  resolveSelectedItemKeyboardCommand({
    ...selectedItemBase,
    key: "ArrowRight",
    shiftKey: true,
  }),
  { type: "nudge", deltaX: 0.25, deltaZ: 0 },
  "Shift+Arrow should use the 0.25 metre coarse selected-item step."
);

for (const tagName of ["INPUT", "TEXTAREA", "SELECT"] as const) {
  assert.equal(
    isDesignPageSelectionShortcutBlocked({ tagName } as unknown as EventTarget),
    true,
    `${tagName} focus should block design-page selection shortcuts.`
  );
}
assert.equal(
  isDesignPageSelectionShortcutBlocked({
    tagName: "DIV",
    isContentEditable: true,
  } as unknown as EventTarget),
  true,
  "Contenteditable focus should block design-page selection shortcuts."
);
assert.equal(
  isDesignPageSelectionShortcutBlocked({
    tagName: "BUTTON",
    closest: (selector: string) =>
      selector.includes("aria-modal") ? { role: "dialog" } : null,
  } as unknown as EventTarget),
  true,
  "Modal and captured interaction contexts should block selection shortcuts."
);
assert.equal(
  isDesignPageSelectionShortcutBlocked({
    tagName: "BUTTON",
    closest: () => null,
  } as unknown as EventTarget),
  false,
  "Ordinary editor controls should not block selection shortcuts."
);

const selectedPlanBase = {
  canEdit: true,
  hasSelectedItem: false,
  selectedItemCount: 0,
  selectedPlanOverlayId: null,
  selectedPlanRoomId: "room-1",
  selectedZoneId: null,
  viewMode: "2d",
} as const;

for (const selection of [
  { selectedPlanRoomId: "room-1" },
  { selectedPlanRoomId: null, selectedPlanOverlayId: "door-1" },
  { selectedPlanRoomId: null, selectedItemCount: 1 },
  { selectedPlanRoomId: null, selectedZoneId: "zone-1" },
] as const) {
  assert.deepEqual(
    resolveSelectedPlanKeyboardCommand({
      ...selectedPlanBase,
      ...selection,
      key: "Escape",
    }),
    { type: "clear-selection" },
    "Escape should clear every supported plan selection type."
  );
}
assert.deepEqual(
  resolveSelectedPlanKeyboardCommand({ ...selectedPlanBase, key: "Delete" }),
  { type: "delete-room", roomId: "room-1" },
  "Delete should remove an editable selected room."
);
assert.deepEqual(
  resolveSelectedPlanKeyboardCommand({
    ...selectedPlanBase,
    key: "d",
    ctrlKey: true,
  }),
  { type: "duplicate-room", roomId: "room-1" },
  "Cmd/Ctrl+D should duplicate an editable selected room."
);
assert.deepEqual(
  resolveSelectedPlanKeyboardCommand({ ...selectedPlanBase, key: "ArrowLeft" }),
  {
    type: "nudge-room",
    deltaX: -0.05,
    deltaZ: 0,
    snap: true,
  },
  "Fine 2D room nudges should retain snapping."
);
assert.deepEqual(
  resolveSelectedPlanKeyboardCommand({
    ...selectedPlanBase,
    key: "ArrowDown",
    shiftKey: true,
  }),
  {
    type: "nudge-room",
    deltaX: 0,
    deltaZ: 0.25,
    snap: false,
  },
  "Coarse 2D room nudges should disable snapping."
);
assert.equal(
  resolveSelectedPlanKeyboardCommand({
    ...selectedPlanBase,
    key: "ArrowRight",
    viewMode: "3d",
  }),
  null,
  "Room nudging should remain limited to the 2D plan."
);
assert.equal(
  resolveSelectedPlanKeyboardCommand({
    ...selectedPlanBase,
    key: "Delete",
    selectedPlanOverlayId: "door-1",
  }),
  null,
  "A selected overlay should suppress selected-room commands."
);

console.log("Design page selection keyboard guardrails passed");
