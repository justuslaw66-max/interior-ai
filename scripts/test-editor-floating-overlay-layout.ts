import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const source = fs.readFileSync(designPagePath, "utf8");

assert.match(
  source,
  /const PLAN_FLOATING_OVERLAY_DESKTOP_MIN_WIDTH = 1024;/,
  "Plan floating overlay stack should use the 1024px desktop threshold."
);

assert.match(
  source,
  /const PLAN_FLOATING_OVERLAY_STACK_RIGHT_PX = 4;/,
  "Floating overlay stack should use a shared right edge."
);

assert.match(
  source,
  /const PLAN_FLOATING_OVERLAY_STACK_TOP_PX = 64;/,
  "Floating overlay stack should align with the left plan panel top edge."
);

assert.match(
  source,
  /const PLAN_FLOATING_OVERLAY_INSPECTOR_STACK_TOP_PX = 324;/,
  "Selection inspector should dock beneath the floating room navigator."
);

assert.match(
  source,
  /const PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX = 264;/,
  "Selection inspector should match the floating room navigator width."
);

assert.match(
  source,
  /const PLAN_2D_WHOLE_HOME_FIT_PADDING_MIN_METERS = 3\.2;/,
  "Whole-plan 2D fits should keep enough padding to avoid clipped plans on mode switch."
);

assert.match(
  source,
  /WHOLE_HOME_FIT_ZOOM_SCALE/,
  "Whole-plan 2D fits should use the shared 10% closer zoom scale."
);

assert.match(
  source,
  /const plan2DWholeHomeFitPaddingMeters = Math\.max\([\s\S]*PLAN_2D_WHOLE_HOME_FIT_PADDING_MIN_METERS[\s\S]*PLAN_2D_WHOLE_HOME_FIT_PADDING_RATIO[\s\S]*zoomScale: WHOLE_HOME_FIT_ZOOM_SCALE[\s\S]*const fitPaddingMeters =[\s\S]*paddingMeters \?\?[\s\S]*plan2DWholeHomeFitPaddingMeters[\s\S]*const fitZoomScale = paddingMeters == null \? WHOLE_HOME_FIT_ZOOM_SCALE : 1[\s\S]*paddingMeters: fitPaddingMeters[\s\S]*zoomScale: fitZoomScale/,
  "Manual whole-plan 2D fit should use plan-scale padding and the whole-plan zoom scale."
);

assert.match(
  source,
  /handleFitSelectedPlanRoom[\s\S]*paddingMeters: 1\.2/,
  "Selected-room 2D fit should keep tighter padding than whole-plan mode."
);

assert.match(
  source,
  /const plan2DWholeHomeViewFit = useMemo\(\(\) => \{[\s\S]*resolvePlan2DViewFit\(\{[\s\S]*fitOrientation: "auto"[\s\S]*planDepthMeters: plan2DFitBounds\.depthMeters[\s\S]*planWidthMeters: plan2DFitBounds\.widthMeters/,
  "Whole-plan 2D fit should resolve an automatic orientation from the plan bounds and viewport."
);

assert.match(
  source,
  /fitOrientation\?: Plan2DViewFitOrientation[\s\S]*resolvePlan2DViewFit\(\{[\s\S]*fitOrientation,[\s\S]*planDepthMeters: depthMeters,[\s\S]*planWidthMeters: widthMeters/,
  "Imperative 2D Fit should use the shared orientation-aware view fit helper."
);

assert.match(
  source,
  /handleFitSelectedPlanRoom[\s\S]*fitOrientation: "normal"/,
  "Selected-room 2D fit should opt out of whole-home auto-rotation."
);

assert.match(
  source,
  /data-plan-2d-orientation=\{[\s\S]*plan2DWholeHomeViewFit\.orientation/,
  "Canvas should expose the resolved 2D orientation for layout regression tests."
);

assert.match(
  source,
  /fitOrientation=\{plan2DWholeHomeViewFit\.orientation\}[\s\S]*zoomScale=\{WHOLE_HOME_FIT_ZOOM_SCALE\}/,
  "Mounted 2D camera should receive the resolved whole-plan orientation and zoom scale."
);

assert.match(
  source,
  /const applyQueued2DPlanView = useCallback\(\(attempt = 0\) => \{[\s\S]*if \(applyPlan2DCameraView\(\)\) return;[\s\S]*attempt >= 10[\s\S]*applyQueued2DPlanView\(attempt \+ 1\)/,
  "2D plan fitting should retry until the orthographic camera and controls are mounted."
);

assert.match(
  source,
  /if \(previousViewMode !== "2d"\) \{[\s\S]*applyQueued2DPlanView\(\);[\s\S]*\}[\s\S]*useEffect\(\(\) => \{[\s\S]*viewMode !== "2d"[\s\S]*applyQueued2DPlanView\(\);/,
  "Entering 2D and settling 2D plan bounds should force a whole-plan refit."
);

assert.match(
  source,
  /const floatingPlanOverlayStackVisible\s*=\s*[\s\S]*viewportSize\.width >= PLAN_FLOATING_OVERLAY_DESKTOP_MIN_WIDTH/,
  "Plan floating overlays should be gated by the shared desktop-width condition."
);

assert.match(
  source,
  /const getWholeHome3DView = useCallback\(\(\): CameraView => \{[\s\S]*const effectiveWidthPx = Math\.max\(320, viewportWidthPx - leftInsetPx - rightInsetPx\);[\s\S]*const effectiveHeightPx = Math\.max\(260, viewportHeightPx - topInsetPx - bottomInsetPx\);/,
  "Whole-home 3D fit should account for the available viewport after editor overlays."
);

assert.match(
  source,
  /const targetX = plan2DFitBounds\.centerX;[\s\S]*const targetZ = plan2DFitBounds\.centerZ;[\s\S]*target: \[targetX, targetY, targetZ\]/,
  "Whole-home 3D fit should target the actual plan center, not the world origin."
);

assert.match(
  source,
  /const cameraDistance = Math\.max\([\s\S]*\(planRadius \/ Math\.sin\(limitingFovRad \/ 2\)\) \* 0\.74/,
  "Whole-home 3D fit should fill the available viewport without double-inflating for UI safe areas."
);

assert.doesNotMatch(
  source,
  /safeAreaScale/,
  "Whole-home 3D fit should not multiply distance by a second safe-area scale."
);

assert.match(
  source,
  /if \(viewportSize\.width <= 0 \|\| viewportSize\.height <= 0\) return;[\s\S]*plan2DFitBounds\.widthMeters\.toFixed\(2\)[\s\S]*plan2DFitBounds\.centerX\.toFixed\(2\)[\s\S]*Math\.round\(viewportSize\.width \/ 24\)/,
  "Initial whole-home 3D auto-fit should wait for measured viewport and include plan bounds in its fit key."
);

assert.match(
  source,
  /const shoppingPanelVisibleForLayout = commercePanelVisibleForLayout;/,
  "Shop mode should use an editor panel layout surface."
);

assert.match(
  source,
  /viewMode === "3d" && hasWholeHousePlan && floatingPlanOverlayStackVisible/,
  "Room navigator should only float when the shared overlay stack is visible."
);

assert.match(
  source,
  /defaultPosition=\{\{ right: 4, y: PLAN_FLOATING_OVERLAY_STACK_TOP_PX, width: 264 \}\}/,
  "Room navigator should use the shared top edge for the right overlay stack."
);

assert.match(
  source,
  /storageKey="design-room-navigator-edge-aligned"/,
  "Room navigator should ignore old saved positions from before the edge alignment pass."
);

assert.match(
  source,
  /const floatingFloorPropertiesPanelVisible\s*=\s*[\s\S]*floorPropertiesPanelEligible && floatingPlanOverlayStackVisible/,
  "Floor properties should only float when the shared overlay stack is visible."
);

assert.match(
  source,
  /const plan2DQualityReviewPanelTopPx = 76;/,
  "2D plan review panel should sit flush near the top overlay row."
);

assert.match(
  source,
  /const plan2DQualityReviewPanelReservedBottomPx =[\s\S]*plan2DQualityReviewPanelTopPx \+ \(planQualityReviewCollapsed \? 56 : 300\);/,
  "2D plan review panel should reserve vertical space for other right-side overlays."
);

assert.match(
  source,
  /data-testid="plan-quality-review-panel"[\s\S]*data-collapsed=\{planQualityReviewCollapsed \? "true" : "false"\}[\s\S]*w-64/,
  "2D plan review panel should be collapsible and 20% slimmer than the old w-80 panel."
);

assert.match(
  source,
  /data-testid="plan-quality-review-collapse"[\s\S]*aria-expanded=\{!planQualityReviewCollapsed\}[\s\S]*setPlanQualityReviewCollapsed/,
  "2D plan review panel should expose a collapse toggle."
);

assert.match(
  source,
  /const inlineFloorPropertiesPanelVisible\s*=\s*[\s\S]*floorPropertiesPanelEligible && !floatingFloorPropertiesPanelVisible/,
  "Narrow plan layouts should keep floor controls inline instead of using the floating panel."
);

assert.match(
  source,
  /showFloorPropertiesPanel=\{inlineFloorPropertiesPanelVisible\}/,
  "Design controls should receive the inline floor panel visibility flag."
);

assert.match(
  source,
  /minX=\{floatingPlanOverlayMinX\}/,
  "Floating plan overlays should receive a safe left clamp."
);

assert.match(
  source,
  /data-testid="plan-manual-quick-actions"[\s\S]*left-1\/2 top-20[\s\S]*-translate-x-1\/2/,
  "Manual plan quick actions should be centered near the top of the canvas instead of overlapping the left panel."
);

assert.match(
  source,
  /data-testid="plan-guided-actions-toggle"[\s\S]*className=\{planGuidedActionsToggleClass\}/,
  "Guided actions toggle should use the shared top-center placement class."
);

assert.match(
  source,
  /<EditorCommandBar[\s\S]*onFeedback=\{\(\) => setFeedbackOpen\(true\)\}/,
  "Design-page feedback entry point should open from the command bar instead of floating over the canvas."
);

assert.doesNotMatch(
  source,
  /placement="plan-top-center"/,
  "Feedback should not return to the top-center canvas controls."
);

assert.doesNotMatch(
  source,
  /data-testid="plan-manual-quick-actions"[\s\S]*bottom-32 left-4/,
  "Manual plan quick actions should not return to the lower-left selected-room stack."
);

assert.match(
  source,
  /const selectionInspectorDockedWithPlanStack\s*=[\s\S]*floatingPlanOverlayStackVisible[\s\S]*viewMode === "3d"[\s\S]*hasWholeHousePlan/,
  "Selection inspector should only dock with the floating stack when the room navigator is present."
);

assert.match(
  source,
  /const selectionInspectorTopPx = selectionInspectorDockedWithPlanStack[\s\S]*\? PLAN_FLOATING_OVERLAY_INSPECTOR_STACK_TOP_PX[\s\S]*: plan2DQualityReviewPanelVisible[\s\S]*\? plan2DQualityReviewPanelReservedBottomPx \+ 16[\s\S]*: 160;/,
  "Selection inspector should sit below the room navigator or below the visible 2D plan review panel."
);

assert.match(
  source,
  /const selectionInspectorWidthPx = selectionInspectorDockedWithPlanStack[\s\S]*\? PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX[\s\S]*: 288;/,
  "Selection inspector should match the navigator width when docked."
);

assert.match(
  source,
  /style=\{\{[\s\S]*right: selectionInspectorRightPx,[\s\S]*top: selectionInspectorTopPx,[\s\S]*width: selectionInspectorWidthPx,[\s\S]*\}\}/,
  "Selection inspector should use dynamic stack-aware placement."
);

assert.match(
  source,
  /const planPanelOwnsSelectedRoomInspector\s*=[\s\S]*designControlsPanelVisibleForLayout[\s\S]*designControlsPanelMode === "plan"[\s\S]*Boolean\(selectedPlanRoomContext\)/,
  "Plan mode should let the left panel own selected-room details."
);

assert.match(
  source,
  /const floatingSelectionInspectorVisible\s*=[\s\S]*!planPanelOwnsSelectedRoomInspector/,
  "Floating selection inspector should be hidden when the plan panel owns selected-room details."
);

assert.match(
  source,
  /data-testid="shopping-dock"[\s\S]*md:w-\[18\.15rem\][\s\S]*md:left-20[\s\S]*md:left-4/,
  "Shop mode should use the same left work-panel slot as Plan and Furnish."
);

assert.match(
  source,
  /const commercePanelDockWidthPx = 0;/,
  "Shop mode should not reserve a right-side canvas dock."
);

assert.doesNotMatch(
  source,
  /right-\[calc\(372px\+1rem\)\]/,
  "Selection tray trigger should not be offset for a removed right-side shopping dock."
);

assert.match(
  source,
  /\{floatingSelectionInspectorVisible && selectedObjectInspector && \(/,
  "Selection inspector render should use the deduped visibility flag."
);

const itemCartDrawerPath = path.join(process.cwd(), "components", "ItemCartDrawer.tsx");
const itemCartDrawerSource = fs.readFileSync(itemCartDrawerPath, "utf8");

const designControlsPanelPath = path.join(process.cwd(), "components", "editor", "DesignControlsPanel.tsx");
const designControlsPanelSource = fs.readFileSync(designControlsPanelPath, "utf8");
const editorCamera2DPath = path.join(process.cwd(), "components", "editor", "camera", "EditorCamera2D.tsx");
const editorCamera2DSource = fs.readFileSync(editorCamera2DPath, "utf8");

assert.match(
  designControlsPanelSource,
  /md:w-\[18\.15rem\]/,
  "Main left design controls column should use the adjusted slimmer panel width."
);

assert.match(
  designControlsPanelSource,
  /bottom-1 left-1 right-1[\s\S]*md:top-16[\s\S]*md:left-1/,
  "Main left design controls column should sit as close to the viewport edge as the right overlay stack."
);

assert.match(
  editorCamera2DSource,
  /WHOLE_HOME_FIT_PADDING_MIN_METERS = 3\.2[\s\S]*WHOLE_HOME_FIT_PADDING_RATIO = 0\.24[\s\S]*WHOLE_HOME_FIT_ZOOM_SCALE = 1\.1[\s\S]*paddingMeters: fitPaddingMeters[\s\S]*zoomScale/,
  "Mounted 2D camera should use the same whole-plan padding and 10% zoom scale as the Fit action."
);

assert.match(
  editorCamera2DSource,
  /export type Plan2DViewOrientation = "normal" \| "rotated";[\s\S]*const rotatedZoom = resolvePlanFitZoom\(\{[\s\S]*planWidthMeters: params\.planDepthMeters,[\s\S]*planDepthMeters: params\.planWidthMeters/,
  "2D camera fit should compare normal and 90-degree-rotated plan dimensions."
);

assert.match(
  editorCamera2DSource,
  /if \(orientation === "rotated"\) \{[\s\S]*offsetX: params\.centerX \+ screenOffsetY,[\s\S]*offsetZ: params\.centerZ \+ screenOffsetX,[\s\S]*up: \[1, 0, 0\]/,
  "Rotated 2D camera fit should convert screen safe-area offsets into rotated world axes."
);

assert.match(
  itemCartDrawerSource,
  /data-testid="selection-tray-trigger"/,
  "Selection tray trigger should remain test-addressable for layout checks."
);

const draggablePanelPath = path.join(process.cwd(), "components", "editor", "DraggableFloatingPanel.tsx");
const draggableSource = fs.readFileSync(draggablePanelPath, "utf8");

assert.match(
  draggableSource,
  /minX\?: number/,
  "Draggable floating panels should accept an optional safe-left clamp."
);

assert.match(
  draggableSource,
  /const DEFAULT_TOP_DOCK_Y = 64;/,
  "Draggable floating panel top docking should match the left plan panel top edge."
);

assert.match(
  draggableSource,
  /absolute -left-7 top-0 flex/,
  "Floating panel rail controls should align with the panel top edge."
);

assert.match(
  draggableSource,
  /const minClampedX = minX \?\? EDGE_MARGIN;[\s\S]*x: Math\.max\(minClampedX, Math\.min\(maxX, nextX\)\)/,
  "Stored and dragged floating panel positions should be clamped against minX."
);

console.log("Editor floating overlay layout guardrails passed.");
