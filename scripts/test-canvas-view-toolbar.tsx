import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { CanvasViewToolbar, canvasToolbarLeft } from "../components/editor/canvas/CanvasViewToolbar";
import { KeyboardShortcutsButton, KeyboardShortcutsList } from "../components/editor/canvas/KeyboardShortcutsSheet";
import { PhoneCanvasPills } from "../components/editor/canvas/PhoneCanvasPills";
import { handleUndoRedoKeyDown } from "../hooks/useUndoRedoHotkeys";
import { resolveDesignPagePresentHotkey } from "../lib/design-page-presentation-hotkey";
import {
  resolvePendingPlacementKeyboardCommand,
  resolveSelectedItemKeyboardCommand,
  resolveSelectedPlanKeyboardCommand,
} from "../lib/design-page-selection-keyboard-commands";
import { resolveCanvasLeftInsetPx } from "../lib/editor-canvas-insets";
import {
  EDITOR_SHORTCUT_GROUPS,
  chordKeyLabels,
  chordSpokenLabel,
  isKeyboardShortcutsKey,
  visibleShortcutGroups,
  type ShortcutChord,
} from "../lib/editor-shortcuts";

// UX phase 4c: the canvas toolbar (2D | 3D, Fit, Undo, Redo over the canvas from md) and the
// Keyboard shortcuts sheet, whose list must match what the editor's keys do. UX phase 4d: on
// phones, 2D | 3D and Undo/Redo are two pills over the canvas.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const noop = () => {};

// The toolbar.
const toolbarProps = {
  dark: false,
  leftInsetPx: 318,
  viewMode: "2d" as const,
  onViewModeChange: noop,
  canFit: true,
  onFit: noop,
  canUndo: true,
  canRedo: false,
  undoName: "Remove Avery Armchair",
  redoName: null,
  onUndo: noop,
  onRedo: noop,
};
const toolbar = renderToStaticMarkup(<CanvasViewToolbar {...toolbarProps} />);
assert.match(toolbar, /^<div role="group" aria-label="Canvas controls" data-testid="canvas-view-toolbar" class="absolute top-bar-4 z-40 flex -translate-x-1\/2 /);
assert.match(toolbar, /style="left:clamp\(462px, calc\(50% \+ 159px\), calc\(100% - 496px\)\)"/);
const order = ["editor-view-toggle", "editor-view-2d", "editor-view-3d", "canvas-fit-view", "command-undo", "command-redo"];
const positions = order.map((testId) => toolbar.indexOf(`data-testid="${testId}"`));
assert.ok(positions.every((position, index) => position > 0 && (index === 0 || position > positions[index - 1])), "2D | 3D, then Fit, Undo and Redo.");
assert.match(toolbar, /aria-label="2D" aria-pressed="true" data-testid="editor-view-2d" class="inline-flex h-8 [^"]*bg-neutral-900 text-white"/);
// Fit, Undo and Redo are the shared Button's 36px quiet icon buttons (AX10).
assert.match(toolbar, /<button type="button" class="[^"]*\bh-9 w-9 shrink-0 rounded-lg p-0 border-transparent bg-transparent\b[^"]*" data-testid="canvas-fit-view" aria-label="Fit to screen" title="Fit to screen">/);
assert.match(toolbar, /<button type="button" class="[^"]*\bh-9 w-9\b[^"]*" data-testid="command-undo" aria-label="Undo Remove Avery Armchair" title="Undo &quot;Remove Avery Armchair&quot; \(Cmd\/Ctrl\+Z\)"><svg/);
assert.match(toolbar, /<button type="button" class="[^"]*\bh-9 w-9\b[^"]*" data-testid="command-redo" aria-label="Redo" title="Redo \(Cmd\/Ctrl\+Shift\+Z\)" disabled="">/);
assert.match(toolbar, /focus-visible:ring-2 focus-visible:ring-focus/);
const unfit = renderToStaticMarkup(<CanvasViewToolbar {...toolbarProps} canFit={false} />);
assert.match(unfit, /data-testid="canvas-fit-view"[^>]*disabled=""/, "Fit waits for a room.");

// Centred on the canvas right of the step panel, but clear of a 340px right panel and the step panel.
assert.equal(canvasToolbarLeft(0), "clamp(144px, calc(50% + 0px), calc(100% - 496px))");
for (const [input, expected] of [
  [{ panelVisible: false, shopping: false, collapsed: false, isDesigner: false }, 0],
  [{ panelVisible: true, shopping: false, collapsed: false, isDesigner: false }, 318],
  [{ panelVisible: true, shopping: false, collapsed: false, isDesigner: true }, 398],
  [{ panelVisible: true, shopping: false, collapsed: true, isDesigner: false }, 88],
  [{ panelVisible: true, shopping: false, collapsed: true, isDesigner: true }, 128],
  [{ panelVisible: true, shopping: true, collapsed: true, isDesigner: false }, 318],
] as const) {
  assert.equal(resolveCanvasLeftInsetPx(input), expected, JSON.stringify(input));
}
assert.match(read("lib/useDesignPagePlanPresentationModel.ts"), /const plan2DSafeAreaLeftPx = resolveCanvasLeftInsetPx\(\{/, "The 2D fit and the toolbar share one inset.");

// The phone's pills (UX 4d, the PhonePlan mockup): 2D | 3D top left, Undo and Redo top right, 12px
// under the bar, with 44px targets that keep the controls' test ids.
const pills = renderToStaticMarkup(<PhoneCanvasPills dark={false} viewMode="3d" onViewModeChange={noop} canUndo canRedo={false}
  undoName="Remove Avery Armchair" redoName={null} onUndo={noop} onRedo={noop} />);
assert.match(pills, /^<div data-testid="canvas-view-pill" class="absolute top-bar-3 z-40 [^"]*left-3"><div role="group" aria-label="Design view" data-testid="editor-view-toggle"/);
assert.match(pills, /aria-label="3D" aria-pressed="true" data-testid="editor-view-3d" class="inline-flex h-11 w-12 [^"]*bg-neutral-900 text-white"/);
assert.match(pills, /<div role="group" aria-label="History" data-testid="canvas-history-pill" class="absolute top-bar-3 z-40 [^"]*right-3">/);
assert.match(pills, /<button type="button" data-testid="command-undo" aria-label="Undo Remove Avery Armchair" title="Undo &quot;Remove Avery Armchair&quot; \(Cmd\/Ctrl\+Z\)" class="inline-flex h-11 w-11 /);
assert.match(pills, /data-testid="command-redo" aria-label="Redo" [^>]*disabled="">/);
assert.doesNotMatch(pills, /outline-hidden|canvas-fit-view/, "The global focus outline shows; Fit is the toolbar's.");

// Where the toolbar, the pills and the sheet live: over the canvas, not in Client Preview or Shop.
const chrome = read("components/editor/design-page/DesignPageEditorChrome.tsx");
assert.match(chrome, /const wide = useMediaQuery\(CANVAS_TOOLBAR_MEDIA_QUERY\);/);
assert.match(chrome, /const overCanvas = !bar\.isClientPreview && bar\.editorMode !== "buy";\s*const onCanvas = wide && overCanvas;/);
assert.match(chrome, /\{overCanvas && !wide \? \(\s*<PhoneCanvasPills/);
assert.match(chrome, /\{onCanvas \? \(\s*<CanvasViewToolbar/);
assert.match(chrome, /canFit=\{Boolean\(state\.commandBar\.room\) && bar\.editorMode !== "present"\}/);
assert.match(chrome, /\{onCanvas \? <KeyboardShortcutsButton dark=\{dark\} \/> : null\}/);
assert.match(chrome, /<KeyboardShortcutsSheet enabled=\{!bar\.isClientPreview\}/);
assert.match(read("lib/useMediaQuery.ts"), /CANVAS_TOOLBAR_MEDIA_QUERY = "\(min-width: 48rem\)"/);
const corner = renderToStaticMarkup(<KeyboardShortcutsButton dark={false} />);
assert.match(
  corner,
  /^<button type="button" class="[^"]*\bh-10 w-10 shrink-0 rounded-full p-0 border-neutral-300 bg-white\b[^"]*\babsolute bottom-4 right-4 z-30 max-lg:hidden shadow-sm[^"]*" data-testid="canvas-keyboard-shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts \(\?\)">/,
  "The shared Button's 40px circle, from lg, under any open panel."
);
assert.match(
  read("lib/useDesignPageCommandPalette.ts"),
  /id: "keyboard-shortcuts", label: "Keyboard shortcuts"[\s\S]{0,200}?run: \(\) => window\.requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(openKeyboardShortcuts\)\)/
);
assert.match(read("components/editor/design-page/LightingSettingsDrawer.tsx"), /if \(viewMode !== "3d"\) setOpen\(false\);/, "Leaving 3D from the toolbar closes Lighting too.");

// The sheet's list.
const ids = EDITOR_SHORTCUT_GROUPS.map((group) => group.id);
assert.deepEqual(ids, ["general", "product", "placing", "plan", "room", "pro"]);
for (const group of EDITOR_SHORTCUT_GROUPS) {
  const actions = group.shortcuts.map((shortcut) => shortcut.action);
  assert.equal(new Set(actions).size, actions.length, `${group.id} lists each action once`);
}
assert.deepEqual(visibleShortcutGroups(false).map((group) => group.id), ["general", "product", "placing", "plan", "room"]);
assert.deepEqual(visibleShortcutGroups(true).map((group) => group.id), ids);
assert.deepEqual(chordKeyLabels(["Mod", "Shift", "Z"], true), ["⌘", "⇧", "Z"]);
assert.deepEqual(chordKeyLabels(["Mod", "Shift", "Z"], false), ["Ctrl", "Shift", "Z"]);
assert.deepEqual(chordKeyLabels(["Shift", "Arrows"], false), ["Shift", "← ↑ → ↓"]);
assert.equal(chordSpokenLabel(["Mod", "Y"], true), "Command Y");
assert.equal(chordSpokenLabel(["Mod", "Y"], false), "Control Y");
assert.equal(chordSpokenLabel(["Esc"], false), "Escape");

const listOther = renderToStaticMarkup(<KeyboardShortcutsList isDesigner={false} isMac={false} />);
const listMac = renderToStaticMarkup(<KeyboardShortcutsList isDesigner isMac />);
assert.match(listOther, /<dt>Redo<\/dt><dd[^>]*>(?:<span[^>]*>)+<span class="sr-only">Control Shift Z<\/span><kbd aria-hidden="true"[^>]*>Ctrl<\/kbd>/);
assert.match(listOther, /<span class="text-xs text-neutral-600">or<\/span><span[^>]*><span class="sr-only">Control Y<\/span>/);
assert.match(listMac, /<span class="sr-only">Command Z<\/span><kbd aria-hidden="true"[^>]*>⌘<\/kbd>/);
assert.doesNotMatch(listOther, /Presentation mode/, "Pro's P only with Pro.");
assert.match(listMac, /data-testid="keyboard-shortcuts-pro"[\s\S]*Presentation mode/);
assert.match(listOther, /Drawing the plan<span[^>]*>In Plan, in 2D<\/span>/);

// Every listed key does what the sheet says.
type Event = { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean };
function eventsFor(chord: ShortcutChord, mod: "meta" | "ctrl" = "meta"): Event[] {
  const keys = chord.filter((key) => key !== "Mod" && key !== "Shift");
  const base = { shiftKey: chord.includes("Shift"), metaKey: chord.includes("Mod") && mod === "meta", ctrlKey: chord.includes("Mod") && mod === "ctrl", altKey: false };
  const [key] = keys;
  const names =
    key === "Arrows" ? ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]
    : key === "Esc" ? ["Escape"]
    : /^[A-Z]$/.test(key) ? [base.shiftKey ? key : key.toLowerCase()]
    : [key];
  return names.map((name) => ({ ...base, key: name }));
}
const shortcutsOf = (id: string) => EDITOR_SHORTCUT_GROUPS.find((group) => group.id === id)!.shortcuts;
const chordsOf = (id: string, action: string) => shortcutsOf(id).find((shortcut) => shortcut.action === action)!.chords;

for (const [isMac, mod] of [[true, "meta"], [false, "ctrl"]] as const) {
  for (const [action, expected] of [["Undo", "undo"], ["Redo", "redo"]] as const) {
    for (const chord of chordsOf("general", action)) {
      for (const event of eventsFor(chord, mod)) {
        const calls: string[] = [];
        handleUndoRedoKeyDown({ ...event, isComposing: false, target: null, preventDefault: noop }, {
          undo: () => calls.push("undo"), redo: () => calls.push("redo"), isMac,
        });
        assert.deepEqual(calls, [expected], `${action}: ${chord.join("+")} (${isMac ? "Mac" : "other"})`);
      }
    }
  }
}
assert.match(read("lib/useDesignPageCommandPalette.ts"), /\(event\.metaKey \|\| event\.ctrlKey\) \|\| event\.key\.toLowerCase\(\) !== "k"/, "⌘K or Ctrl+K opens the palette.");
assert.match(read("components/editor/DesignControlsPanelFrame.tsx"), /\(event\.metaKey \|\| event\.ctrlKey\) \|\| event\.key\.toLowerCase\(\) !== "b"/, "⌘B or Ctrl+B shows or hides the panel.");
const selection = { canEdit: true, hasSelectedItem: false, selectedItemCount: 0, selectedPlanOverlayId: null, selectedPlanRoomId: "room-1", selectedZoneId: null, viewMode: "2d" as const };
assert.deepEqual(resolveSelectedPlanKeyboardCommand({ ...selection, key: "Escape" }), { type: "clear-selection" }, "Esc deselects.");
for (const event of eventsFor(chordsOf("general", "Keyboard shortcuts")[0])) {
  assert.equal(isKeyboardShortcutsKey({ ...event, isComposing: false, target: null }), true, "? opens the sheet.");
}
assert.equal(isKeyboardShortcutsKey({ key: "?", metaKey: true, ctrlKey: false, altKey: false, isComposing: false, target: null }), false);
assert.equal(isKeyboardShortcutsKey({ key: "?", metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target: { tagName: "INPUT" } as unknown as EventTarget }), false, "Typing ? in a field types it.");

const item = { canEdit: true, hasSelectedItem: true, keyboardShortcutsEnabled: true, rotationSnapEnabled: true, rotationSnapStepDegrees: 15 };
const itemExpectations: Record<string, (command: unknown) => boolean> = {
  Nudge: (command) => (command as { type: string; deltaX: number; deltaZ: number }).type === "nudge" && Math.abs((command as { deltaX: number }).deltaX) + Math.abs((command as { deltaZ: number }).deltaZ) === 0.05,
  "Nudge further": (command) => (command as { type: string }).type === "nudge" && Math.abs((command as { deltaX: number }).deltaX) + Math.abs((command as { deltaZ: number }).deltaZ) === 0.25,
  "Turn 90°": (command) => JSON.stringify(command) === JSON.stringify({ type: "rotate", degrees: 90, snap: true }),
  "Turn 90° the other way": (command) => JSON.stringify(command) === JSON.stringify({ type: "rotate", degrees: -90, snap: true }),
  "Turn a little": (command) => (command as { type: string; degrees: number }).type === "rotate" && Math.abs((command as { degrees: number }).degrees) === 15,
  Straighten: (command) => (command as { type: string }).type === "reset-rotation",
  Duplicate: (command) => (command as { type: string }).type === "duplicate",
};
for (const shortcut of shortcutsOf("product")) {
  if (shortcut.action === "Remove") continue;
  for (const chord of shortcut.chords) {
    for (const event of eventsFor(chord)) {
      const command = resolveSelectedItemKeyboardCommand({ ...item, ...event });
      assert.ok(command && itemExpectations[shortcut.action]?.(command), `${shortcut.action}: ${event.key} gave ${JSON.stringify(command)}`);
    }
  }
}
assert.match(read("lib/useDesignPageSelectionKeyboard.ts"), /if \(event\.key !== "Delete" && event\.key !== "Backspace"\) return;/, "Delete or Backspace removes the selected products.");

const placing = { canEdit: true, hasPendingPlacement: true };
const placingExpectations: Record<string, string> = { "Place it": "confirm", "Turn 90°": "rotate", Nudge: "nudge", Cancel: "cancel" };
for (const shortcut of shortcutsOf("placing")) {
  for (const event of eventsFor(shortcut.chords[0])) {
    assert.equal(resolvePendingPlacementKeyboardCommand({ ...placing, ...event })?.type, placingExpectations[shortcut.action], `${shortcut.action}: ${event.key}`);
  }
}

const roomExpectations: Record<string, (command: unknown) => boolean> = {
  Nudge: (command) => JSON.stringify(command).includes('"type":"nudge-room"') && JSON.stringify(command).includes('"snap":true'),
  "Nudge further, without snapping": (command) => JSON.stringify(command).includes('"type":"nudge-room"') && JSON.stringify(command).includes('"snap":false'),
  Duplicate: (command) => (command as { type: string }).type === "duplicate-room",
  Delete: (command) => (command as { type: string }).type === "delete-room",
};
for (const shortcut of shortcutsOf("room")) {
  for (const chord of shortcut.chords) {
    for (const event of eventsFor(chord)) {
      const command = resolveSelectedPlanKeyboardCommand({ ...selection, ...event });
      assert.ok(command && roomExpectations[shortcut.action](command), `${shortcut.action}: ${event.key} gave ${JSON.stringify(command)}`);
    }
  }
}

const tracing = read("lib/useDesignPageFloorPlanTracingKeyboard.ts");
for (const [action, key] of [["Select", "v"], ["Custom shape", "b"], ["Rectangle room", "f"], ["Curved wall", "h"], ["Door", "d"], ["Window", "w"]] as const) {
  assert.deepEqual(chordsOf("plan", action), [[key.toUpperCase()]]);
  assert.match(tracing, new RegExp(`if \\(key === "${key}"`), `${action} is ${key.toUpperCase()} in Plan.`);
}
assert.match(tracing, /input\.state\.editorMode !== "design" \|\| hasCommandModifier\(event\)/, "The drawing keys are Plan's.");
assert.match(tracing, /function handleTracePointUndo[\s\S]*?"Backspace"/, "Backspace removes the last point.");

assert.equal(resolveDesignPagePresentHotkey({ isDesigner: true, event: { key: "p", metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target: null } }), "toggle-client-preview");
assert.equal(resolveDesignPagePresentHotkey({ isDesigner: false, event: { key: "p", metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target: null } }), null);

console.log("Canvas toolbar and keyboard shortcuts checks passed.");
