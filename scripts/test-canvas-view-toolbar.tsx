import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import * as THREE from "three";

import { CanvasFrameCard, applyCanvasLensShift } from "../components/editor/canvas/CanvasFrameCard";
import { CANVAS_TOOLBAR_LEFT, CanvasViewToolbar } from "../components/editor/canvas/CanvasViewToolbar";
import { KeyboardShortcutsButton, KeyboardShortcutsList } from "../components/editor/canvas/KeyboardShortcutsSheet";
import { PhoneCanvasPills } from "../components/editor/canvas/PhoneCanvasPills";
import { handleUndoRedoKeyDown } from "../hooks/useUndoRedoHotkeys";
import { resolveDesignPagePresentHotkey } from "../lib/design-page-presentation-hotkey";
import {
  resolvePendingPlacementKeyboardCommand,
  resolveSelectedItemKeyboardCommand,
  resolveSelectedPlanKeyboardCommand,
} from "../lib/design-page-selection-keyboard-commands";
import {
  FULL_WINDOW_CANVAS,
  WIDE_PLAN_TOP_INSET_PX,
  canvasFrameStyle,
  isWideEditor,
  resolveCanvas3DInsetsPx,
  resolveCanvasFrameBox,
  resolveCanvasLeftInsetPx,
  resolveCanvasLensShiftPx,
  resolvePlanFitInsetsPx,
} from "../lib/editor-canvas-insets";
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

// The toolbar, over the canvas card beside the docked step panel (the rounded inset frame).
const dockedFrame = resolveCanvasFrameBox({ wide: true, clientPreview: false, panelVisible: true, shopping: false, collapsed: false, isDesigner: false });
const toolbarProps = {
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
  savedViews: {
    views: [{ id: "view-1", name: "Sofa corner", cameraPosition: [1, 1.6, 2] as [number, number, number], cameraTarget: [0, 0.8, 0] as [number, number, number] }],
    nameInput: "",
    onNameChange: noop,
    onSave: noop,
    onOpen: noop,
    onDelete: noop,
  },
};
const toolbar = renderToStaticMarkup(<CanvasViewToolbar {...toolbarProps} />);
assert.match(toolbar, /^<div role="group" aria-label="Canvas controls" data-testid="canvas-view-toolbar" class="absolute top-bar-4 z-40 flex -translate-x-1\/2 /);
assert.ok(toolbar.includes(`style="left:${CANVAS_TOOLBAR_LEFT}"`), "The toolbar takes its place from the editor's canvas variables.");
const order = ["editor-view-toggle", "editor-view-2d", "editor-view-3d", "canvas-fit-view", "command-undo", "command-redo"];
const positions = order.map((testId) => toolbar.indexOf(`data-testid="${testId}"`));
assert.ok(positions.every((position, index) => position > 0 && (index === 0 || position > positions[index - 1])), "2D | 3D, then Fit, Undo and Redo.");
// 2D | 3D is the shared segmented control (UX 5n): 32px segments, the pressed one black.
assert.match(toolbar, /aria-pressed="true" data-testid="editor-view-2d" class="[^"]*\bh-8 touch:h-11\b[^"]*\bbg-control-primary text-control-on-primary"/);
// Fit, Undo and Redo are the shared Button's 36px quiet icon buttons (AX10).
assert.match(toolbar, /<button type="button" class="[^"]*\bh-9 w-9 shrink-0 rounded-lg p-0 border-transparent bg-transparent\b[^"]*" data-testid="canvas-fit-view" aria-label="Fit to screen" title="Fit to screen">/);
assert.match(toolbar, /<button type="button" class="[^"]*\bh-9 w-9\b[^"]*" data-testid="command-undo" aria-label="Undo Remove Avery Armchair" title="Undo &quot;Remove Avery Armchair&quot; \(Cmd\/Ctrl\+Z\)"><svg/);
assert.match(toolbar, /<button type="button" class="[^"]*\bh-9 w-9\b[^"]*" data-testid="command-redo" aria-label="Redo" title="Redo \(Cmd\/Ctrl\+Shift\+Z\)" disabled="">/);
assert.match(toolbar, /focus-visible:ring-2 focus-visible:ring-focus/);
const unfit = renderToStaticMarkup(<CanvasViewToolbar {...toolbarProps} canFit={false} />);
assert.match(unfit, /data-testid="canvas-fit-view"[^>]*disabled=""/, "Fit waits for a room.");

// Saved views (UX 4e, SX4; J's Q5): a Views button beside 2D | 3D, in 3D only, that opens the room's
// saved views. They left Present & export, which keeps no view name, Save or list.
assert.doesNotMatch(toolbar, /canvas-saved-views/, "No Views in 2D.");
const toolbar3d = renderToStaticMarkup(<CanvasViewToolbar {...toolbarProps} viewMode="3d" />);
const viewsAt = toolbar3d.indexOf('data-testid="canvas-saved-views"');
assert.ok(viewsAt > toolbar3d.indexOf('data-testid="editor-view-3d"') && viewsAt < toolbar3d.indexOf('data-testid="canvas-fit-view"'), "Views sits beside 2D | 3D.");
assert.match(toolbar3d, /<button type="button" data-testid="canvas-saved-views" aria-haspopup="dialog" aria-expanded="false" class="inline-flex h-8 [^"]*touch:h-11[^"]*"><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>Views<\/button>/);
assert.doesNotMatch(toolbar3d, /canvas-saved-views-panel/, "The panel opens on a press.");
const savedViewsSource = read("components/editor/canvas/CanvasSavedViews.tsx");
for (const testId of ["canvas-saved-views-panel", "saved-camera-view-list", "camera-view-name-input", "save-named-camera-view"]) {
  assert.ok(savedViewsSource.includes(`data-testid="${testId}"`), testId);
}
assert.match(savedViewsSource, /data-testid=\{`saved-camera-view-open-\$\{view\.id\}`\}/);
assert.match(savedViewsSource, /data-testid=\{`saved-camera-view-delete-\$\{view\.id\}`\}[\s\S]*?aria-label=\{`Delete \$\{view\.name\}`\}/);
assert.match(savedViewsSource, /useDismissibleMenu\(\{[\s\S]*?if \(byKeyboard\) buttonRef\.current\?\.focus\(\);/, "Escape hands focus back to Views.");
assert.match(savedViewsSource, /role="dialog"[\s\S]*?aria-labelledby=\{props\.headingId\}/);
assert.equal(existsSync(join(process.cwd(), "components/editor/design-page/PresentExportDialog.tsx")), false, "Saved views left Present & export, which then retired.");
assert.match(read("lib/useDesignPagePresentationQaFacade.ts"), /savedViews: \{ views: state\.document\.activeRoom\?\.savedViews \?\? \[\], nameInput: state\.presentation\.cameraViewNameInput \}/);
assert.match(read("lib/useDesignPagePresentationQaFacade.ts"), /savedViews: savedViewActions\(presentExport\.actions\)/);

// Centred on the canvas card, but clear of a 340px right panel and the step panel. The card's place
// comes from the editor's CSS variables (30 Oct 2026), from the frame the 2D fit uses: 1440 wide,
// clamp(490px, 720 + 147px, 900px) is 867, the card's middle.
assert.equal(
  CANVAS_TOOLBAR_LEFT,
  "clamp(calc(var(--canvas-frame-left, 0px) + 188px), calc(50% + (var(--canvas-frame-left, 0px) - var(--canvas-frame-right, 0px)) / 2), calc(100% - 540px))"
);
assert.deepEqual(canvasFrameStyle(dockedFrame), {
  "--canvas-frame-left": "302px",
  "--canvas-frame-right": "8px",
  "--canvas-centre-x": "calc(302px + (100% - 310px) / 2)",
  "--canvas-overlay-max-width": "calc(100% - 310px - 2rem)",
});
assert.equal(canvasFrameStyle(FULL_WINDOW_CANVAS)["--canvas-centre-x" as never], "calc(0px + (100% - 0px) / 2)", "Phones: the window's middle.");
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
assert.match(read("lib/useDesignPagePlanPresentationModel.ts"), /const plan2DSafeAreaLeftPx = resolveCanvasLeftInsetPx\(\{/, "The 2D fit keeps the plan clear of the step panel.");

// The rounded inset frame (J, 13 and 23 Oct): from md the canvas is a card 8px into the frame,
// under the bar and beside the docked step panel; phones and Client Preview keep the whole window.
const frameFor = (input: Partial<Parameters<typeof resolveCanvasFrameBox>[0]>) =>
  resolveCanvasFrameBox({ wide: true, clientPreview: false, panelVisible: true, shopping: false, collapsed: false, isDesigner: false, ...input });
assert.deepEqual(frameFor({}), { leftPx: 302, topPx: 64, rightPx: 8, bottomPx: 8 }, "Beside the step panel's cards (8 to 294px).");
assert.equal(frameFor({ isDesigner: true }).leftPx, 374, "Pro's panel sits beside the tool rail (80 to 366px).");
assert.equal(frameFor({ collapsed: true }).leftPx, 8, "Hidden, the card takes the panel's place.");
assert.equal(frameFor({ collapsed: true, isDesigner: true }).leftPx, 80, "Pro's tool rail stays.");
assert.equal(frameFor({ panelVisible: false }).leftPx, 8);
assert.equal(frameFor({ shopping: true, collapsed: true }).leftPx, 302, "Shop keeps the panel's place, so leaving it doesn't resize the canvas.");
assert.equal(frameFor({ wide: false }), FULL_WINDOW_CANVAS, "Phones keep the whole window.");
assert.equal(frameFor({ clientPreview: true }), FULL_WINDOW_CANVAS, "So does Client Preview (J, 23 Oct).");
assert.equal(frameFor({}), frameFor({}), "One object per frame, so effects can depend on it.");
// The 2D fit's insets are measured from the editor's sides and count from the card's edges.
assert.equal(isWideEditor(714, dockedFrame), true, "A 1024 window's card is 714px wide, but the editor is md.");
assert.equal(isWideEditor(714), false);
assert.deepEqual(
  resolvePlanFitInsetsPx(1130, { leftPx: 318, rightPx: 284, topPx: 0, bottomPx: 0, frame: dockedFrame }),
  { safeAreaLeftPx: 16, safeAreaRightPx: 284, safeAreaTopPx: WIDE_PLAN_TOP_INSET_PX - 64, safeAreaBottomPx: 0 },
  "Clear of the step panel and the right rail, under the toolbar."
);
assert.deepEqual(
  resolvePlanFitInsetsPx(1440, { leftPx: 318, rightPx: 284, topPx: 0, bottomPx: 0 }),
  { safeAreaLeftPx: 318, safeAreaRightPx: 284, safeAreaTopPx: WIDE_PLAN_TOP_INSET_PX, safeAreaBottomPx: 0 },
  "A canvas that fills the editor takes the insets as they are."
);
// The toolbar centres on the card the canvas sits in, from the variables the editor sets from the
// scene's frame, so it moves with Plan's canvas focus; the chrome no longer works out its own.
assert.doesNotMatch(read("components/editor/design-page/DesignPageEditorChrome.tsx"), /resolveCanvasFrameBox/);
assert.match(read("components/editor/design-page/DesignPageWorkspace.tsx"), /max-md:bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\]"\} style=\{canvasFrameStyle\(sceneRegionModel\.configuration\.canvas\.planSafeArea\.frame\)\}>\s*<CanvasBehindPage[\s\S]*?<DesignPageEditorChrome /);
assert.match(read("lib/useDesignPagePlanPresentationModel.ts"), /const canvasFrame = resolveCanvasFrameBox\(\{ wide: viewportWidth >= 768, clientPreview: isClientPreview, panelVisible: primaryLeftPanelVisible, \.\.\.leftPanel \}\);/);
assert.equal(
  renderToStaticMarkup(<CanvasFrameCard frame={dockedFrame}><canvas /></CanvasFrameCard>),
  '<div data-testid="canvas-frame-card" data-canvas-framed="true" class="absolute overflow-hidden rounded-xl bg-surface-canvas" style="left:302px;top:64px;right:8px;bottom:8px"><canvas></canvas></div>',
  "The card: 12px corners, 8px into the frame, in the canvas's own colour."
);
assert.match(
  renderToStaticMarkup(<CanvasFrameCard frame={FULL_WINDOW_CANVAS}><canvas /></CanvasFrameCard>),
  /data-canvas-framed="false" class="absolute overflow-hidden bg-surface-canvas" style="left:0;top:0;right:0;bottom:0"/
);
assert.match(read("components/editor/design-page/DesignSceneCanvas.tsx"), /<CanvasFrameCard frame=\{configuration\.planSafeArea\.frame\}>\s*<Canvas\s/, "The scene sizes itself to the card.");

// 3D's lens (23 Oct, after the Mac's screenshots): the right rail floats inside the card, so a 3D
// view centred on the card's middle sat partly under it. The picture's centre moves left instead,
// between the step panel's margin and the rail, and the camera keeps its angle.
const docked3DInsets = resolveCanvas3DInsetsPx({ wide: true, planLeftInsetPx: 318, frame: dockedFrame, overlayStackVisible: true, overlayStackWidthPx: 264 });
assert.deepEqual(docked3DInsets, { leftPx: 16, rightPx: 296 }, "The step panel's margin, and the rail's 264px with room round it.");
assert.equal(resolveCanvasLensShiftPx(docked3DInsets), 140, "1440 wide: the picture's centre at 727, midway between 318 and 1136.");
assert.equal(resolveCanvasLensShiftPx(resolveCanvas3DInsetsPx({ wide: true, planLeftInsetPx: 318, frame: dockedFrame, overlayStackVisible: false, overlayStackWidthPx: 264 })), -8, "Under 1024 there's no rail.");
assert.deepEqual(resolveCanvas3DInsetsPx({ wide: false, planLeftInsetPx: 0, frame: FULL_WINDOW_CANVAS, overlayStackVisible: false, overlayStackWidthPx: 264 }), { leftPx: 0, rightPx: 0 }, "Phones and Client Preview: none.");
const lensCamera = new THREE.PerspectiveCamera(46, 1130 / 828, 0.1, 300);
lensCamera.position.set(4, 3, 6);
lensCamera.lookAt(0, 1, 0);
lensCamera.updateMatrixWorld();
const targetScreenX = () => ((new THREE.Vector3(0, 1, 0).project(lensCamera).x + 1) / 2) * 1130;
assert.equal(applyCanvasLensShift(lensCamera, 1130, 828, 140), true);
assert.ok(Math.abs(targetScreenX() - (565 - 140)) < 1e-6, "What the camera looks at shows 140px left of the middle.");
assert.deepEqual(lensCamera.position.toArray(), [4, 3, 6], "The camera stays put.");
assert.equal(applyCanvasLensShift(lensCamera, 1130, 828, 0), true);
assert.ok(Math.abs(targetScreenX() - 565) < 1e-6, "Back in the middle.");
assert.equal(applyCanvasLensShift(lensCamera, 1130, 828, 0), false, "Nothing to put back.");
assert.equal(applyCanvasLensShift(new THREE.OrthographicCamera(), 1130, 828, 140), false, "2D's camera fits itself.");
assert.match(read("components/editor/design-page/DesignSceneCanvas.tsx"), /<CanvasLensShift shiftPx=\{configuration\.planSafeArea\.lensShiftPx\} \/>/);
assert.match(read("lib/useDesignPagePlanPresentationModel.ts"), /const canvasLensShiftPx = resolveCanvasLensShiftPx\(resolveCanvas3DInsetsPx\(\{ wide: viewportWidth >= 768, planLeftInsetPx: plan2DSafeAreaLeftPx, frame: canvasFrame,/);
assert.match(read("lib/useDesignPageCameraNavigation.ts"), /resolveCanvas3DInsetsPx\(\{[\s\S]*?\}\);[\s\S]*?const desiredCenterXPx = viewportWidthPx \/ 2;/, "The whole-home view fits between the insets and centres on the lens.");

// The phone's pills (UX 4d, the PhonePlan mockup): 2D | 3D top left, Undo and Redo top right, 12px
// under the bar, with 44px targets that keep the controls' test ids.
const pills = renderToStaticMarkup(<PhoneCanvasPills viewMode="3d" onViewModeChange={noop} canUndo canRedo={false}
  undoName="Remove Avery Armchair" redoName={null} onUndo={noop} onRedo={noop} savedViews={toolbarProps.savedViews} />);
assert.match(pills, /^<div data-testid="canvas-view-pill" class="absolute top-bar-3 z-40 [^"]*left-3"><div role="group" aria-label="Design view" data-testid="editor-view-toggle"/);
assert.match(pills, /aria-pressed="true" data-testid="editor-view-3d" class="[^"]*\bh-11 min-w-12\b[^"]*\bbg-control-primary text-control-on-primary"/);
assert.match(pills, /<div role="group" aria-label="History" data-testid="canvas-history-pill" class="absolute top-bar-3 z-40 [^"]*right-3">/);
assert.match(pills, /<button type="button" data-testid="command-undo" aria-label="Undo Remove Avery Armchair" title="Undo &quot;Remove Avery Armchair&quot; \(Cmd\/Ctrl\+Z\)" class="inline-flex h-11 w-11 /);
assert.match(pills, /data-testid="command-redo" aria-label="Redo" [^>]*disabled="">/);
assert.doesNotMatch(pills, /outline-hidden|canvas-fit-view/, "The global focus outline shows; Fit is the toolbar's.");
assert.match(pills, /data-testid="editor-view-3d"[\s\S]*?<button type="button" data-testid="canvas-saved-views" aria-haspopup="dialog" aria-expanded="false" class="inline-flex h-11 /, "Views is a 44px target in the phone's view pill, in 3D.");

// Where the toolbar, the pills and the sheet live: over the canvas, not in Client Preview or Shop.
const chrome = read("components/editor/design-page/DesignPageEditorChrome.tsx");
assert.match(chrome, /const wide = useMediaQuery\(CANVAS_TOOLBAR_MEDIA_QUERY\);/);
assert.match(chrome, /const overCanvas = !bar\.isClientPreview && bar\.editorMode !== "buy";\s*const onCanvas = wide && overCanvas;/);
assert.match(chrome, /\{overCanvas && !wide \? \(\s*<PhoneCanvasPills/);
assert.match(chrome, /\{onCanvas \? \(\s*<CanvasViewToolbar/);
assert.match(chrome, /canFit=\{Boolean\(state\.commandBar\.room\)\}/);
assert.match(chrome, /\{onCanvas \? <KeyboardShortcutsButton \/> : null\}/);
assert.match(chrome, /<KeyboardShortcutsSheet enabled=\{!bar\.isClientPreview\}/);
assert.match(read("lib/useMediaQuery.ts"), /CANVAS_TOOLBAR_MEDIA_QUERY = "\(min-width: 48rem\)"/);
const corner = renderToStaticMarkup(<KeyboardShortcutsButton />);
assert.match(
  corner,
  /^<button type="button" class="[^"]*\bh-10 w-10 shrink-0 rounded-full p-0 border-control-secondary-border bg-control-secondary\b[^"]*\babsolute bottom-4 right-4 z-30 max-lg:hidden shadow-sm[^"]*" data-testid="canvas-keyboard-shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts \(\?\)">/,
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
assert.match(listOther, /<span class="text-xs text-label-secondary">or<\/span><span[^>]*><span class="sr-only">Control Y<\/span>/);
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
