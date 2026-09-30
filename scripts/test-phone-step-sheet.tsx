import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { resolvePlan2DViewFit } from "../components/editor/camera/EditorCamera2D";
import { PhoneStepSheet } from "../components/editor/PhoneStepSheet";
import { resolvePlanFitInsetsPx, WIDE_PLAN_TOP_INSET_PX } from "../lib/editor-canvas-insets";
import {
  PHONE_CANVAS_TOP_INSET_PX,
  PHONE_SHEET_PEEK_PX,
  PHONE_STEP_BAR_PX,
  getPhoneSheetState,
  isPhoneSheetInspectorSelection,
  nearestPhoneSheetSnap,
  nextPhoneSheetSnap,
  phoneSheetHeightPx,
  resolvePhoneCanvasInsets,
  setPhoneSheetState,
} from "../lib/phone-step-sheet";

// UX phase 4d: on phones the step panel is a sheet over the canvas (peek, half and full), whose
// handle is a real button, and the plan is framed between the header's pills and the sheet.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const noop = () => {};

// Heights: peek is the handle and the title; half is the mockups' (46% of the screen, at most
// 420px); full reaches 8px under the canvas pills (the 56px header plus 64px).
assert.equal(PHONE_CANVAS_TOP_INSET_PX, 128);
assert.equal(phoneSheetHeightPx("peek", 844), PHONE_SHEET_PEEK_PX);
assert.equal(phoneSheetHeightPx("half", 844), 388);
assert.equal(phoneSheetHeightPx("full", 844), 844 - 128 - PHONE_STEP_BAR_PX);
assert.equal(phoneSheetHeightPx("half", 667), 307);
assert.equal(phoneSheetHeightPx("half", 1000), 420, "Half stops at 420px on tall phones.");
assert.ok(phoneSheetHeightPx("half", 400) <= phoneSheetHeightPx("full", 400), "Half never outgrows full.");
assert.equal(phoneSheetHeightPx("full", 200), PHONE_SHEET_PEEK_PX, "A tiny screen still shows the title.");

// The handle: peek and full go to half, half to full. A drag settles on the nearest height.
assert.equal(nextPhoneSheetSnap("peek"), "half");
assert.equal(nextPhoneSheetSnap("half"), "full");
assert.equal(nextPhoneSheetSnap("full"), "half");
assert.equal(nearestPhoneSheetSnap(120, 844), "peek");
assert.equal(nearestPhoneSheetSnap(400, 844), "half");
assert.equal(nearestPhoneSheetSnap(600, 844), "full");

// The sheet tells the plan how much canvas it covers.
setPhoneSheetState({ heightPx: 388, snap: "half" });
assert.deepEqual(getPhoneSheetState(), { heightPx: 388, snap: "half" });
setPhoneSheetState(null);
assert.deepEqual(getPhoneSheetState(), { heightPx: 0, snap: null });

// Framing: the header and pills at the top, the step bar and the open sheet at the bottom, on
// phones only, and nothing in Client Preview.
assert.deepEqual(
  resolvePhoneCanvasInsets({ viewportWidth: 390, isClientPreview: false, sheetOpen: true, sheetHeightPx: 388 }),
  { topPx: 128, bottomPx: 452 }
);
assert.deepEqual(
  resolvePhoneCanvasInsets({ viewportWidth: 390, isClientPreview: false, sheetOpen: false, sheetHeightPx: 0 }),
  { topPx: 128, bottomPx: 64 }
);
assert.deepEqual(resolvePhoneCanvasInsets({ viewportWidth: 390, isClientPreview: true, sheetOpen: true, sheetHeightPx: 388 }), { topPx: 0, bottomPx: 0 });
assert.deepEqual(resolvePhoneCanvasInsets({ viewportWidth: 1024, isClientPreview: false, sheetOpen: true, sheetHeightPx: 388 }), { topPx: 0, bottomPx: 0 });
assert.deepEqual(resolvePlanFitInsetsPx(390, { leftPx: 318, rightPx: 344, topPx: 128, bottomPx: 452 }), {
  safeAreaLeftPx: 0, safeAreaRightPx: 0, safeAreaTopPx: 128, safeAreaBottomPx: 452,
});
// From md the plan is framed under the bar, the canvas toolbar and Plan's tools row (56 + 128px),
// so the room's size chips at its top edge aren't under the tools.
assert.equal(WIDE_PLAN_TOP_INSET_PX, 184);
assert.deepEqual(resolvePlanFitInsetsPx(1280, { leftPx: 318, rightPx: 344, topPx: 128, bottomPx: 452 }), {
  safeAreaLeftPx: 318, safeAreaRightPx: 344, safeAreaTopPx: 184, safeAreaBottomPx: 0,
});

// The 2D fit keeps the plan in the band between them: a top inset shrinks the fit's height and
// moves the plan down by half of it, a bottom inset moves it up, and a left inset moves it right.
// Where the plan's centre (0, 0) lands, in px from the canvas's centre, seen through the fit's
// camera (looking down, `up` is screen-up and screen-right is up × down).
type Insets = { top: number; bottom: number; left?: number; right?: number };
const fit = ({ top, bottom, left = 0, right = 0 }: Insets, fitOrientation: "normal" | "rotated" = "normal") =>
  resolvePlan2DViewFit({
    centerX: 0, centerZ: 0, fitOrientation, paddingMeters: 1, planDepthMeters: 6, planWidthMeters: 4,
    safeAreaBottomPx: bottom, safeAreaLeftPx: left, safeAreaRightPx: right, safeAreaTopPx: top,
    viewportHeightPx: 844, viewportWidthPx: 390,
  });
const onScreen = (view: ReturnType<typeof fit>) => {
  const [upX, , upZ] = view.up;
  const [rightX, rightZ] = [-upZ, upX];
  const [dx, dz] = [-view.offsetX, -view.offsetZ];
  return { downPx: -(dx * upX + dz * upZ) * view.zoom, rightPx: (dx * rightX + dz * rightZ) * view.zoom };
};
const close = (actual: number, expected: number, message: string) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} ≠ ${expected}`);
const open = fit({ top: 0, bottom: 0 });
const framed = fit({ top: 128, bottom: 452 });
assert.ok(framed.zoom < open.zoom, "Less height to fit in, so the plan is drawn smaller.");
for (const orientation of ["normal", "rotated"] as const) {
  close(onScreen(fit({ top: 100, bottom: 100 }, orientation)).downPx, 0, `${orientation}: equal insets keep the plan centred`);
  close(onScreen(fit({ top: 184, bottom: 0 }, orientation)).downPx, 92, `${orientation}: a top inset moves the plan down by half of it`);
  close(onScreen(fit({ top: 128, bottom: 452 }, orientation)).downPx, -162, `${orientation}: the sheet moves it up, between the pills and the sheet`);
  close(onScreen(fit({ top: 0, bottom: 0, left: 318, right: 0 }, orientation)).rightPx, 159, `${orientation}: a left panel moves it right`);
}

// Under the canvas tools a two-room home (9 × 4 m) on a 1280 × 720 laptop, with the step panel and
// the plan review open, is drawn at about 56px a metre (no longer turned to fill the height), and
// the plan's first tier of context labels (one "Shared wall", two "Add door here") starts at 50.
const laptop = resolvePlan2DViewFit({
  centerX: 0, centerZ: 0, paddingMeters: 3.2, planDepthMeters: 4, planWidthMeters: 9, viewportHeightPx: 720, viewportWidthPx: 1280,
  zoomScale: 1.1, ...resolvePlanFitInsetsPx(1280, { leftPx: 318, rightPx: 344, topPx: 0, bottomPx: 0 }),
});
assert.equal(laptop.orientation, "normal");
assert.ok(laptop.zoom >= 50 && laptop.zoom < 56, `The laptop's two-room home is drawn at ${laptop.zoom}px a metre.`);
assert.match(read("components/editor/renderers/RoomRenderer2D.tsx"), /if \(planZoom < 50\) return \{ maxAdjacency: 0, maxDoorways: 0,/);

// The sheet: a region named for the step, a handle that's a button with its state, and a body
// that's hidden while the sheet only peeks.
const sheet = (collapsed: boolean) =>
  renderToStaticMarkup(
    <PhoneStepSheet dark={false} title="Furnish" subtitle="Add real purchasable furniture." collapsed={collapsed} onCollapsedChange={noop}>
      <p>Products</p>
    </PhoneStepSheet>
  );
const half = sheet(false);
assert.match(half, /^<section data-testid="design-controls-panel" data-touch-area="true" data-temporary-reveal="false" data-sheet-snap="half" aria-label="Furnish" style="height:388px" class="absolute inset-x-0 bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\] z-20 flex flex-col rounded-t-\[20px\]/);
assert.match(half, /<div class="flex shrink-0 justify-center"><button type="button" class="[^"]*\bmin-h-11\b[^"]*\bh-11 w-24 touch-none px-0 py-0" data-testid="design-controls-panel-handle" aria-label="Expand panel" aria-expanded="false" aria-controls="design-controls-sheet-body" title="Expand panel">/);
assert.match(half, /<h2 class="[^"]*">Furnish<\/h2>/);
assert.match(half, /<div id="design-controls-sheet-body" class="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3"><div data-testid="phone-sheet-inspector"/);
const peek = sheet(true);
assert.match(peek, /data-sheet-snap="peek"[^>]*style="height:92px"/);
assert.match(peek, /<div id="design-controls-sheet-body" hidden=""/, "Peek shows the title only.");
// Hydration: the first render takes a phone's height whatever the window is, as the server does, so
// the sheet's height matches the server's HTML (the window suite failed on a mismatch, 30 Sep).
const globals = globalThis as { window?: unknown };
globals.window = { innerHeight: 1000, addEventListener: noop, removeEventListener: noop };
try {
  assert.match(sheet(false), /data-sheet-snap="half"[^>]*style="height:388px"/, "The first render ignores the window's height.");
} finally {
  delete globals.window;
}
const sheetSource = read("components/editor/PhoneStepSheet.tsx");
assert.match(sheetSource, /useSyncExternalStore\(subscribeToResize, \(\) => window\.innerHeight, \(\) => SERVER_VIEWPORT_HEIGHT_PX\)/);
assert.doesNotMatch(sheetSource, /typeof window/, "No render reads the window before hydration.");

// The inspector in the sheet (AX2): a wall, ceiling, door, window, fixed element or note; not a
// product (the item panel) or a room on its own (the Plan panel's room section).
const none = {
  hasSelectedItem: false, hasVisiblePlanOpening: false, hasSelectedPlanFixedElement: false, hasSelectedPlanAnnotation: false,
  hasSelectedPlanOverlay: false, surfaceInspectorIsWall: false, surfaceInspectorIsCeiling: false,
};
assert.equal(isPhoneSheetInspectorSelection(none), false, "A room alone stays in the Plan panel.");
for (const key of ["hasVisiblePlanOpening", "hasSelectedPlanFixedElement", "hasSelectedPlanAnnotation", "hasSelectedPlanOverlay", "surfaceInspectorIsWall", "surfaceInspectorIsCeiling"] as const) {
  assert.equal(isPhoneSheetInspectorSelection({ ...none, [key]: true }), true, key);
}
assert.equal(isPhoneSheetInspectorSelection({ ...none, surfaceInspectorIsWall: true, hasSelectedItem: true }), false, "Products keep their item panel.");
assert.match(half, /<div data-testid="phone-sheet-inspector" hidden=""><\/div><div class="space-y-3"><p>Products<\/p><\/div>/, "The slot waits, hidden, above the step's content.");
const inspectorSource = read("components/editor/design-page/DesignPageSelectionInspector.tsx");
const placementSource = read("components/editor/design-page/selectionInspectorPlacement.ts");
assert.match(placementSource, /const takesOver = isPhoneSheetInspectorSelection\(state\);\s*const inSheet = !wide && Boolean\(sheet\.slot\) && takesOver;/);
assert.match(placementSource, /if \(inSheet\) return \{ shown: true, inSheet, portalTarget: sheet\.slot \};/, "In the sheet, it goes into the slot.");
assert.match(inspectorSource, /const placement = useInspectorPlacement\(state, configuration\);/);
assert.match(placementSource, /const clearClassName = placement\.inSheet \? `\$\{clear\} min-h-11` : clear;/, "Done is a 44px target.");
assert.match(inspectorSource, /\{placement\.inSheet \? "Done" : "Clear"\}/, "Done deselects, in the sheet.");
assert.match(inspectorSource, /if \(!placement\.shown\) return null;\s*return placement\.portalTarget \? createPortal\(inspector, placement\.portalTarget\) : inspector;/);
assert.match(read("components/editor/design-page/SelectedPlanOpeningActions.tsx"), /absolute left-1\/2 top-bar-28 z-30 hidden [^"]*md:flex"/, "The phone's door and window bar goes.");

// Wiring: the frame is the sheet below md, the column from md, and the phone header has no
// sidebar toggle; the plan model and the Plan tip read the sheet.
const frame = read("components/editor/DesignControlsPanelFrame.tsx");
assert.match(frame, /const wide = useMediaQuery\(CANVAS_TOOLBAR_MEDIA_QUERY\);[\s\S]*?const column = wide\s*\? panelColumn\(/);
// One component draws the sheet and the column (UX 4d), so crossing md (a phone turned sideways,
// hydrating on a desktop) keeps the step's content mounted: an open product's details survived.
assert.equal(frame.match(/<PhoneStepSheet /g)?.length, 1, "The frame renders one PhoneStepSheet, for both.");
assert.match(frame, /<PhoneStepSheet dark=\{dark\} title=\{title\} subtitle=\{subtitle\} collapsed=\{props\.collapsed\} onCollapsedChange=\{onCollapsedChange\} column=\{column\}>/);
const columnPanel = renderToStaticMarkup(
  <PhoneStepSheet dark={false} title="Furnish" subtitle="x" collapsed={false}
    column={{ className: "absolute top-bar-2 z-20", temporarilyRevealed: false, header: <div>Furnish</div>, onMouseEnter: noop, onMouseLeave: noop }}>
    <p>Products</p>
  </PhoneStepSheet>
);
assert.equal(
  columnPanel,
  '<section data-testid="design-controls-panel" data-temporary-reveal="false" class="absolute top-bar-2 z-20"><div>Furnish</div><div class="space-y-3"><div data-testid="phone-sheet-inspector" hidden=""></div><div class="space-y-3"><p>Products</p></div></div></section>',
  "The column: its header, then the same body as the sheet's, with the step's content in the same place."
);
assert.match(read("components/editor/DesignControlsPanel.tsx"), /<DesignControlsPanelFrame\s+dark=\{dark\}/);
const model = read("lib/useDesignPagePlanPresentationModel.ts");
assert.match(model, /const phoneSheetHeightPx = usePhoneSheetState\(\)\.heightPx;/);
assert.match(model, /plan2DSafeAreaTopPx: phoneInsets\.topPx,\s*plan2DSafeAreaBottomPx: phoneInsets\.bottomPx,/);
assert.match(read("components/editor/design-page/DesignSceneCanvas.tsx"), /safeAreaTopPx=\{configuration\.planSafeArea\.topPx\}/);
const navigation = read("lib/useDesignPageCameraNavigation.ts");
assert.equal(navigation.match(/resolvePlanFitInsetsPx\(viewportWidthPx, planFitInsets\)/g)?.length, 2, "Both 2D fits use the same insets.");
assert.match(navigation, /Math\.max\(72, planFitInsets\.topPx\)[\s\S]{0,120}?Math\.max\(96, planFitInsets\.bottomPx\)/, "The 3D fit clears them too.");

console.log("Phone step sheet checks passed.");
