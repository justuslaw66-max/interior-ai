import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RoomOpening2D } from "@/lib/editorScene";
import {
  getDesignPageOpeningMetricsHistoryLabel,
  normalizeDesignPageOpeningMetrics,
} from "@/lib/design-page-opening-metrics";

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

assert.match(
  planEditingFacadeSource,
  /useDesignPagePlanOverlayController\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The plan-editing facade should compose plan overlays through grouped controller contracts."
);
assert.match(planWorkspaceFacadeSource, /useDesignPagePlanEditingFacade\(\{/);
assert.match(workspaceSource, /useDesignPagePlanWorkspaceFacade\(\{/);
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
  /runHistoryTransaction\(historyLabel,\s*\(\)\s*=>\s*handleUpdateOpeningMetrics2DFromPlanAction\(id, normalizedMetrics\)/,
  "Inspector metric edits should delegate their normalized patch through history."
);
assert.match(
  controllerSource,
  /const handleResizeOpening2D = useCallback\([\s\S]*?handleUpdateOpeningMetrics2DFromPlanAction\(id, metrics\)/,
  "Interactive resize should keep its direct low-level delegation instead of creating nested history."
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
    bottomMeters: 0,
    heightMeters: 2.8,
  },
  "Doors should always start at the finished floor and cannot exceed the room height."
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
    bottomMeters: 2.2,
    heightMeters: 0.4,
  },
  "Windows should keep the minimum opening height when their sill reaches the room limit."
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
    bottomMeters: 0,
    heightMeters: 0.4,
  },
  "Window sill and height edits should clamp to non-negative and minimum-height bounds."
);

const heightLimitedWindow = normalizeDesignPageOpeningMetrics({
  currentOpening: existingWindow,
  metrics: { heightMeters: 2.5 },
  roomHeight: 2.4,
});
assert.deepEqual(
  heightLimitedWindow,
  {
    bottomMeters: 0.8,
    heightMeters: 2.4 - 0.8,
  },
  "A window should use its stored sill when limiting height to the remaining wall space."
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
