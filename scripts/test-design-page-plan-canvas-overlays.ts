import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveDesignPagePlanCanvasOverlaysState,
  type DesignPagePlanCanvasOverlaysInput,
} from "@/lib/design-page-plan-canvas-overlays";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const normalizeWhitespace = (source: string) => source.replace(/\s+/g, " ");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const viewportOverlaySource = readSource(
  "components/editor/design-page/DesignPageViewportOverlayLayer.tsx"
);
const overlaysSource = readSource(
  "components/editor/design-page/DesignPagePlanCanvasOverlays.tsx"
);
const modelSource = readSource("lib/design-page-plan-canvas-overlays.ts");
const planPresentationSource = readSource(
  "lib/useDesignPagePlanPresentationModel.ts"
);
const normalizedWorkspace = normalizeWhitespace(workspaceSource);
const normalizedViewportOverlay = normalizeWhitespace(viewportOverlaySource);
const normalizedModel = normalizeWhitespace(modelSource);
const normalizedPlanPresentation = normalizeWhitespace(planPresentationSource);

assert.match(
  workspaceSource,
  /import\s+\{\s*DesignPageViewportOverlayLayer\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPageViewportOverlayLayer"/,
  "Workspace should import the viewport-overlay boundary."
);
assert.match(
  planPresentationSource,
  /const planCanvasOverlaysState\s*=\s*resolveDesignPagePlanCanvasOverlaysState\(\{/,
  "The plan presentation model should resolve live plan-canvas policy."
);
assert.ok(
  normalizedWorkspace.includes("planCanvas: planCanvasOverlaysState"),
  "Workspace should pass resolved plan-canvas state through the viewport boundary."
);
assert.ok(
  normalizedWorkspace.includes("planCanvas: { guidedActionsChoice:"),
  "Workspace should pass live plan-canvas actions through the viewport boundary."
);
assert.match(
  viewportOverlaySource,
  /import\s+\{\s*DesignPagePlanCanvasOverlays\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPagePlanCanvasOverlays"/,
  "The viewport layer should own the plan-canvas overlay import."
);
assert.ok(
  normalizedViewportOverlay.includes(
    "<DesignPagePlanCanvasOverlays state={state.planCanvas} actions={actions.planCanvas} />"
  ),
  "The viewport layer should render the grouped plan-canvas child without reinterpreting live policy."
);

for (const componentName of [
  "PlanGuidedActionsChoice",
  "PlanManualQuickActions",
  "PlanGuidedActionsToggle",
  "PlanCanvasFocusControl",
  "PlanCanvasGuidance",
  "EmptyPlanCanvasPrompt",
  "DesignToolsRestoreButton",
] as const) {
  assert.ok(
    !workspaceSource.includes(`<${componentName}`),
    `Workspace should no longer render ${componentName} directly.`
  );
  assert.ok(
    !workspaceSource.includes(`/design-page/${componentName}"`),
    `Workspace should no longer import ${componentName} directly.`
  );
}

assert.ok(
  normalizedPlanPresentation.includes(
    '!layout.isClientPreview && !layout.isDesigner && layout.viewMode === "2d" && presentation.editorMode === "design"'
  ),
  "The shared guided-actions eligibility gate should remain exact."
);

for (const expected of [
  "guidedActionsEnabled: presentation.planGuidedActionsEnabled",
  "activeInteraction: presentation.activePlanCanvasInteraction",
  "designControlsPanelVisible: layout.designControlsPanelVisible",
  "roomCount: layout.housePlanRooms.length",
  "floorPlanCalibrationPointCount: presentation.floorPlanCalibrationPointCount",
  "floorPlanTraceRoomPointCount: presentation.floorPlanTraceRoomPointCount",
  "floorPlanTraceOpeningPointCount: presentation.floorPlanTraceOpeningPointCount",
] as const) {
  assert.ok(
    normalizedPlanPresentation.includes(expected),
    "The plan presentation model should preserve " + expected + "."
  );
}

for (const expected of [
  'startScale: () => { setGuidedPlanStartMode("upload"); handleFloorPlanCalibrationModeChange(true); }',
  'startRoomDraw: () => { setGuidedPlanStartMode("draw"); handleFloorPlanDrawRoomModeChange("rectangle_wall"); }',
  "toggle: () => setPlanGuidedActionsEnabled((enabled) => !enabled)",
  "togglePanel: () => { setDesignPanelOpen(true); setPlanFocusPanelRevealed((value) => !value); }",
  "finish: () => { handleSelectFloorPlanTool(); setPlanFocusPanelRevealed(false); }",
  'startRoom: () => { setDesignPanelOpen(true); goPlan(); setGuidedPlanStartMode("start"); }',
  "restore: () => { setDesignPanelOpen(true); setPlanFocusPanelRevealed(false); }",
] as const) {
  assert.ok(
    normalizedWorkspace.includes(expected),
    `Workspace should preserve ${expected}.`
  );
}

for (const contractName of [
  "DesignPagePlanCanvasOverlaysState",
  "DesignPagePlanCanvasOverlaysActions",
] as const) {
  assert.match(
    overlaysSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}

const overlayOrder = [
  "<PlanGuidedActionsChoice",
  "<PlanManualQuickActions",
  "<PlanGuidedActionsToggle",
  "<PlanCanvasFocusControl",
  "<PlanCanvasGuidance",
  "<EmptyPlanCanvasPrompt",
  "<DesignToolsRestoreButton",
];
let previousIndex = -1;
for (const marker of overlayOrder) {
  const markerIndex = overlaysSource.indexOf(marker);
  assert.ok(markerIndex > previousIndex, `${marker} should preserve overlay paint order.`);
  previousIndex = markerIndex;
}
assert.match(
  overlaysSource,
  /return \(\s*<>[\s\S]*<PlanGuidedActionsChoice[\s\S]*<DesignToolsRestoreButton[\s\S]*<\/\>\s*\);/,
  "The overlay composition should remain wrapper-free."
);

for (const expected of [
  'label: "Set scale"',
  'ariaLabel: "Start plan scale calibration"',
  'label: "Add door"',
  'ariaLabel: "Add a door to the floor plan"',
  'label: "Furnish"',
  'ariaLabel: "Open furnishing tools"',
  'actions.addOpening("door")',
  "actions.guidance.dismiss(guidance.key)",
] as const) {
  assert.ok(
    overlaysSource.includes(expected),
    `The overlay composition should preserve ${expected}.`
  );
}

for (const expected of [
  "showGuidedActionsToggle && !guidedActionsEnabled && !activeInteraction",
  "showGuidedActionsToggle && planSettingsLoaded && !guidedActionsChoiceSeen && !activeInteraction && !showBetaStart",
  '!isClientPreview && viewMode === "2d" && roomCount === 0 && !floorPlanTraceRoomMode',
  "!guidedActionsChoiceVisible && !manualQuickActionsVisible && !designControlsPanelVisible",
  "!isClientPreview && !isDesigner && !designControlsPanelVisible && !planCanvasFocusActive",
  "guidedActionsChoiceVisible || guidanceDismissed ? null : planCanvasGuidance",
  'floorPlanDrawRoomMode === "straight_wall" && floorPlanTraceRoomPointCount > 0',
] as const) {
  assert.ok(
    normalizedModel.includes(expected),
    `The pure overlay resolver should preserve ${expected}.`
  );
}

const baseInput: DesignPagePlanCanvasOverlaysInput = {
  showGuidedActionsToggle: true,
  guidedActionsEnabled: false,
  activeInteraction: false,
  planSettingsLoaded: true,
  guidedActionsChoiceSeen: false,
  showBetaStart: false,
  isClientPreview: false,
  isDesigner: false,
  viewMode: "2d",
  editorMode: "design",
  designControlsPanelVisible: false,
  designControlsPanelMode: "plan",
  roomCount: 1,
  activeFloorPlanTool: "select",
  floorPlanUnderlay: null,
  floorPlanCalibrationMode: false,
  floorPlanCalibrationPointCount: 0,
  floorPlanTraceRoomMode: false,
  floorPlanDrawRoomMode: "rectangle_wall",
  floorPlanTraceRoomPointCount: 0,
  floorPlanTraceOpeningMode: false,
  floorPlanTraceOpeningKind: "door",
  floorPlanTraceOpeningPointCount: 0,
  planCanvasFocusActive: false,
  planCanvasGuidance: {
    title: "Ready to furnish",
    detail: "Switch to Furnish.",
    label: "Next",
    tone: "ready",
    action: "furnish",
  },
  dismissedPlanCanvasGuidanceKey: null,
};

assert.deepEqual(
  resolveDesignPagePlanCanvasOverlaysState(baseInput),
  {
    guidedActionsChoiceVisible: true,
    manualQuickActions: {
      activeTool: "select",
      hasUnderlay: false,
      calibrationActive: false,
      canScale: false,
      hasRooms: true,
    },
    guidedActionsToggle: { enabled: false, compact: true },
    focusControl: null,
    guidance: null,
    emptyPromptVisible: false,
    restoreTools: { label: "Plan tools" },
  },
  "Choice, manual, toggle, and restore overlays should remain independently visible."
);

assert.deepEqual(
  resolveDesignPagePlanCanvasOverlaysState({
    ...baseInput,
    guidedActionsEnabled: true,
    activeInteraction: true,
    guidedActionsChoiceSeen: true,
    floorPlanTraceRoomMode: true,
    floorPlanDrawRoomMode: "straight_wall",
    floorPlanTraceRoomPointCount: 2,
    planCanvasFocusActive: true,
  }),
  {
    guidedActionsChoiceVisible: false,
    manualQuickActions: null,
    guidedActionsToggle: { enabled: true, compact: false },
    focusControl: {
      mode: "room",
      progressLabel: "2 corners",
      focused: true,
      guided: true,
      canUndo: true,
      canClear: false,
    },
    guidance: {
      guidance: baseInput.planCanvasGuidance,
      action: null,
      key: "ready:Ready to furnish:furnish",
      dismissible: false,
    },
    emptyPromptVisible: false,
    restoreTools: null,
  },
  "Active focus should suppress manual actions without hiding the toggle or guidance."
);

assert.deepEqual(
  resolveDesignPagePlanCanvasOverlaysState({
    ...baseInput,
    activeInteraction: true,
    guidedActionsChoiceSeen: true,
    floorPlanUnderlay: { mimeType: "image/png" },
    floorPlanCalibrationMode: true,
    floorPlanCalibrationPointCount: 1,
    planCanvasFocusActive: true,
  }).focusControl,
  {
    mode: "scale",
    progressLabel: "1/2 points",
    focused: true,
    guided: false,
    canUndo: false,
    canClear: true,
  },
  "Calibration focus should use calibration points and retain its clear action."
);

assert.deepEqual(
  resolveDesignPagePlanCanvasOverlaysState({
    ...baseInput,
    showGuidedActionsToggle: false,
    guidedActionsChoiceSeen: true,
    isClientPreview: true,
    roomCount: 0,
    planCanvasGuidance: null,
  }),
  {
    guidedActionsChoiceVisible: false,
    manualQuickActions: null,
    guidedActionsToggle: null,
    focusControl: null,
    guidance: null,
    emptyPromptVisible: false,
    restoreTools: null,
  },
  "Client preview should remain free of plan-canvas editing overlays."
);

console.log("Design-page plan-canvas overlay checks passed.");
