import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TABLET_ITEM_PANEL_INSET_PX,
  TABLET_MEDIA_QUERY,
  getTabletPanelSnapshot,
  holdStepPanelOpen,
  isTabletWidth,
  resolveTabletPanelPolicy,
  setTabletRightPanel,
  toggleStepPanel,
} from "../lib/tablet-panel-policy";
import {
  nextPlan2DFloatingInsetLatch,
  plan2DFitKey,
  resolvePlan2DRightInsetsPx,
} from "../lib/plan-2d-fit-insets";

// Tablets (UX 4d, audit AX11): at 768-1023px a right panel (the item or cabinet panel, or the
// inspector for a wall, door or window) makes the step panel step aside while it's open, and the
// 2D plan is framed clear of it. The step panel's own toggles hold it open beside the right panel.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Tablets are 768-1023px, as the media query says.
assert.deepEqual([767, 768, 1023, 1024].map(isTabletWidth), [false, true, true, false]);
assert.equal(TABLET_MEDIA_QUERY, "(min-width: 48rem) and (max-width: 63.98rem)");
assert.equal(TABLET_ITEM_PANEL_INSET_PX, 340 + 16, "The item and cabinet panels: 340px at right-4.");

// The policy: collapsed while a right panel is open on a tablet, unless held open; never otherwise.
const policy = (tablet: boolean, collapsed: boolean, rightPanelInsetPx: number, heldOpen = false) =>
  resolveTabletPanelPolicy({ tablet, collapsed, rightPanelInsetPx, heldOpen });
assert.deepEqual(policy(true, false, 356), { collapsed: true, rightPanelOpen: true, rightInsetPx: 356 });
assert.deepEqual(policy(true, false, 356, true), { collapsed: false, rightPanelOpen: true, rightInsetPx: 356 });
assert.deepEqual(policy(true, false, 0), { collapsed: false, rightPanelOpen: false, rightInsetPx: 0 });
assert.deepEqual(policy(false, false, 356), { collapsed: false, rightPanelOpen: false, rightInsetPx: 0 }, "Not on desktops.");
assert.equal(policy(true, true, 0).collapsed, true, "A stored collapse stays.");
assert.equal(policy(true, true, 356, true).collapsed, true, "Holding open doesn't undo a stored collapse.");

// The store: the widest open right panel; holding open lasts while one is open.
setTabletRightPanel("item", 356);
setTabletRightPanel("inspector", 300);
assert.deepEqual(getTabletPanelSnapshot(), { rightPanelInsetPx: 356, heldOpen: false });
holdStepPanelOpen(true);
assert.deepEqual(getTabletPanelSnapshot(), { rightPanelInsetPx: 356, heldOpen: true });
setTabletRightPanel("item", null);
assert.deepEqual(getTabletPanelSnapshot(), { rightPanelInsetPx: 300, heldOpen: true });
setTabletRightPanel("inspector", null);
assert.deepEqual(getTabletPanelSnapshot(), { rightPanelInsetPx: 0, heldOpen: false }, "The hold ends with the right panel.");
holdStepPanelOpen(true);
assert.equal(getTabletPanelSnapshot().heldOpen, false, "Nothing to hold open beside.");

// The toggles: showing clears a stored collapse and, beside a right panel, holds the panel open;
// hiding stores the collapse and lets go.
const run = (current: ReturnType<typeof policy>, stored: boolean) => {
  const calls: boolean[] = [];
  toggleStepPanel(current, stored, (next) => calls.push(next));
  return calls;
};
setTabletRightPanel("item", 356);
assert.deepEqual(run(policy(true, false, 356), false), [], "Beside a right panel, showing only holds it open.");
assert.equal(getTabletPanelSnapshot().heldOpen, true);
assert.deepEqual(run(policy(true, false, 356, true), false), [true], "Hiding stores the collapse.");
assert.equal(getTabletPanelSnapshot().heldOpen, false);
assert.deepEqual(run(policy(true, true, 356), true), [false], "Showing clears a stored collapse too.");
assert.equal(getTabletPanelSnapshot().heldOpen, true);
setTabletRightPanel("item", null);
assert.deepEqual(run(policy(false, true, 0), true), [false]);
assert.deepEqual(run(policy(false, false, 0), false), [true]);

// Framing: the plan model's 2D right inset takes the tablet's right panel (2D only, from md).
// Wiring: the column, the bar's sidebar toggle and the canvas toolbar read the policy; the plan's
// framing takes its collapse and right inset; the panels report themselves.
const frame = read("components/editor/DesignControlsPanelFrame.tsx");
assert.match(frame, /const policy = useTabletPanelPolicy\(useMediaQuery\(TABLET_MEDIA_QUERY\), props\.collapsed\);\s*const collapsed = wide \? policy\.collapsed : props\.collapsed;/);
assert.match(frame, /if \(wide\) toggleStepPanel\(policy, props\.collapsed, onCollapsedChange\);/);
assert.match(frame, /usePanelToggleShortcut\(onCollapsedChange, toggle\);/, "Ctrl/⌘ B toggles the same way.");
assert.equal(frame.match(/h-9 w-9 touch:h-11 touch:w-11 [^"]*opacity-0 touch:opacity-100/g)?.length, 2, "The edge toggle is a visible 44px target on touch.");
const barToggle = read("components/editor/command-bar/CommandBarCanvasControls.tsx");
assert.match(barToggle, /const policy = useTabletPanelPolicy\(useMediaQuery\(TABLET_MEDIA_QUERY\), storedCollapsed\);/);
assert.match(barToggle, /onClick=\{\(\) => toggleStepPanel\(policy, storedCollapsed, setCollapsed\)\}/);
assert.match(read("components/editor/design-page/DesignPageEditorChrome.tsx"), /const tablet = useTabletPanelPolicy\(useMediaQuery\(TABLET_MEDIA_QUERY\), bar\.designSidebarCollapsed\);[\s\S]*?collapsed: tablet\.collapsed,/);
const model = read("lib/useDesignPagePlanPresentationModel.ts");
assert.match(model, /const tablet = useTabletPanelPolicy\(isTabletWidth\(layout\.viewportWidth\), layout\.designPanelCollapsed\);/);
assert.match(model, /designPanelCollapsed: tablet\.collapsed,[\s\S]*?tabletRightInsetPx: tablet\.rightInsetPx,/);
assert.match(
  model,
  /const plan2DRightInsets = resolvePlan2DRightInsetsPx\(\{\s*applies: !isClientPreview && viewMode === "2d" && viewportWidth >= 768,\s*planQualityReviewVisible,\s*floorPropertiesPanelVisible: floatingFloorPropertiesPanelVisible,\s*tabletRightInsetPx,\s*\}\);/
);
assert.match(
  model,
  /const plan2DSafeAreaRightPx = usePlan2DFittedRightInsetPx\(\s*plan2DFitKey\(layout\.viewMode, layout\.viewportWidth, plan2DFitBounds, viewportLayout\), viewportLayout\.plan2DRightInsets\s*\);/
);
assert.match(model, /\.\.\.viewportLayout,\s*plan2DSafeAreaRightPx, plan2DSafeAreaLiveRightPx: viewportLayout\.plan2DSafeAreaRightPx,/);

// The plan's right inset: a tablet's docked panel always reframes the plan; the floating overlay
// stack (the plan quality review, the floor panel) is fitted around but never moves the plan by
// itself. Repairing the last window closed the review and used to shift the plan 1.4 m.
assert.deepEqual(
  resolvePlan2DRightInsetsPx({ applies: true, planQualityReviewVisible: true, floorPropertiesPanelVisible: true, tabletRightInsetPx: 0 }),
  { floatingRightPx: 344, dockedRightPx: 0, rightPx: 344 }
);
assert.deepEqual(
  resolvePlan2DRightInsetsPx({ applies: true, planQualityReviewVisible: false, floorPropertiesPanelVisible: false, tabletRightInsetPx: 356 }),
  { floatingRightPx: 0, dockedRightPx: 356, rightPx: 356 }
);
assert.deepEqual(
  resolvePlan2DRightInsetsPx({ applies: false, planQualityReviewVisible: true, floorPropertiesPanelVisible: true, tabletRightInsetPx: 356 }),
  { floatingRightPx: 0, dockedRightPx: 0, rightPx: 0 }
);
const fitLayout = (dockedRightPx: number) => ({
  plan2DSafeAreaLeftPx: 318, plan2DRightInsets: { dockedRightPx }, plan2DSafeAreaTopPx: 184, plan2DSafeAreaBottomPx: 0,
});
const fitBounds = { centerX: 0, centerZ: 0, widthMeters: 4, depthMeters: 4 };
const fitKey = plan2DFitKey("2d", 1440, fitBounds, fitLayout(0));
const fitted = { fitKey, floatingRightPx: 344 };
assert.equal(
  nextPlan2DFloatingInsetLatch(fitted, { fitKey, floatingRightPx: 0 }),
  fitted,
  "The review closing keeps the fitted inset: the plan doesn't move."
);
for (const changedKey of [
  plan2DFitKey("3d", 1440, fitBounds, fitLayout(0)),
  plan2DFitKey("2d", 1280, fitBounds, fitLayout(0)),
  plan2DFitKey("2d", 1440, { ...fitBounds, widthMeters: 5 }, fitLayout(0)),
  plan2DFitKey("2d", 1440, fitBounds, fitLayout(356)),
]) {
  assert.notEqual(changedKey, fitKey);
  assert.deepEqual(
    nextPlan2DFloatingInsetLatch(fitted, { fitKey: changedKey, floatingRightPx: 0 }),
    { fitKey: changedKey, floatingRightPx: 0 },
    "Opening 2D, the canvas width, the plan's extent or a docked panel fits again with the stack as it is."
  );
}
const camera = read("lib/useDesignPageCameraNavigation.ts");
assert.match(camera, /applyQueued2DPlanView\(0, \{ insets: planFitLiveInsets \}\);\s*showRuleToast\("Plan fitted"\);/, "Fit uses the panels open now.");
assert.match(camera, /paddingMeters: 1\.2,\s*insets: planFitLiveInsets,/, "So does a room's fit.");
assert.match(
  read("components/editor/design-page/DesignPagePanelRegion.tsx"),
  /useReportTabletRightPanel\("item", !isClientPreview && Boolean\(state\.selectedItem \|\| state\.selectedCabinet\), TABLET_ITEM_PANEL_INSET_PX\);/
);
assert.match(
  read("components/editor/design-page/selectionInspectorPlacement.ts"),
  /useReportTabletRightPanel\("inspector", wide && !docked && takesOver, configuration\.floatingWidthPx \+ configuration\.floatingRightPx\);/,
  "A floating inspector for a wall, door or window; not for a room, which is selected on arrival."
);

console.log("Tablet panel checks passed.");
