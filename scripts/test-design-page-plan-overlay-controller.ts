import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RoomOpening2D } from "@/lib/editorScene";
import {
  getDesignPageOpeningMetricsHistoryLabel,
  normalizeDesignPageOpeningMetrics,
} from "@/lib/design-page-opening-metrics";
import { resolvePlanOpeningVerticalMetrics } from "@/lib/design-page-plan-overlays";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const controllerSource = readFileSync(
  join(root, "lib/useDesignPagePlanOverlayController.ts"),
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

assert.match(
  planEditingFacadeSource,
  /useDesignPagePlanOverlayController\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The plan-editing facade should compose plan overlays through grouped controller contracts."
);
assert.match(planWorkspaceFacadeSource, /useDesignPagePlanEditingFacade\(\{/);
assert.match(
  planAuthoringRegistrationSource,
  /useDesignPagePlanWorkspaceRegistrationFacade\(\{/,
  "Plan authoring should register the grouped plan boundary through its controller adapter."
);
assert.doesNotMatch(
  workspaceSource,
  /useDesignPagePlanActions/,
  "Low-level plan actions should remain an implementation detail of the overlay controller."
);
assert.match(
  controllerSource,
  /useDesignPagePlanActions\(\{[\s\S]*?activeRoomName,[\s\S]*?housePlanRooms,[\s\S]*?planOpenings,[\s\S]*?onSelectPlanOverlay:\s*selectPlanOverlay/,
  "The overlay controller should delegate plan mutations to the established plan-actions hook."
);

for (const callbackName of [
  "commitPlanAnnotation",
  "handleUpdateOpeningMetrics2D",
  "handleResizeOpening2D",
  "runPlanOverlayCommand",
  "handleAddSuggestedDoorway",
]) {
  assert.match(
    controllerSource,
    new RegExp(`const ${callbackName} = useCallback`),
    `${callbackName} should be owned by the plan-overlay controller.`
  );
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`const ${callbackName} = useCallback`),
    `${callbackName} should not be declared inline in the workspace.`
  );
}

assert.match(
  controllerSource,
  /runHistoryTransaction\(historyLabel,\s*\(\)\s*=>\s*\{\s*if \(canonicalTopology\?\.updateOpeningMetrics\(id, plannedMetrics\)\) return;\s*handleUpdateOpeningMetrics2DFromPlanAction\(id, plannedMetrics\);\s*\}\)/,
  "Inspector metric edits should prefer canonical topology and retain the legacy fallback inside one history transaction."
);
assert.ok(
  controllerSource.indexOf("const plannedMetrics = planOpeningMetrics") <
    controllerSource.indexOf("runHistoryTransaction(historyLabel"),
  "Evidence-aware kind planning must complete before the undo history boundary starts."
);
assert.match(
  controllerSource,
  /const handleResizeOpening2D = useCallback\([\s\S]*?handleUpdateOpeningMetrics2DFromPlanAction\(id, \{ \.\.\.metrics, widthEvidence: "user_confirmed" \}\)/,
  "Interactive resize should directly delegate one width-confirmed low-level edit instead of creating nested history."
);
assert.match(
  controllerSource,
  /suppressedDoorwaySuggestionKeys\.includes\([\s\S]*?getDoorwaySuggestionKey\(suggestion\)[\s\S]*?return;[\s\S]*?runHistoryTransaction\("Add doorway"/,
  "Suppressed doorway suggestions should stay inert while accepted suggestions remain history-aware."
);

const rawPresetActionSource = controllerSource.slice(
  controllerSource.indexOf("const applyPlanLayerPresetInTransaction"),
  controllerSource.indexOf("const selectAnnotationTool")
);
assert.match(
  rawPresetActionSource,
  /runPlanOverlayCommandFromPlanAction\(`preset:\$\{presetId\}`\)/,
  "Export-style preset changes should delegate to the low-level command inside their existing transaction."
);
assert.doesNotMatch(
  rawPresetActionSource,
  /runHistoryTransaction/,
  "The raw preset adapter must not create nested history."
);

const annotationToolActionSource = controllerSource.slice(
  controllerSource.indexOf("const selectAnnotationTool"),
  controllerSource.indexOf("const handleAddSuggestedDoorway")
);
assert.match(
  annotationToolActionSource,
  /setAnnotationToolKind\(kind\);\s*runPlanOverlayCommand\(`annotation:\$\{kind\}`\)/,
  "Selecting an annotation tool should update its highlight before opening the annotation flow."
);

const existingWindow: RoomOpening2D = {
  id: "window-1",
  roomId: "living-room",
  wall: "north",
  offsetMm: 250,
  widthMm: 1200,
  heightMm: 1400,
  bottomMm: 800,
  kind: "window",
};

assert.deepEqual(
  resolvePlanOpeningVerticalMetrics(
    { kind: "window", heightMeters: undefined, bottomMeters: undefined },
    2.6
  ),
  {
    heightMeters: 1.2,
    bottomMeters: 0.9,
    topMeters: 2.1,
    hasExplicitHeight: false,
    hasExplicitBottom: false,
    heightStatus: "defaulted",
    bottomStatus: "defaulted",
    rawHeightMeters: undefined,
    rawBottomMeters: undefined,
    issues: [],
  },
  "A sparse window should use window defaults without converting missing values into a full-height gap."
);

assert.deepEqual(
  resolvePlanOpeningVerticalMetrics(
    { kind: "window", heightMeters: 1.2, bottomMeters: 0 },
    2.6
  ),
  {
    heightMeters: 1.2,
    bottomMeters: 0,
    topMeters: 1.2,
    hasExplicitHeight: true,
    hasExplicitBottom: true,
    heightStatus: "exact",
    bottomStatus: "exact",
    rawHeightMeters: 1.2,
    rawBottomMeters: 0,
    issues: [],
  },
  "An explicit zero-height sill should not be replaced by the window default."
);

assert.deepEqual(
  resolvePlanOpeningVerticalMetrics(
    { kind: "window", heightMeters: 2.6, bottomMeters: 0 },
    2.6
  ),
  {
    heightMeters: 2.6,
    bottomMeters: 0,
    topMeters: 2.6,
    hasExplicitHeight: true,
    hasExplicitBottom: true,
    heightStatus: "exact",
    bottomStatus: "exact",
    rawHeightMeters: 2.6,
    rawBottomMeters: 0,
    issues: [],
  },
  "An intentional full-height window should remain full height."
);

assert.deepEqual(
  normalizeDesignPageOpeningMetrics({
    currentOpening: existingWindow,
    metrics: {
      kind: "door",
      bottomMeters: 1.1,
      heightMeters: 4,
    },
    roomHeight: 2.8,
  }),
  {
    kind: "door",
    bottomMeters: 1.1,
    heightMeters: 4,
  },
  "Normalization should preserve the authored height; door persistence applies the zero sill separately."
);

assert.deepEqual(
  normalizeDesignPageOpeningMetrics({
    currentOpening: existingWindow,
    metrics: {
      kind: "window",
      bottomMeters: 9,
      heightMeters: 0.1,
    },
    roomHeight: 2.6,
  }),
  {
    kind: "window",
    bottomMeters: 9,
    heightMeters: 0.1,
  },
  "Wall-constrained values must remain raw in storage and constrain only effective rendering."
);

assert.deepEqual(
  normalizeDesignPageOpeningMetrics({
    currentOpening: existingWindow,
    metrics: {
      bottomMeters: -0.5,
      heightMeters: 0.2,
    },
    roomHeight: 2.8,
  }),
  {
    bottomMeters: -0.5,
    heightMeters: 0.2,
  },
  "Invalid authored values must remain visible for repair instead of masquerading as defaults."
);

const heightLimitedWindow = normalizeDesignPageOpeningMetrics({
  currentOpening: existingWindow,
  metrics: { heightMeters: 2.5 },
  roomHeight: 2.4,
});
assert.deepEqual(
  heightLimitedWindow,
  {
    heightMeters: 2.5,
  },
  "A height edit should preserve its raw value without materializing an effective constraint."
);

const sparseResizePatch = {
  widthMeters: 1.35,
  offsetMeters: -0.25,
};
const normalizedSparseResize = normalizeDesignPageOpeningMetrics({
  currentOpening: existingWindow,
  metrics: sparseResizePatch,
  roomHeight: 2.8,
});
assert.deepEqual(
  normalizedSparseResize,
  sparseResizePatch,
  "Width and offset edits should remain sparse instead of synthesizing vertical metrics."
);
assert.equal(
  Object.hasOwn(normalizedSparseResize, "heightMeters"),
  false,
  "A width/offset patch should not synthesize height."
);
assert.equal(
  Object.hasOwn(normalizedSparseResize, "bottomMeters"),
  false,
  "A width/offset patch should not synthesize bottom height."
);

for (const metrics of [
  { widthMeters: 1.2 },
  { heightMeters: 1.4 },
  { bottomMeters: 0.7 },
  { widthMeters: 1.2, offsetMeters: 0.1 },
]) {
  assert.equal(
    getDesignPageOpeningMetricsHistoryLabel(metrics),
    "Resize opening",
    "Dimension-only opening changes should use the resize history label."
  );
}

for (const metrics of [
  {},
  { offsetMeters: 0.1 },
  { kind: "door" as const },
  { kind: "window" as const, widthMeters: 1.2 },
]) {
  assert.equal(
    getDesignPageOpeningMetricsHistoryLabel(metrics),
    "Edit opening",
    "Offset-only and kind changes should use the edit history label."
  );
}

console.log("design page plan-overlay controller guardrails passed");
