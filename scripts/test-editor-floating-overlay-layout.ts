import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { readEditorCommandBarSource } from "./editor-command-bar-test-utils";

const designPagePath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageWorkspace.tsx"
);
const source = fs.readFileSync(designPagePath, "utf8");
const sceneRegionWorkspaceSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPageSceneRegionWorkspaceRegistration.ts"
  ),
  "utf8"
);
const viewportWorkspaceSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "design-page-viewport-workspace-registration.ts"
  ),
  "utf8"
);
const viewportReadModelSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "design-page-viewport-workspace-read-model.ts"
  ),
  "utf8"
);
const presentationWorkspaceSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPagePresentationWorkspaceRegistration.ts"
  ),
  "utf8"
);
const editorConfigurationSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "design-page-editor-configuration.ts"),
  "utf8"
);
const planAuthoringRegistrationSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPagePlanAuthoringRegistration.ts"),
  "utf8"
);
const panelRegistrationSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "design-page-panel-registration.ts"),
  "utf8"
);
const panelWorkspaceRegistrationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "design-page-panel-workspace-registration.ts"
  ),
  "utf8"
);
const designPageComponentsPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page"
);
const panelRegionSource = fs.readFileSync(
  path.join(designPageComponentsPath, "DesignPagePanelRegion.tsx"),
  "utf8"
);
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
const sceneRegionSource = fs.readFileSync(
  path.join(designPageComponentsPath, "DesignPageSceneRegion.tsx"),
  "utf8"
);
const sceneAdapterSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "design-page-scene-region-adapter.ts"),
  "utf8"
);
const viewportAdapterSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "design-page-viewport-region-adapter.ts"),
  "utf8"
);
const editorChromeControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageEditorChromeController.ts"),
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
// The inspector's frame (placement and style) lives beside it, read first (UX 4d).
const selectionInspectorSource = ["selectionInspectorPlacement.ts", "DesignPageSelectionInspector.tsx"]
  .map((file) => fs.readFileSync(path.join(designPageComponentsPath, file), "utf8"))
  .join("\n");
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
const roomFloorWorkspaceSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageRoomFloorWorkspace.ts"),
  "utf8"
);

assert.match(
  source,
  /import\s+\{\s*DesignPageSceneRegion\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPageSceneRegion"/,
  "The workspace should import the scene-region composition."
);
assert.match(
  sceneRegionSource,
  /import \{ DesignPageViewportOverlayLayer \}[\s\S]*?<DesignPageViewportOverlayLayer[\s\S]*?state=\{state\.viewport\}[\s\S]*?configuration=\{configuration\.viewport\}[\s\S]*?references=\{references\.viewport\}[\s\S]*?actions=\{actions\.viewport\}/,
  "The scene region should wire the viewport overlay through grouped contracts."
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
  editorConfigurationSource,
  /const PLAN_FLOATING_OVERLAY_DESKTOP_MIN_WIDTH = 1024;/,
  "Plan floating overlay stack should use the 1024px desktop threshold."
);

assert.match(
  editorConfigurationSource,
  /const PLAN_FLOATING_OVERLAY_STACK_RIGHT_PX = 4;/,
  "Floating overlay stack should use a shared right edge."
);

assert.match(
  viewportOverlaySource,
  /data-testid="plan-right-rail"[\s\S]{0,300}?right-1 top-bar-2/,
  "Floating overlay stack should align with the left plan panel top edge."
);

assert.match(
  editorConfigurationSource,
  /const PLAN_FLOATING_OVERLAY_INSPECTOR_STACK_TOP_PX = EDITOR_BAR_HEIGHT_PX \+ 268;/,
  "Selection inspector should dock beneath the floating room navigator."
);

assert.match(
  editorConfigurationSource,
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
  sceneRegionWorkspaceSource,
  /buildDesignPageSceneRegionAdapter\(\{[\s\S]*?fit:\s*planFit/,
  "The design page should inject its resolved whole-plan fit at the scene adapter boundary."
);
assert.match(
  sceneAdapterSource,
  /planFit: plan\.fit/,
  "The scene adapter should pass the resolved whole-plan fit into the Canvas shell."
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
  roomFloorWorkspaceSource,
  /const shoppingPanelVisibleForLayout = commercePanelVisibleForLayout;/,
  "Shop mode should use an editor panel layout surface."
);

assert.match(
  viewportReadModelSource,
  /rail:\s*\(?planWorkspace\.derived\.floatingPlanOverlayStackVisible[\s\S]*?enabled:\s*base\.state\.editor\.viewMode === "3d" && scene\.hasWholeHousePlan/,
  "The viewport read model should inject the shared overlay gate and 3D whole-home navigator state."
);
assert.match(
  viewportAdapterSource,
  /railVisible: state\.visibility\.rail[\s\S]*?navigator: state\.navigator\.enabled/,
  "The viewport adapter should expose the shared overlay gate and navigator state."
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
  planAuthoringRegistrationSource,
  /reviewPanelTopPx: EDITOR_BAR_HEIGHT_PX \+ 20,[\s\S]*?collapsedReviewPanelFallbackHeightPx: 56,[\s\S]*?expandedReviewPanelFallbackHeightPx: 252,/,
  "Plan authoring should configure the review panel against the shared overlay row."
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
  `${viewportReadModelSource}\n${viewportWorkspaceSource}`,
  /floatingOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX[\s\S]*?setPanel: planWorkspace\.refs\.quality\.setReviewPanelNode[\s\S]*?toggleCollapsed: planWorkspace\.actions\.quality\.toggleReviewPanel[\s\S]*?activateIssue: planWorkspace\.actions\.quality\.activateIssue/,
  "The viewport workspace should inject plan-review sizing, reference, and actions."
);
assert.match(
  viewportAdapterSource,
  /planQuality:\s*\{[\s\S]*?dockedWidthPx: configuration\.floatingOverlayStackWidthPx[\s\S]*?planQuality: actions\.planQuality/,
  "The viewport adapter should pass plan-review sizing and actions through the viewport boundary."
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
  panelWorkspaceRegistrationSource,
  /showFloorPropertiesPanel:[\s\S]*?planWorkspace\.derived\.inlineFloorPropertiesPanelVisible/,
  "The panel workspace should inject inline floor-panel visibility at the panel-registration boundary."
);
assert.match(
  panelRegistrationSource,
  /buildDesignControlsPanelModel\(\{[\s\S]*?surfaces:\s*\{[\s\S]*?showFloorPropertiesPanel:\s*derived\.surface\.showFloorPropertiesPanel/,
  "The panel registration boundary should forward inline floor-panel visibility to the controls model."
);

assert.match(
  viewportOverlaySource,
  /data-testid="plan-right-rail"[\s\S]{0,300}?bottom-24 right-1 top-bar-2[\s\S]{0,200}?w-\[268px\][\s\S]{0,200}?overflow-x-hidden/,
  "Floating plan overlays should stay inside a fixed, right-anchored scroll rail."
);

assert.match(
  fs.readFileSync(path.join(designPageComponentsPath, "DesignPagePlanCanvasOverlays.tsx"), "utf8"),
  /data-testid="plan-canvas-tool-row"\s+className="pointer-events-none absolute left-1\/2 top-bar-17 z-30 flex w-max max-w-\[calc\(100vw-2rem\)\] -translate-x-1\/2 flex-wrap items-center justify-center gap-2 md:top-bar-20"\s*>\s*\{quickActions\}\s*\{tips\}/,
  "Manual plan quick actions, with Tips after them in one row, are centred near the top of the canvas (UX 4d)."
);
assert.match(
  planManualQuickActionsSource,
  /data-testid="plan-manual-quick-actions"\s+className="pointer-events-auto flex flex-wrap items-center/,
  "The quick actions sit in the row, which places them."
);

assert.match(
  planGuidedActionsToggleSource,
  /const toggleClass = \[[\s\S]{0,500}?state\.compact[\s\S]{0,300}?left-1\/2 top-bar-17 -translate-x-1\/2 gap-2 px-3 py-2 md:top-bar-20[\s\S]{0,900}?data-testid="plan-guided-actions-toggle"[\s\S]{0,400}?className=\{toggleClass\}/,
  "Guided actions toggle should derive its shared top-center placement class locally."
);

assert.match(
  designPageEditorCommandBarSource,
  /<EditorCommandBar[\s\S]*\{\.\.\.actions\.commandBar\}/,
  "The design-page command-bar wrapper should forward command actions to the base command bar."
);
assert.match(
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?setFeedbackOpen: base\.actions\.dialogs\.setFeedbackOpen/,
  "The presentation workspace should inject feedback state at the presentation/QA boundary."
);
assert.match(
  editorChromeControllerSource,
  /const openFeedback = \(\) => \{[\s\S]*?setFeedbackOpen\(true\)[\s\S]*?onFeedback: openFeedback/,
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
  /const selectionInspectorTopPx = selectionInspectorDockedWithPlanStack[\s\S]*\? floatingOverlayInspectorStackTopPx[\s\S]*: planQualityReviewVisible[\s\S]*\? planQualityReviewReservedBottomPx \+ floatingOverlayStackGapPx[\s\S]*: EDITOR_BAR_HEIGHT_PX \+ 104;/,
  "The plan presentation model should place the selection inspector below the navigator or plan review panel."
);

assert.match(
  planPresentationSource,
  /const selectionInspectorWidthPx = selectionInspectorDockedWithRightRail[\s\S]*\? floatingOverlayStackWidthPx[\s\S]*: 288;/,
  "The plan presentation model should match the navigator width when the selection inspector is docked."
);

assert.match(
  selectionInspectorSource,
  /function inspectorFrame[\s\S]*?right: configuration\.floatingRightPx,[\s\S]*top: configuration\.floatingTopPx,[\s\S]*width: configuration\.floatingWidthPx,[\s\S]*style=\{frame\.style\}/,
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
  panelRegionSource,
  /data-testid="shop-step"\s+className="absolute inset-x-0 bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\] top-bar-0 z-40 overflow-y-auto bg-\[#fafaf9\] md:bottom-0"/,
  "Shop should be one page over the canvas at every width, from the command bar to the phone's step bar (UX audit FU8)."
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
  viewportReadModelSource,
  /selectionInspector:\s*inspector\.floatingSelectionInspectorVisible/,
  "The viewport read model should inject the deduped inspector visibility flag."
);
assert.match(
  viewportReadModelSource,
  /summary:\s*inspector\.selectedObjectInspector/,
  "The viewport read model should inject controller-owned inspector state."
);
assert.match(
  viewportAdapterSource,
  /selectionInspector:\s*state\.visibility\.selectionInspector && selectionSummary/,
  "The viewport adapter should gate inspector state through the deduped visibility flag."
);
assert.match(
  viewportOverlaySource,
  /\{state\.selectionInspector \? \([\s\S]{0,120}?<DesignPageSelectionInspector/,
  "The viewport overlay should compose the extracted inspector from its grouped state."
);

const designControlsPanelPath = path.join(process.cwd(), "components", "editor", "DesignControlsPanel.tsx");
// The panel's frame (the desktop column, its edge strip and the phone sheet) is its own file.
const designControlsPanelSource = [
  designControlsPanelPath,
  path.join(process.cwd(), "components", "editor", "DesignControlsPanelFrame.tsx"),
].map((file) => fs.readFileSync(file, "utf8")).join("\n");
const editorCommandBarSource = readEditorCommandBarSource();
const editorViewToggleSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "EditorViewToggle.tsx"),
  "utf8"
);
const roomPlanStatusBarSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "RoomPlanStatusBar.tsx"),
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
  /absolute top-bar-2 z-20 w-\[18\.15rem\] space-y-3 pr-1/,
  "Main left design controls column should use the adjusted slimmer panel width."
);

assert.match(
  designControlsPanelSource,
  /const panelLeftClass = temporarilyRevealed[\s\S]*?: "left-1";[\s\S]*?absolute top-bar-2 z-20/,
  "Main left design controls column should sit as close to the viewport edge as the right overlay stack (phones get the step sheet, UX 4d)."
);

assert.match(
  designControlsPanelSource,
  /data-testid="design-controls-edge-reveal"[\s\S]*?onMouseEnter=\{openEdgePreview\}[\s\S]*?data-testid="design-controls-edge-toggle"/,
  "Collapsed design controls should reveal from a mouse-sensitive left-edge target with a keyboard/touch toggle."
);

assert.match(
  designControlsPanelSource,
  /temporarilyRevealed,\s*header: <PanelColumnHeader [\s\S]*?onMouseEnter: cancelEdgePreviewClose,\s*onMouseLeave: \(\) => \{\s*if \(temporarilyRevealed\) scheduleEdgePreviewClose\(\);[\s\S]*?data-testid="design-controls-sidebar-toggle"[\s\S]*?Keep open/,
  "The edge-revealed sidebar should dismiss on pointer exit and support pinning itself open."
);
// The column is drawn by the phone sheet's component (UX 4d), which takes its reveal and pointer handlers.
assert.match(
  fs.readFileSync(path.join(process.cwd(), "components/editor/PhoneStepSheet.tsx"), "utf8"),
  /"data-temporary-reveal": column\.temporarilyRevealed \? "true" : "false",[\s\S]*?onMouseEnter: column\.onMouseEnter,\s*onMouseLeave: column\.onMouseLeave,/
);

assert.match(
  designControlsPanelSource,
  /const panelLeftClass = temporarilyRevealed[\s\S]*?\? "left-0"/,
  "The temporary sidebar should stay under the left-edge cursor instead of opening beside it."
);

assert.match(
  designControlsPanelSource,
  /const scheduleEdgePreviewClose = \(\) => \{[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?setEdgePreviewOpen\(false\)[\s\S]*?\}, 180\)/,
  "The temporary sidebar should use a short exit grace period instead of flickering."
);

assert.match(
  designControlsPanelSource,
  /event\.metaKey \|\| event\.ctrlKey[\s\S]*?event\.key\.toLowerCase\(\) !== "b"[\s\S]*?onToggle\(\);[\s\S]*?const toggle = \(\) => \{[\s\S]*?if \(wide\) toggleStepPanel\(policy, props\.collapsed, onCollapsedChange\);\s*else onCollapsedChange\(!props\.collapsed\);/,
  "The design sidebar should expose a Codex-style Ctrl/Cmd+B toggle without intercepting text fields."
);

assert.match(
  editorCommandBarSource,
  /data-testid="editor-design-sidebar-toggle"[\s\S]*?data-state=\{designSidebarCollapsed \? "collapsed" : "expanded"\}[\s\S]*?aria-expanded=\{!designSidebarCollapsed\}[\s\S]*?onClick=\{\(\) => toggleStepPanel\(policy, storedCollapsed, setCollapsed\)\}[\s\S]*?<PanelLeft/,
  "The command bar should expose a compact Codex-style sidebar toggle in the top-left controls."
);

assert.match(
  editorCommandBarSource,
  /data-testid="editor-command-bar"[\s\S]{0,300}?absolute left-0 right-0 top-0 z-50 flex h-\(--editor-bar-h\) items-center gap-1 [^`]*px-1 [^`]*md:gap-4 md:px-4 md:backdrop-blur/,
  "The editor command bar is --editor-bar-h (56px) tall at every width: the phone header and the desktop bar (UX 4c, 4d)."
);

// Undo, Redo and 2D/3D sit over the canvas at every width: the toolbar from md (UX 4c), the
// phone's pills below it (UX 4d, 44px targets).
assert.doesNotMatch(editorCommandBarSource, /data-testid="command-(?:undo|redo)"|<EditorViewToggle/, "The bar holds no history or view controls.");
const phoneCanvasPillsSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "canvas", "PhoneCanvasPills.tsx"),
  "utf8"
);
assert.match(phoneCanvasPillsSource, /const historyClass = `inline-flex h-11 w-11 shrink-0 (?![^`]*\bmd:)/, "The phone's Undo and Redo are 44px.");
for (const historyTestId of ["command-undo", "command-redo"] as const) {
  assert.match(
    phoneCanvasPillsSource,
    new RegExp(`data-testid="${historyTestId}"[^>]*?className=\\{historyClass\\}`),
    `${historyTestId} should use the pill's history-control size.`
  );
}

// The phone header's controls are 44px targets (the PhonePlan mockup); from md the 56px bar's
// are 36px (the TopBar mockup). More and Account show only from md, the Menu only below it.
for (const controlTestId of ["save-design", "editor-command-share"] as const) {
  assert.match(
    editorCommandBarSource,
    new RegExp(`data-testid="${controlTestId}"[\\s\\S]{0,1400}?"[^"]*\\bh-11 w-11\\b[^"]*\\bmd:h-9\\b`),
    `${controlTestId} should be 44px on phones and 36px from md.`
  );
}
assert.match(editorCommandBarSource, /if \(phone\) \{\s*return dark\s*\? "designer-control inline-flex h-11 w-11 /, "The phone's Menu is 44px.");
assert.match(editorCommandBarSource, /return dark\s*\? "designer-control inline-flex h-9 w-9 [^"]*"\s*: "inline-flex h-9 w-9 /, "More is 36px.");
assert.match(editorCommandBarSource, /data-testid="editor-command-account"[\s\S]{0,400}?"inline-flex h-9 w-9 /, "Account is 36px.");
assert.match(editorCommandBarSource, /data-testid="editor-design-sidebar-toggle"[\s\S]{0,700}?: "inline-flex h-9 w-9 /, "The sidebar toggle is 36px, from md.");
assert.match(editorCommandBarSource, /sidebarToggleVisible=\{sidebarToggleVisible && wide\}/, "Phones collapse and expand the step sheet from its handle.");
for (const controlTestId of ["editor-command-get-pro", "editor-command-download"] as const) {
  assert.match(
    editorCommandBarSource,
    new RegExp(`data-testid="${controlTestId}"[\\s\\S]{0,600}?"hidden h-9 `),
    `${controlTestId} should be 36px where it shows.`
  );
}
assert.match(
  editorCommandBarSource,
  /<div className="ml-1\.5 flex min-w-0 flex-1 flex-col justify-center gap-0\.5 md:ml-0 md:flex-initial">\s*<CommandBarDesignTitle [^>]*\/>\s*<CommandBarSaveStatus [^>]*\/>\s*<\/div>/,
  "At every width the save status is a line under the design's name."
);
assert.match(
  editorCommandBarSource,
  /<div className="flex min-w-0 flex-1 basis-0 items-center gap-1 md:gap-3">[\s\S]*?<\/div>\s*<CommandBarStepTabs [^>]*\/>\s*<div className="flex shrink-0 items-center justify-end gap-1 md:min-w-max md:flex-1 md:basis-0 md:gap-2">/,
  "From md the steps sit in the centre of the bar, between two equal sides."
);

// The steps sit in the bar from tablet width up; phones get them as a bar along the bottom.
assert.match(
  editorCommandBarSource,
  /function stepNavClass\(dark: boolean\) \{[\s\S]*?"fixed inset-x-0 bottom-0 z-50 grid h-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\] grid-cols-3[^"]*md:static md:inline-flex md:h-11 [^"]*md:rounded-xl md:p-1/,
  "The design steps should be the mockup's 44px segmented control of 36px steps in the bar, and a bottom bar on phones."
);
assert.match(
  editorCommandBarSource,
  /md:gap-4 md:px-4 md:backdrop-blur/,
  "The bar should only blur from tablet width up: a backdrop filter would pin the phone step bar inside it."
);

// One bar height from md (UX 4c): the bar is --editor-bar-h tall, and what sits under it is placed
// from it with top-bar-* (0.5rem under the bar is top-bar-2), so the bar can grow in one place.
const globalsCss = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
assert.match(globalsCss, /:root \{[\s\S]*?--editor-bar-h: 3\.5rem;[\s\S]*?\}/);
assert.match(editorConfigurationSource, /export const EDITOR_BAR_HEIGHT_PX = 56;/, "The TypeScript bar height matches --editor-bar-h.");
assert.match(globalsCss, /@utility top-bar-\* \{\s*top: calc\(var\(--editor-bar-h\) \+ --spacing\(--value\(integer\)\)\);\s*\}/);
const editorOverlayFiles = [
  "components/editor/DesignControlsPanel.tsx",
  "components/editor/DesignControlsPanelFrame.tsx",
  "components/editor/PhoneStepSheet.tsx",
  "components/editor/EditorToolRail.tsx",
  "components/catalog/CatalogItemDrawer.tsx",
  ...fs
    .readdirSync(path.join(process.cwd(), "components/editor/design-page"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => `components/editor/design-page/${name}`),
];
const barOffsetsByHand = editorOverlayFiles.filter((file) =>
  /(?<![\w-])md:(?:top-(?:9|11|15|23|36)|max-h-\[calc\(100vh-4\.75rem\)\])(?![\w-])/.test(
    fs.readFileSync(path.join(process.cwd(), file), "utf8")
  )
);
assert.deepEqual(barOffsetsByHand, [], "Place what sits under the bar with top-bar-* from md, not a fixed offset.");
// Phones too (UX 4d): the header is --editor-bar-h tall, and the canvas pills sit 12px under it.
const phoneBarOffsetsByHand = editorOverlayFiles.filter((file) =>
  /(?<![\w:-])top-(?:9|11|12|15|23)(?![\w-])/.test(fs.readFileSync(path.join(process.cwd(), file), "utf8"))
);
assert.deepEqual(phoneBarOffsetsByHand, [], "Place what sits under the phone header with top-bar-* too.");

assert.match(
  editorViewToggleSource,
  /variant: "canvas" \| "pill";/,
  "The view selector is the canvas toolbar's or the phone's: Present & export's 30px one retired with it."
);
assert.match(
  editorViewToggleSource,
  /const PILL_SEGMENT_CLASS =\s*"inline-flex h-11 w-12 items-center justify-center rounded-\[9px\] text-sm font-bold leading-none";/,
  "The phone's view selector should use 44px segments, in a pill over the canvas (UX 4d)."
);
assert.match(
  editorViewToggleSource,
  /const CANVAS_SEGMENT_CLASS =\s*"inline-flex h-8 touch:h-11 items-center justify-center rounded-\[7px\] px-3\.5 text-\[13px\] font-bold leading-none";/,
  "The canvas toolbar's view selector should use the mockup's 32px segments."
);

assert.match(
  roomPlanStatusBarSource,
  /isCommand[\s\S]*\? "h-\[30px\] max-w-full/,
  "Command-bar room context should use the shared 30px closed-control height."
);

assert.match(
  editorCommandBarSource,
  /const menuButtonClass = dark[\s\S]*?px-3 py-2 text-left text-sm/,
  "Opened command menus should retain their comfortable row sizing."
);

assert.match(
  editorChromeControllerSource,
  /const toggleDesignSidebar = \(\) => \{[\s\S]*?setDesignPanelOpen\(true\)[\s\S]*?setDesignPanelCollapsed\(false\)[\s\S]*?setDesignPanelCollapsed\(\(collapsed\) => !collapsed\)[\s\S]*?onToggleDesignSidebar: toggleDesignSidebar/,
  "The top-left sidebar control should reopen a hidden panel and toggle an already-open panel."
);

assert.match(
  editorCommandBarSource,
  /id: "plan"[\s\S]{0,400}?testId: "editor-workflow-plan"[\s\S]{0,400}?id: "furnish"[\s\S]{0,400}?testId: "editor-workflow-furnish"[\s\S]{0,400}?id: "shop"[\s\S]{0,400}?testId: "editor-workflow-shop"/,
  "The command bar should show the three design steps in order: Plan, Furnish, Shop."
);

assert.match(
  editorCommandBarSource,
  /aria-label="Design steps"[\s\S]*?data-testid="editor-design-steps"[\s\S]*?steps\.map[\s\S]*?data-testid=\{step\.testId\}/,
  "Every width should show the design steps instead of a Workspace menu."
);

assert.doesNotMatch(
  editorCommandBarSource,
  /data-testid="editor-command-workspace/,
  "The Workspace menu should not come back next to the design steps."
);

assert.match(
  designControlsPanelSource,
  /\(effectivePanelMode === "furnish" \|\| effectivePanelMode === "ai"\) && \([\s\S]*?<FurnishStepModes/,
  "The Furnish step should carry its own switch to Suggest a layout and its Built-ins entry."
);

assert.match(
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*millworkActive:\s*cabinetry\.state\.studio !== null/,
  "The presentation workspace should tell the command bar while the Built-ins studio is open."
);
assert.doesNotMatch(
  editorChromeControllerSource,
  /onMillwork/,
  "Built-ins opens from the Furnish step, so the editor-chrome controller no longer carries it."
);

assert.doesNotMatch(
  source,
  /from "@\/components\/editor\/EditorCommandBar"|<EditorCommandBar/,
  "The workspace should delegate base command-bar imports and rendering to DesignPageEditorCommandBar."
);

assert.match(
  cabinetryControllerSource,
  /millwork_studio_opened[\s\S]{0,200}?entry_point: "furnish_step"/,
  "Built-ins analytics should identify the Furnish step as its entry point."
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

assert.equal(
  fs.existsSync(path.join(process.cwd(), "components", "ItemCartDrawer.tsx")),
  false,
  "The Selection Tray went with the one Shopping list (UX 3c-2): nothing floats a Tray button over the editor."
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
