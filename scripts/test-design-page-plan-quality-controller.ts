import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
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
const controllerSource = readFileSync(
  join(root, "lib/useDesignPagePlanQualityController.ts"),
  "utf8"
);
const planEditingFacadeSource = readFileSync(
  join(root, "lib/useDesignPagePlanEditingFacade.ts"),
  "utf8"
);

assert.match(planEditingFacadeSource, /useDesignPagePlanQualityController\(\{/);
assert.match(workspaceSource, /useDesignPagePlanEditingFacade\(\{/);
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
  /<DesignPageViewportOverlayLayer[\s\S]*?planQuality: plan2DQualityReviewPanelVisible[\s\S]*?report: floorPlanQualityReport,[\s\S]*?collapsed: planQualityReviewCollapsed,[\s\S]*?planQuality: \{ setPanel: setPlanQualityReviewPanelNode \},[\s\S]*?planQuality: \{[\s\S]*?toggleCollapsed: togglePlanQualityReviewPanel,[\s\S]*?activateIssue: handlePlanQualityAction/,
  "The workspace should preserve controller-owned quality state, reference, and actions at the viewport-overlay boundary."
);
assert.match(
  workspaceSource,
  /floorPlanQualityContext: floorPlanQualityReport\.aiPlanningContext/
);
assert.match(
  workspaceSource,
  /floorPlanQualityReport=\{floorPlanQualityReport\}[\s\S]*?onPlanQualityAction=\{handlePlanQualityAction\}/
);

console.log("design page plan-quality controller guardrails passed");
