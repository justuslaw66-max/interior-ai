import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildDesignControlsPanelModel } from "../lib/design-page-controls-panel-model";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const panelRegistrationSource = readFileSync(
  join(root, "lib/design-page-panel-registration.ts"),
  "utf8"
);
const structureSource = readFileSync(
  join(root, "components/editor/design-page/DesignSceneStructureLayer.tsx"),
  "utf8"
);
const viewportOverlaySource = readFileSync(
  join(
    root,
    "components/editor/design-page/DesignPageViewportOverlayLayer.tsx"
  ),
  "utf8"
);
const viewportAdapterSource = readFileSync(
  join(root, "lib/design-page-viewport-region-adapter.ts"),
  "utf8"
);
const controllerSource = readFileSync(
  join(root, "lib/useDesignPagePlanQualityController.ts"),
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

assert.match(planEditingFacadeSource, /useDesignPagePlanQualityController\(\{/);
assert.match(planWorkspaceFacadeSource, /useDesignPagePlanEditingFacade\(\{/);
assert.match(
  workspaceSource,
  /useDesignPagePlanWorkspaceRegistrationFacade\(\{/,
  "The workspace should register the grouped plan boundary through its controller adapter."
);
for (const contract of ["state", "configuration", "refs", "actions"]) {
  assert.match(
    `${planEditingFacadeSource}\n${controllerSource}`,
    new RegExp(`\\b${contract}\\b`),
    `The plan-quality boundary should retain its grouped ${contract} contract.`
  );
}

assert.match(
  controllerSource,
  /buildFloorPlanQualityReport\(\{[\s\S]*?rooms: housePlanRooms[\s\S]*?openings: planOpenings[\s\S]*?items: designSnapshot\.rooms\.flatMap[\s\S]*?roomId: room\.id[\s\S]*?activeRoomId: designSnapshot\.activeRoomId/,
  "The controller should derive quality from every room, opening, item, and active room."
);
assert.doesNotMatch(workspaceSource, /buildFloorPlanQualityReport\(/);
assert.doesNotMatch(workspaceSource, /lastTrackedPlanQualityRef/);
assert.doesNotMatch(
  workspaceSource,
  /const handlePlanQualityAction\s*=\s*useCallback/,
  "Issue activation should remain owned by the controller."
);

assert.match(
  controllerSource,
  /Math\.abs\(current\.score - previous\.score\) >= 8[\s\S]*?current\.label !== previous\.label[\s\S]*?Math\.abs\(current\.issueCount - previous\.issueCount\) >= 2/,
  "Quality analytics should keep the material-change thresholds."
);
for (const eventName of [
  "floor_plan_quality_changed",
  "floor_plan_quality_fix_clicked",
]) {
  assert.match(controllerSource, new RegExp(`track\\(\"${eventName}\"`));
}
for (const payloadField of [
  "previous_score",
  "previous_label",
  "issue_id",
  "target_room_id",
  "target_wall",
  "target_item_id",
  "top_issue",
]) {
  assert.match(controllerSource, new RegExp(`\\b${payloadField}\\b`));
}

for (const action of [
  "add_window",
  "add_doorway",
  "review_plan_layout",
  "review_furniture_fit",
]) {
  assert.match(
    controllerSource,
    new RegExp(`action === \\"${action}\\"`),
    `The controller should preserve the ${action} route.`
  );
}
assert.match(
  controllerSource,
  /goFurnish\(\);[\s\S]*?Add a storage piece or support space/,
  "The controller should preserve the add-storage fallback route."
);
for (const toast of [
  "Add a window to the highlighted room",
  "Add a doorway for the highlighted rooms",
  "Review the highlighted plan issue",
  "Review the highlighted furniture fit",
  "Add a storage piece or support space",
]) {
  assert.match(controllerSource, new RegExp(toast));
}

assert.match(
  controllerSource,
  /!isClientPreview[\s\S]*?viewMode === "2d"[\s\S]*?report\.issues\.length > 0[\s\S]*?!planCanvasInteractionActive/,
  "The review panel should retain its visibility conditions."
);
assert.match(
  controllerSource,
  /new ResizeObserver\(updatePanelHeight\)[\s\S]*?resizeObserver\?\.observe\(panel\)[\s\S]*?window\.addEventListener\("resize", updatePanelHeight\)[\s\S]*?resizeObserver\?\.disconnect\(\)[\s\S]*?window\.removeEventListener\("resize", updatePanelHeight\)/,
  "The review panel should retain measured sizing and cleanup."
);
assert.match(
  workspaceSource,
  /reviewPanelTopPx: 76,[\s\S]*?collapsedReviewPanelFallbackHeightPx: 56,[\s\S]*?expandedReviewPanelFallbackHeightPx: 252,/,
  "The workspace should preserve the review panel layout values."
);

assert.match(
  structureSource,
  /<PlanQualityHintOverlay[\s\S]*?issues=\{plan\.qualityIssues\}/
);
assert.match(
  workspaceSource,
  /qualityIssues: floorPlanQualityReport\.issues,/
);
assert.doesNotMatch(
  workspaceSource,
  /<PlanQualityHintOverlay/,
  "The workspace should delegate quality-hint rendering to the structure layer."
);
assert.match(
  viewportOverlaySource,
  /state\.planQuality \? \([\s\S]*?<PlanQualityReviewPanel[\s\S]*?state=\{state\.planQuality\}[\s\S]*?references=\{references\.planQuality\}[\s\S]*?actions=\{actions\.planQuality\}/,
  "The viewport overlay layer should own plan-quality review composition."
);
assert.doesNotMatch(
  workspaceSource,
  /<PlanQualityReviewPanel/,
  "The workspace should delegate plan-quality review rendering to the viewport overlay layer."
);
assert.match(
  workspaceSource,
  /buildDesignPageViewportRegionAdapter\(\{[\s\S]*?visibility: \{[\s\S]*?planQuality: plan2DQualityReviewPanelVisible/,
  "The workspace should inject controller-owned quality visibility at the viewport-adapter boundary."
);
assert.match(
  workspaceSource,
  /planQuality: \{ report: floorPlanQualityReport, collapsed: planQualityReviewCollapsed \}/,
  "The workspace should inject the controller-owned quality report state."
);
assert.match(
  workspaceSource,
  /planQuality: \{ setPanel: setPlanQualityReviewPanelNode \}/,
  "The workspace should inject the controller-owned quality panel reference."
);
assert.match(
  workspaceSource,
  /planQuality: \{ toggleCollapsed: togglePlanQualityReviewPanel, activateIssue: handlePlanQualityAction \}/,
  "The workspace should inject controller-owned quality state, reference, and actions at the viewport-adapter boundary."
);
assert.match(
  viewportAdapterSource,
  /planQuality: state\.visibility\.planQuality[\s\S]*?report: state\.planQuality\.report,[\s\S]*?collapsed: state\.planQuality\.collapsed,[\s\S]*?references,[\s\S]*?planQuality: actions\.planQuality/,
  "The viewport adapter should preserve controller-owned quality state, reference, and actions."
);
assert.match(
  workspaceSource,
  /floorPlanQualityContext: floorPlanQualityReport\.aiPlanningContext/
);
assert.match(
  workspaceSource,
  /buildDesignPagePanelRegistration\(\{/,
  "The workspace should delegate fixed-panel registration to the pure registration boundary."
);
assert.match(
  panelRegistrationSource,
  /buildDesignControlsPanelModel\(\{/,
  "The panel registration boundary should retain control-panel contract assembly."
);

const handlePlanQualityAction = () => undefined;
const noop = () => undefined;
const qualityReport = { score: 77 };
const controlsModel = buildDesignControlsPanelModel({
  access: {},
  panel: { mode: "plan", state: {} },
  room: { state: {}, actions: { addDesignerRoom: noop } },
  floorPlan: {
    state: {
      floorPlanQualityReport: qualityReport,
      floorPlanUnderlay: null,
      planRoomCount: 1,
    },
    actions: {
      onPlanQualityAction: handlePlanQualityAction,
      onFloorPlanTraceRoomDrawModeChange: noop,
    },
  },
  surfaces: { state: {}, actions: {} },
  shopping: { state: {}, actions: {} },
  ai: { state: {}, actions: {} },
  actions: {
    navigation: {},
    panel: {
      changeDesignPanelCollapsed: noop,
      goView3D: noop,
      runAiLayout: noop,
      regenerateAiLayout: noop,
      changeActiveWallSurfaceSettings: noop,
      resetActiveWallSurface: noop,
      resetActiveCeilingSurface: noop,
      toggleGrid: noop,
      toggleSnap: noop,
    },
  },
} as unknown as Parameters<typeof buildDesignControlsPanelModel>[0]);
assert.strictEqual(
  controlsModel.state.floorPlanQualityReport,
  qualityReport,
  "the controls model should preserve the controller-owned quality report."
);
assert.strictEqual(
  controlsModel.actions.onPlanQualityAction,
  handlePlanQualityAction,
  "the controls model should preserve the controller-owned quality action."
);

console.log("design page plan-quality controller guardrails passed");
