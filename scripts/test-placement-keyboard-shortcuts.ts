import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolvePendingPlacementKeyboardCommand,
  resolveSelectedItemKeyboardCommand,
  resolveSelectedPlanKeyboardCommand,
} from "@/lib/useDesignPageSelectionKeyboard";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const keyboardSource = readFileSync(
  join(root, "lib/useDesignPageSelectionKeyboard.ts"),
  "utf8"
);

assert.match(
  workspaceSource,
  /useDesignPageDeleteSelectionShortcut\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The workspace should delegate Delete and Backspace selection handling through grouped contracts."
);
assert.match(
  workspaceSource,
  /useDesignPageSelectionKeyboardController\(\{[\s\S]*?state:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The workspace should delegate placement, item, and plan-room shortcuts through grouped contracts."
);
assert.match(
  workspaceSource,
  /useDesignPageSelectionKeyboardController\(\{[\s\S]{0,500}?selectedItemId:\s*selectedItem\?\.instanceId \?\? null,/,
  "The keyboard controller should receive selected-item identity for rotation input synchronization."
);
assert.match(
  keyboardSource,
  /useEffect\(\(\) => \{[\s\S]*?if \(!hasSelectedItem\)[\s\S]*?setRotationInputValue\(String\(selectedRotationDegrees\)\);[\s\S]*?\}, \[hasSelectedItem, selectedItemId, selectedRotationDegrees, setRotationInputValue\]\);/,
  "Rotation input synchronization should rerun when the selected item identity changes."
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

const selectedItemBase = {
  canEdit: true,
  hasSelectedItem: true,
} as const;

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
  { type: "rotate", degrees: 90 },
  "R should rotate the selected item by a quarter turn."
);
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
