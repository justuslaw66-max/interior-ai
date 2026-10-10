import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { handleUndoRedoKeyDown } from "../hooks/useUndoRedoHotkeys";
import {
  resolvePendingPlacementKeyboardCommand,
  resolveSelectedItemKeyboardCommand,
  resolveSelectedPlanKeyboardCommand,
} from "../lib/design-page-selection-keyboard-commands";
import {
  isEditingShortcutBlocked,
  isKeyboardCapturedByDialog,
  isKeyboardInputTarget,
  isSingleKeyShortcutBlocked,
  type EditorShortcutEvent,
} from "../lib/editor-shortcut-guard";
import {
  handleFloorPlanTracingKeyDown,
  type UseDesignPageFloorPlanTracingKeyboardInput,
} from "../lib/useDesignPageFloorPlanTracingKeyboard";

// One rule for the editor's shortcuts (UX audit ED12): typing wins, single keys leave ⌘, Ctrl
// and Alt to the browser, and editing shortcuts don't act behind an open dialog.

const element = (fields: Record<string, unknown>) => fields as unknown as EventTarget;
const withRole = (tagName: string, role: string) =>
  element({ tagName, getAttribute: (name: string) => (name === "role" ? role : null) });
const inDialog = element({ tagName: "BUTTON", closest: () => ({ role: "dialog" }) });
const button = element({ tagName: "BUTTON", closest: () => null });
const openDialogRoot = { querySelector: () => ({}) } as unknown as Pick<Document, "querySelector">;
const keyEvent = (key: string, extra: Partial<EditorShortcutEvent> = {}): EditorShortcutEvent => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
  target: button,
  ...extra,
});

// Controls that use keys themselves.
for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
  assert.equal(isKeyboardInputTarget(element({ tagName })), true, `${tagName} keeps its keys.`);
}
assert.equal(isKeyboardInputTarget(element({ tagName: "DIV", isContentEditable: true })), true);
for (const role of ["textbox", "searchbox", "combobox", "spinbutton", "slider", "menuitem", "option", "radio", "tab"]) {
  assert.equal(isKeyboardInputTarget(withRole("DIV", role)), true, `role=${role} keeps its keys.`);
}
assert.equal(isKeyboardInputTarget(withRole("BUTTON", "switch")), false, "A switch doesn't use the arrows.");
assert.equal(isKeyboardInputTarget(button), false);
assert.equal(isKeyboardInputTarget(null), false);

// Dialogs own the keyboard.
assert.equal(isKeyboardCapturedByDialog(inDialog, null), true, "A key from inside a dialog.");
assert.equal(isKeyboardCapturedByDialog(button, openDialogRoot), true, "A dialog open elsewhere.");
assert.equal(isKeyboardCapturedByDialog(button, null), false);

// Editing shortcuts: a field's own undo wins, and nothing changes behind a dialog.
assert.equal(isEditingShortcutBlocked(keyEvent("z", { metaKey: true }), null), false);
assert.equal(isEditingShortcutBlocked(keyEvent("z", { metaKey: true, target: element({ tagName: "INPUT" }) }), null), true);
assert.equal(isEditingShortcutBlocked(keyEvent("z", { metaKey: true, isComposing: true }), null), true);
assert.equal(isEditingShortcutBlocked(keyEvent("z", { metaKey: true, keyCode: 229 }), null), true);
assert.equal(isEditingShortcutBlocked(keyEvent("z", { metaKey: true }), openDialogRoot), true);

// Single keys: never with ⌘, Ctrl or Alt; Shift is fine.
for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
  assert.equal(isSingleKeyShortcutBlocked(keyEvent("f", modifier), { root: null }), true, Object.keys(modifier)[0]);
}
assert.equal(isSingleKeyShortcutBlocked(keyEvent("R"), { root: null }), false);
assert.equal(isSingleKeyShortcutBlocked(keyEvent("d", { target: element({ tagName: "SELECT" }) }), { root: null }), true);
assert.equal(isSingleKeyShortcutBlocked(keyEvent("p", { target: inDialog }), { root: null }), true);
assert.equal(
  isSingleKeyShortcutBlocked(keyEvent("p", { target: inDialog }), { inDialogs: true, root: null }),
  false,
  "A shortcut meant for dialogs too (P) still works on a dialog's button."
);

// Undo and redo.
const undoRedo = (event: Partial<EditorShortcutEvent> & { key: string; shiftKey?: boolean }, isMac = true) => {
  const calls: string[] = [];
  let prevented = false;
  handleUndoRedoKeyDown(
    { ...keyEvent(event.key, event), shiftKey: Boolean(event.shiftKey), preventDefault: () => { prevented = true; } },
    { undo: () => calls.push("undo"), redo: () => calls.push("redo"), isMac }
  );
  return { calls, prevented };
};
assert.deepEqual(undoRedo({ key: "z", metaKey: true }), { calls: ["undo"], prevented: true });
assert.deepEqual(undoRedo({ key: "z", metaKey: true, shiftKey: true }), { calls: ["redo"], prevented: true });
assert.deepEqual(undoRedo({ key: "y", metaKey: true }), { calls: ["redo"], prevented: true });
assert.deepEqual(undoRedo({ key: "z", ctrlKey: true }), { calls: [], prevented: false }, "Ctrl+Z isn't undo on a Mac.");
assert.deepEqual(undoRedo({ key: "z", ctrlKey: true }, false), { calls: ["undo"], prevented: true });
assert.deepEqual(
  undoRedo({ key: "z", metaKey: true, target: element({ tagName: "INPUT" }) }),
  { calls: [], prevented: false },
  "⌘Z in a text field undoes the typing, not the design."
);
assert.deepEqual(
  undoRedo({ key: "z", metaKey: true, target: inDialog }),
  { calls: [], prevented: false },
  "⌘Z doesn't change the design behind an open dialog."
);

// Selection keys: arrows with ⌘, Ctrl or Alt aren't nudges; ⌘D still duplicates.
const itemBase = {
  canEdit: true,
  hasSelectedItem: true,
  keyboardShortcutsEnabled: true,
  rotationSnapEnabled: true,
  rotationSnapStepDegrees: 15,
};
assert.deepEqual(resolveSelectedItemKeyboardCommand({ ...itemBase, key: "ArrowLeft" }), { type: "nudge", deltaX: -0.05, deltaZ: 0 });
assert.equal(resolveSelectedItemKeyboardCommand({ ...itemBase, key: "ArrowLeft", metaKey: true }), null);
assert.equal(resolveSelectedItemKeyboardCommand({ ...itemBase, key: "ArrowUp", altKey: true }), null);
assert.deepEqual(resolveSelectedItemKeyboardCommand({ ...itemBase, key: "d", metaKey: true }), { type: "duplicate" });
assert.equal(
  resolvePendingPlacementKeyboardCommand({ canEdit: true, hasPendingPlacement: true, key: "ArrowRight", ctrlKey: true }),
  null
);
const roomBase = {
  canEdit: true,
  hasSelectedItem: false,
  selectedItemCount: 0,
  selectedPlanOverlayId: null,
  selectedPlanRoomId: "room-1",
  selectedZoneId: null,
  viewMode: "2d",
} as const;
assert.equal(resolveSelectedPlanKeyboardCommand({ ...roomBase, key: "ArrowLeft", metaKey: true }), null);
assert.deepEqual(resolveSelectedPlanKeyboardCommand({ ...roomBase, key: "d", metaKey: true }), { type: "duplicate-room", roomId: "room-1" });

// Drawing keys: Plan's, and never with ⌘, Ctrl or Alt (⌘F stays the browser's Find).
const tracing = (editorMode: UseDesignPageFloorPlanTracingKeyboardInput["state"]["editorMode"]) => {
  const calls: string[] = [];
  const input: UseDesignPageFloorPlanTracingKeyboardInput = {
    state: { editorMode, isClientPreview: false, selectedPlanOverlayId: null, selectedPlanRoomId: "room-1", selectedZoneId: null, viewMode: "2d" },
    capabilities: {
      keyboardOwnership: {
        floorPlanTraceRoomModeRef: { current: false },
        selectedIdsRef: { current: new Set<string>() },
        keyboardShortcutsEnabled: true,
      },
    },
    actions: {
      addFloorPlanOpeningFromTool: (kind) => calls.push(`opening:${kind}`),
      cancelActiveFloorPlanDraw: () => false,
      changeDrawRoomMode: (mode) => calls.push(`draw:${mode}`),
      clearAllSelection: () => calls.push("clear"),
      handleUndoFloorPlanTraceRoomPoint: () => false,
      selectFloorPlanTool: () => calls.push("select"),
    },
  };
  const press = (key: string, extra: Partial<KeyboardEvent> = {}) => {
    let prevented = false;
    const event = {
      key,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      repeat: false,
      target: null,
      preventDefault: () => { prevented = true; },
      stopPropagation: () => undefined,
      ...extra,
    } as unknown as KeyboardEvent;
    handleFloorPlanTracingKeyDown(event, input);
    return prevented;
  };
  return { calls, press };
};
const plan = tracing("design");
assert.equal(plan.press("f"), true);
assert.equal(plan.press("f", { metaKey: true }), false, "⌘F is Find, not a rectangle room.");
assert.equal(plan.press("b", { ctrlKey: true }), false, "Ctrl+B toggles the panel, not Custom shape.");
assert.equal(plan.press("d", { metaKey: true }), false, "⌘D duplicates; it doesn't add a door.");
assert.equal(plan.press("d"), true);
assert.deepEqual(plan.calls, ["draw:rectangle_wall", "opening:door"]);
const furnish = tracing("adjust");
assert.equal(furnish.press("d"), false, "Furnish's 2D view has no drawing keys.");
assert.equal(furnish.press("f"), false);
furnish.press("Escape");
assert.deepEqual(furnish.calls, ["clear"], "Escape still deselects in every step.");

// Every listener follows the rule.
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
assert.match(source("hooks/useUndoRedoHotkeys.ts"), /if \(!mod \|\| isEditingShortcutBlocked\(event\)\) return;/);
assert.match(source("lib/design-page-presentation-hotkey.ts"), /isSingleKeyShortcutBlocked\(event, \{ inDialogs: true \}\)/);
assert.match(
  source("lib/useDesignPageSelectionKeyboard.ts"),
  /const handleDeleteKey = \(event: KeyboardEvent\) => \{[\s\S]{0,160}?isDesignPageSelectionShortcutBlocked\(event\.target\)/
);
assert.doesNotMatch(source("lib/useDesignPageSelectionKeyboard.ts"), /isDeleteShortcutTarget/);
assert.match(source("lib/design-page-selection-keyboard-commands.ts"), /return isEditorShortcutTargetBlocked\(target\);/);
assert.match(
  source("components/editor/DesignControlsPanelFrame.tsx"),
  /event\.key\.toLowerCase\(\) !== "b"[\s\S]{0,80}?if \(isEditorShortcutTargetBlocked\(event\.target\)\) return;/
);
assert.match(
  source("lib/useDesignPageFloorPlanTracingKeyboard.ts"),
  /if \(input\.state\.editorMode !== "design" \|\| hasCommandModifier\(event\)\) return;/
);

console.log("Editor shortcut guard checks passed.");
