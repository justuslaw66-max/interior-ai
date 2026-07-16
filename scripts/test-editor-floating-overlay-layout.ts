import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPagePath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageWorkspace.tsx"
);
const source = fs.readFileSync(designPagePath, "utf8");
const designPageEditorCommandBarSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignPageEditorCommandBar.tsx"
  ),
  "utf8"
);
const viewportOverlaySource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignPageViewportOverlayLayer.tsx"
  ),
  "utf8"
);
const cameraControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageCameraNavigation.ts"),
  "utf8"
);
const planQualityControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPagePlanQualityController.ts"),
  "utf8"
);
const selectionInspectorModelSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageSelectionInspectorModel.ts"),
  "utf8"
);
const designSceneCanvasSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignSceneCanvas.tsx"
  ),
  "utf8"
);
const designPageComponentsPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page"
);
const selectionInspectorSource = fs.readFileSync(
  path.join(designPageComponentsPath, "DesignPageSelectionInspector.tsx"),
  "utf8"
);
const planManualQuickActionsSource = fs.readFileSync(
  path.join(designPageComponentsPath, "PlanManualQuickActions.tsx"),
  "utf8"
);
const planQualityReviewPanelSource = fs.readFileSync(
  path.join(designPageComponentsPath, "PlanQualityReviewPanel.tsx"),
  "utf8"
);
const planGuidedActionsToggleSource = fs.readFileSync(
  path.join(designPageComponentsPath, "PlanGuidedActionsToggle.tsx"),
  "utf8"
);
const planPresentationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPagePlanPresentationModel.ts"
  ),
  "utf8"
);

assert.match(
  source,
  /import\s+\{\s*DesignPageViewportOverlayLayer\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPageViewportOverlayLayer"/,
  "The workspace should import the viewport-overlay composition."
);
assert.match(
  source,
  /<DesignPageViewportOverlayLayer[\s\S]*?state=\{\{[\s\S]*?configuration=\{\{[\s\S]*?references=\{\{[\s\S]*?actions=\{\{/,
  "The workspace should wire the viewport overlay through grouped contracts."
);
for (const contractName of [
  "DesignPageViewportOverlayLayerState",
  "DesignPageViewportOverlayLayerConfiguration",
  "DesignPageViewportOverlayLayerReferences",
  "DesignPageViewportOverlayLayerActions",
] as const) {
  assert.match(
    viewportOverlaySource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}
for (const movedComponent of [
  "RoomPanNavigator",
  "FloorPropertiesPanel",
  "DesignPageSelectionInspector",
  "PlanQualityReviewPanel",
] as const) {
  assert.ok(
    !source.includes(`<${movedComponent}`),
    `The workspace should delegate ${movedComponent} rendering to the viewport overlay.`
  );
  assert.ok(
    !source.includes(`/design-page/${movedComponent}\"`) &&
      !source.includes(`/editor/${movedComponent}\"`),
    `The workspace should no longer import ${movedComponent} directly.`
  );
}

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
  viewportOverlaySource,
  /data-testid="plan-right-rail"[\s\S]{0,300}?right-1 top-16/,
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
  cameraControllerSource,
  /const PLAN_2D_WHOLE_HOME_FIT_PADDING_MIN_METERS = 3\.2;/,
  "Whole-plan 2D fits should keep enough padding to avoid clipped plans on mode switch."
);

assert.match(
  cameraControllerSource,
  /WHOLE_HOME_FIT_ZOOM_SCALE/,
  "Whole-plan 2D fits should use the shared 10% closer zoom scale."
);

assert.match(
  cameraControllerSource,
  /const plan2DWholeHomeFitPaddingMeters = Math\.max\([\s\S]*PLAN_2D_WHOLE_HOME_FIT_PADDING_MIN_METERS[\s\S]*PLAN_2D_WHOLE_HOME_FIT_PADDING_RATIO[\s\S]*zoomScale: WHOLE_HOME_FIT_ZOOM_SCALE[\s\S]*const fitPaddingMeters =[\s\S]*paddingMeters \?\?[\s\S]*plan2DWholeHomeFitPaddingMeters[\s\S]*const fitZoomScale = paddingMeters == null \? WHOLE_HOME_FIT_ZOOM_SCALE : 1[\s\S]*paddingMeters: fitPaddingMeters[\s\S]*zoomScale: fitZoomScale/,
  "Manual whole-plan 2D fit should use plan-scale padding and the whole-plan zoom scale."
);

assert.match(
  cameraControllerSource,
  /handleFitSelectedPlanRoom[\s\S]*paddingMeters: 1\.2/,
  "Selected-room 2D fit should keep tighter padding than whole-plan mode."
);

assert.match(
  cameraControllerSource,
  /useState<Plan2DViewFitOrientation>\("auto"\)[\s\S]*const plan2DWholeHomeViewFit = useMemo\(\(\) => \{[\s\S]*resolvePlan2DViewFit\(\{[\s\S]*fitOrientation: wholeHomeFitOrientation[\s\S]*planDepthMeters: planFitBounds\.depthMeters[\s\S]*planWidthMeters: planFitBounds\.widthMeters/,
  "Whole-plan 2D fit should retain a plan-orientation preference instead of silently rewriting the plan geometry."
);

assert.match(
  cameraControllerSource,
  /const prepareForPlanTemplate = useCallback\(\(\) => \{[\s\S]*setWholeHomeFitOrientation\("normal"\)/,
  "Applying an imported template should preserve the source drawing's orientation."
);

assert.match(
  cameraControllerSource,
  /fitOrientation = wholeHomeFitOrientation[\s\S]*resolvePlan2DViewFit\(\{[\s\S]*fitOrientation,/,
  "Manual whole-plan Fit should keep the imported template's source orientation."
);

assert.match(
  cameraControllerSource,
  /fitOrientation\?: Plan2DViewFitOrientation[\s\S]*resolvePlan2DViewFit\(\{[\s\S]*fitOrientation,[\s\S]*planDepthMeters: depthMeters,[\s\S]*planWidthMeters: widthMeters/,
  "Imperative 2D Fit should use the shared orientation-aware view fit helper."
);

assert.match(
  cameraControllerSource,
  /handleFitSelectedPlanRoom[\s\S]*fitOrientation: "normal"/,
  "Selected-room 2D fit should opt out of whole-home auto-rotation."
);

assert.match(
  designSceneCanvasSource,
  /data-plan-2d-orientation=\{[\s\S]*configuration\.planFit\.orientation/,
  "The Canvas shell should expose its resolved 2D orientation for layout regression tests."
);

assert.match(
  source,
  /<DesignSceneCanvas[\s\S]*planFit:\s*plan2DWholeHomeViewFit/,
  "The design page should pass its resolved whole-plan fit into the Canvas shell."
);

assert.match(
  designSceneCanvasSource,
  /fitOrientation=\{configuration\.planFit\.orientation\}[\s\S]*zoomScale=\{WHOLE_HOME_FIT_ZOOM_SCALE\}/,
  "The Canvas shell's mounted 2D camera should receive the resolved orientation and zoom scale."
);

assert.match(
  cameraControllerSource,
  /const applyQueued2DPlanView = useCallback\(\s*\(attempt = 0\) => \{[\s\S]*if \(applyPlan2DCameraView\(\)\) return;[\s\S]*attempt >= 10[\s\S]*applyQueued2DPlanView\(attempt \+ 1\)/,
  "2D plan fitting should retry until the orthographic camera and controls are mounted."
);

assert.match(
  cameraControllerSource,
  /if \(previousViewMode !== "2d"\) \{[\s\S]*applyQueued2DPlanView\(\);[\s\S]*\}[\s\S]*useEffect\(\(\) => \{[\s\S]*viewMode !== "2d"[\s\S]*applyQueued2DPlanView\(\);/,
  "Entering 2D and settling 2D plan bounds should force a whole-plan refit."
);

assert.match(
  planPresentationSource,
  /const floatingPlanOverlayStackVisible\s*=\s*[\s\S]*viewportWidth >= floatingOverlayDesktopMinWidthPx/,
  "The plan presentation model should gate floating overlays by the shared desktop-width condition."
);

assert.match(
  cameraControllerSource,
  /const getWholeHome3DView = useCallback\(\(\): CameraView => \{[\s\S]*const effectiveWidthPx = Math\.max\(320, viewportWidthPx - leftInsetPx - rightInsetPx\);[\s\S]*const effectiveHeightPx = Math\.max\(260, viewportHeightPx - topInsetPx - bottomInsetPx\);/,
  "Whole-home 3D fit should account for the available viewport after editor overlays."
);

assert.match(
  cameraControllerSource,
  /const target = new THREE\.Vector3\([\s\S]*?planFitBounds\.centerX,[\s\S]*?targetY,[\s\S]*?planFitBounds\.centerZ[\s\S]*?target: \[target\.x, target\.y, target\.z\]/,
  "Whole-home 3D fit should target the actual plan center, not the world origin."
);

assert.match(
  cameraControllerSource,
  /const cameraDistance\s*=\s*Math\.max\([\s\S]*\(planRadius \/ Math\.sin\(limitingFovRad \/ 2\)\) \* 0\.74/,
  "Whole-home 3D fit should fill the available viewport without double-inflating for UI safe areas."
);

assert.doesNotMatch(
  cameraControllerSource,
  /safeAreaScale/,
  "Whole-home 3D fit should not multiply distance by a second safe-area scale."
);

assert.match(
  cameraControllerSource,
  /if \(viewportSize\.width <= 0 \|\| viewportSize\.height <= 0\) return;[\s\S]*planFitBounds\.widthMeters\.toFixed\(2\)[\s\S]*planFitBounds\.centerX\.toFixed\(2\)[\s\S]*Math\.round\(viewportSize\.width \/ 24\)/,
  "Initial whole-home 3D auto-fit should wait for measured viewport and include plan bounds in its fit key."
);

assert.match(
  source,
  /const shoppingPanelVisibleForLayout = commercePanelVisibleForLayout;/,
  "Shop mode should use an editor panel layout surface."
);

assert.match(
  source,
  /railVisible:\s*floatingPlanOverlayStackVisible[\s\S]*?navigator:\s*viewMode === "3d" && hasWholeHousePlan/,
  "The workspace should expose the shared overlay gate and the 3D whole-home navigator state."
);

assert.match(
  viewportOverlaySource,
  /state\.railVisible && state\.navigator && navigatorRailElement[\s\S]*?<RoomPanNavigator/,
  "Room navigator should only float when the shared overlay stack and navigator state are visible."
);

assert.match(
  viewportOverlaySource,
  /data-testid="plan-right-rail"[\s\S]{0,700}?ref=\{setNavigatorRailElement\}/,
  "Room navigator should reserve a slot in the shared right overlay rail."
);

assert.match(
  viewportOverlaySource,
  /navigatorRailElement[\s\S]{0,100}?\? createPortal\([\s\S]{0,100}?<RoomPanNavigator[\s\S]{0,500}?,\s*navigatorRailElement/,
  "Room navigator should render into its shared right-rail slot."
);

assert.match(
  planPresentationSource,
  /const floatingFloorPropertiesPanelVisible\s*=\s*[\s\S]*floorPropertiesPanelEligible && floatingPlanOverlayStackVisible/,
  "The plan presentation model should only float floor properties when the shared overlay stack is visible."
);

assert.match(
  source,
  /reviewPanelTopPx: 76,[\s\S]*?collapsedReviewPanelFallbackHeightPx: 56,[\s\S]*?expandedReviewPanelFallbackHeightPx: 252,/,
  "The design page should configure the plan review panel against the shared overlay row."
);

assert.match(
  planQualityControllerSource,
  /const reviewPanelFallbackHeightPx = reviewPanelCollapsed[\s\S]*?collapsedReviewPanelFallbackHeightPx[\s\S]*?expandedReviewPanelFallbackHeightPx;[\s\S]*?const reviewPanelReservedBottomPx =[\s\S]*?reviewPanelTopPx \+ \(reviewPanelHeightPx \|\| reviewPanelFallbackHeightPx\)/,
  "2D plan review panel should reserve vertical space for other right-side overlays."
);

assert.match(
  planQualityReviewPanelSource,
  /data-testid="plan-quality-review-panel"[\s\S]{0,160}?data-collapsed=\{state\.collapsed \? "true" : "false"\}[\s\S]{0,700}?width: `\$\{configuration\.dockedWidthPx\}px`/,
  "2D plan review panel should be collapsible and use the shared docked width."
);

assert.match(
  planQualityReviewPanelSource,
  /data-testid="plan-quality-review-collapse"[\s\S]{0,100}?aria-expanded=\{!state\.collapsed\}[\s\S]{0,700}?onClick=\{actions\.toggleCollapsed\}/,
  "2D plan review panel should expose a collapse toggle."
);

assert.match(
  source,
  /planQuality:\s*\{[\s\S]{0,300}?dockedWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX[\s\S]{0,1200}?planQuality:\s*\{ setPanel: setPlanQualityReviewPanelNode \}[\s\S]{0,1800}?planQuality:\s*\{[\s\S]{0,200}?toggleCollapsed: togglePlanQualityReviewPanel/,
  "The workspace should pass the controller-owned plan-review sizing, reference, and actions through the viewport boundary."
);
assert.match(
  viewportOverlaySource,
  /<PlanQualityReviewPanel[\s\S]{0,500}?\.\.\.configuration\.planQuality[\s\S]{0,200}?portalTarget: reviewRailElement[\s\S]{0,250}?references=\{references\.planQuality\}[\s\S]{0,150}?actions=\{actions\.planQuality\}/,
  "The viewport overlay should compose the controller-owned plan-review panel."
);

assert.match(
  planPresentationSource,
  /const inlineFloorPropertiesPanelVisible\s*=\s*[\s\S]*floorPropertiesPanelEligible && !floatingFloorPropertiesPanelVisible/,
  "The plan presentation model should keep floor controls inline in narrow layouts."
);

assert.match(
  source,
  /showFloorPropertiesPanel=\{inlineFloorPropertiesPanelVisible\}/,
  "Design controls should receive the inline floor panel visibility flag."
);

assert.match(
  viewportOverlaySource,
  /data-testid="plan-right-rail"[\s\S]{0,300}?bottom-24 right-1 top-16[\s\S]{0,200}?w-\[268px\][\s\S]{0,200}?overflow-x-hidden/,
  "Floating plan overlays should stay inside a fixed, right-anchored scroll rail."
);

assert.match(
  planManualQuickActionsSource,
  /data-testid="plan-manual-quick-actions"[\s\S]*left-1\/2 top-20[\s\S]*-translate-x-1\/2/,
  "Manual plan quick actions should be centered near the top of the canvas instead of overlapping the left panel."
);

assert.match(
  planGuidedActionsToggleSource,
  /const toggleClass = \[[\s\S]{0,500}?state\.compact[\s\S]{0,300}?left-1\/2 top-20 -translate-x-1\/2[\s\S]{0,900}?data-testid="plan-guided-actions-toggle"[\s\S]{0,400}?className=\{toggleClass\}/,
  "Guided actions toggle should derive its shared top-center placement class locally."
);

assert.match(
  designPageEditorCommandBarSource,
  /<EditorCommandBar[\s\S]*\{\.\.\.actions\.commandBar\}/,
  "The design-page command-bar wrapper should forward command actions to the base command bar."
);
assert.match(
  source,
  /<DesignPageEditorCommandBar[\s\S]*actions=\{\{[\s\S]*commandBar:\s*\{[\s\S]*onFeedback:\s*\(\) => setFeedbackOpen\(true\)/,
  "Design-page feedback policy should pass through the command-bar boundary instead of floating over the canvas."
);

assert.doesNotMatch(
  source,
  /placement="plan-top-center"/,
  "Feedback should not return to the top-center canvas controls."
);

assert.doesNotMatch(
  planManualQuickActionsSource,
  /data-testid="plan-manual-quick-actions"[\s\S]*bottom-32 left-4/,
  "Manual plan quick actions should not return to the lower-left selected-room stack."
);

assert.match(
  planPresentationSource,
  /const selectionInspectorDockedWithPlanStack\s*=[\s\S]*floatingPlanOverlayStackVisible[\s\S]*viewMode === "3d"[\s\S]*hasWholeHousePlan/,
  "The plan presentation model should only dock the selection inspector with the room navigator."
);

assert.match(
  planPresentationSource,
  /const selectionInspectorTopPx = selectionInspectorDockedWithPlanStack[\s\S]*\? floatingOverlayInspectorStackTopPx[\s\S]*: planQualityReviewVisible[\s\S]*\? planQualityReviewReservedBottomPx \+ floatingOverlayStackGapPx[\s\S]*: 160;/,
  "The plan presentation model should place the selection inspector below the navigator or plan review panel."
);

assert.match(
  planPresentationSource,
  /const selectionInspectorWidthPx = selectionInspectorDockedWithRightRail[\s\S]*\? floatingOverlayStackWidthPx[\s\S]*: 288;/,
  "The plan presentation model should match the navigator width when the selection inspector is docked."
);

assert.match(
  selectionInspectorSource,
  /style=\{[\s\S]*right: configuration\.floatingRightPx,[\s\S]*top: configuration\.floatingTopPx,[\s\S]*width: configuration\.floatingWidthPx,[\s\S]*\}/,
  "Selection inspector should use dynamic stack-aware placement."
);

assert.match(
  selectionInspectorModelSource,
  /const floatingSelectionInspectorVisible\s*=\s*isDesignPageSelectionInspectorVisible\(\{[\s\S]*?editorMode,[\s\S]*?hasInspectorSummary:\s*Boolean\(selectedObjectInspector\),[\s\S]*?hasSelectedProduct:\s*Boolean\(selectedProduct\),[\s\S]*?isClientPreview,[\s\S]*?\}\);/,
  "The selection-inspector model should delegate floating visibility to its pure policy."
);

assert.match(
  viewportOverlaySource,
  /data-testid="plan-right-rail"[\s\S]{0,220}?pointer-events-none[\s\S]*setNavigatorRailElement[\s\S]{0,100}?pointer-events-auto/,
  "The empty plan rail should pass canvas clicks through while mounted controls remain interactive."
);

assert.match(
  source,
  /data-testid="shopping-dock"[\s\S]*md:w-\[18\.15rem\][\s\S]*md:left-20[\s\S]*md:left-4/,
  "Shop mode should use the same left work-panel slot as Plan and Furnish."
);

assert.doesNotMatch(
  source,
  /const commercePanelDockWidthPx = 0;/,
  "Shop mode should not keep a no-op right-side canvas dock width."
);

assert.doesNotMatch(
  source,
  /right-\[calc\(372px\+1rem\)\]/,
  "Selection tray trigger should not be offset for a removed right-side shopping dock."
);

assert.match(
  source,
  /<DesignPageViewportOverlayLayer[\s\S]*?selectionInspector:\s*floatingSelectionInspectorVisible && selectedObjectInspector/,
  "The workspace should pass inspector state through the deduped visibility flag."
);
assert.match(
  viewportOverlaySource,
  /\{state\.selectionInspector \? \([\s\S]{0,120}?<DesignPageSelectionInspector/,
  "The viewport overlay should compose the extracted inspector from its grouped state."
);

const itemCartDrawerPath = path.join(process.cwd(), "components", "ItemCartDrawer.tsx");
const itemCartDrawerSource = fs.readFileSync(itemCartDrawerPath, "utf8");

const designControlsPanelPath = path.join(process.cwd(), "components", "editor", "DesignControlsPanel.tsx");
const designControlsPanelSource = fs.readFileSync(designControlsPanelPath, "utf8");
const editorCommandBarSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "EditorCommandBar.tsx"),
  "utf8"
);
const cabinetryControllerSource = fs.readFileSync(
  path.join(process.cwd(), "features", "cabinetry", "useDesignPageCabinetry.ts"),
  "utf8"
);
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
  editorCommandBarSource,
  /id: "plan"[\s\S]{0,1200}?id: "millwork"[\s\S]{0,1200}?id: "furnish"/,
  "The primary workflow should place Millwork between Plan and Furnish."
);

assert.match(
  editorCommandBarSource,
  /testId: "editor-workflow-millwork"[\s\S]{0,500}?legacyTestId: "open-custom-millwork-studio"/,
  "The top-bar Millwork entry should retain stable workflow and cabinetry test hooks."
);

assert.match(
  editorCommandBarSource,
  /data-testid="editor-command-overflow-millwork"[\s\S]{0,500}?xl:hidden/,
  "Narrow layouts should keep Millwork accessible from the top-bar More menu."
);

assert.doesNotMatch(
  designControlsPanelSource,
  /open-custom-millwork-studio|onOpenCabinetryStudio/,
  "Custom Millwork Studio should not return to the lower-left design panel."
);

assert.match(
  source,
  /<DesignPageEditorCommandBar[\s\S]*millworkActive:\s*cabinetryStudioState !== null[\s\S]*onMillwork:\s*canUseCabinetryStudio\s*\?\s*openCabinetryStudio\s*:\s*undefined/,
  "The workspace should pass Millwork state and policy through the command-bar boundary without changing the active room, wall, or editor workflow."
);

assert.doesNotMatch(
  source,
  /from "@\/components\/editor\/EditorCommandBar"|<EditorCommandBar/,
  "The workspace should delegate base command-bar imports and rendering to DesignPageEditorCommandBar."
);

assert.match(
  cabinetryControllerSource,
  /millwork_studio_opened[\s\S]{0,200}?entry_point: "command_bar"/,
  "Millwork analytics should identify the promoted command-bar entry point."
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
