import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  mergeDesignPageCameraDiagnostics,
  mergeDesignPagePlanMetrics,
} from "../lib/design-page-editor-shell-metrics";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const regionSource = readSource(
  "components/editor/design-page/DesignPageSceneRegion.tsx"
);
const canvasSource = readSource(
  "components/editor/design-page/DesignSceneCanvas.tsx"
);
const lightingSystemSource = readSource(
  "components/editor/design-page/lighting/LightingSystem.tsx"
);
const sunControllerSource = readSource(
  "components/editor/design-page/lighting/SunController.tsx"
);
const shadowBudgetManagerSource = readSource(
  "components/editor/design-page/lighting/ShadowBudgetManager.ts"
);
const adapterSource = readSource("lib/design-page-scene-region-adapter.ts");
const sceneWorkspaceSource = readSource(
  "lib/useDesignPageSceneRegionWorkspaceRegistration.ts"
);
const structureSource = readSource(
  "components/editor/design-page/DesignSceneStructureLayer.tsx"
);
const planRendererSource = readSource(
  "components/editor/renderers/RoomRenderer2D.tsx"
);
const guidanceSource = readSource(
  "components/editor/design-page/DesignSceneGuidanceLayer.tsx"
);
const previewSource = readSource(
  "components/editor/design-page/DesignScenePreviewLayer.tsx"
);
const itemsSource = readSource(
  "components/editor/design-page/SceneItemsLayer.tsx"
);
const furnitureSource = readSource("components/scene/FurnitureItem.tsx");
const scaledModelSource = readSource("components/scene/GLBScaledModel.tsx");
const normalizeGLBSceneSource = readSource(
  "components/scene/glb-scaled-model/normalizeGLBScene.ts"
);
const selectionOutlineSource = readSource(
  "components/scene/furniture/FurnitureSelectionOutline.tsx"
);
const localRenderBoundsSource = readSource(
  "components/scene/glb-scaled-model/localRenderBounds.ts"
);
const glbModelResourcesSource = readSource(
  "components/scene/glb-scaled-model/glbModelResources.ts"
);
const measureGLBLocalRenderBoundsSource = readSource(
  "components/scene/glb-scaled-model/measureGLBLocalRenderBounds.ts"
);
const glbModelResourceResolutionSource = readSource(
  "components/scene/glb-scaled-model/glbModelResourceResolution.ts"
);
const glbModelLifecycleSource = readSource(
  "components/scene/glb-scaled-model/useGLBModelLifecycle.ts"
);
const glbLoadedResourceSource = readSource(
  "components/scene/glb-scaled-model/useGLBLoadedResource.ts"
);
const modelDiagnosticsSource = readSource(
  "components/scene/glb-scaled-model/modelDiagnostics.ts"
);
const modelLifecycleTypesSource = readSource(
  "components/scene/glb-scaled-model/modelLifecycleTypes.ts"
);
const cameraNavigationSource = readSource(
  "lib/useDesignPageCameraNavigation.ts"
);
const canonicalStructureSource = readSource(
  "components/editor/renderers/CanonicalFloorPlanStructure.tsx"
);
const coreShellBaseRegistrationSource = readSource(
  "lib/useDesignPageCoreShellBaseRegistration.ts"
);
const coreShellRegistrationSource = readSource(
  "lib/useDesignPageCoreShellRegistration.ts"
);
const viewportShellRegistrationSource = readSource(
  "lib/useDesignPageViewportShellRegistration.ts"
);
const planRuntimeSource = readSource(
  "lib/useDesignPagePlanViewportRuntime.ts"
);
const shellRuntimeSource = readSource(
  "lib/useDesignPageEditorShellRuntime.ts"
);
const clientLifecycleSource = readSource(
  "lib/useDesignPageEditorClientLifecycle.ts"
);
const selectionInspectionRuntimeSource = readSource(
  "lib/useDesignPageSelectionInspectionRuntime.ts"
);
const planAuthoringRegistrationSource = readSource(
  "lib/useDesignPagePlanAuthoringRegistration.ts"
);
const paywallRegistrationFacadeSource = readSource(
  "lib/useDesignPagePaywallRegistrationFacade.ts"
);
const lateBoundRefSource = readSource(
  "lib/useDesignPageLateBoundRef.ts"
);
const persistenceRegistrationSource = readSource(
  "lib/useDesignPagePersistenceRegistration.ts"
);
const documentSelectionRegistrationSource = readSource(
  "lib/useDesignPageDocumentSelectionRegistrationFacade.ts"
);
const presentationBackupRegistrationSource = readSource(
  "lib/useDesignPagePresentationBackupRegistrationFacade.ts"
);

const assertSourceOrder = (
  source: string,
  markers: readonly string[],
  message: string
) => {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(index > previousIndex, `${message}: ${marker}`);
    previousIndex = index;
  }
};

assertSourceOrder(
  coreShellRegistrationSource,
  [
    "useDesignPageCoreShellBaseRegistration()",
    "useDesignPageViewportShellRegistration({",
    "useEditorMode(",
    "useDesignPageTransientFeedback({",
    "const seatingZoneAutoDisabledRef",
    "useDesignPageWorkspacePaywallRegistration({",
    "useDesignPageEditorClientLifecycle({",
    "useDesignPageSnapshotDocumentState()",
  ],
  "Core shell registration should preserve the early-runtime hook order"
);
assertSourceOrder(
  viewportShellRegistrationSource,
  [
    "useDesignPagePlanViewportRuntime({",
    "useDesignPageEditorShellRuntime({",
  ],
  "Viewport shell registration should preserve viewport-before-shell order"
);
assertSourceOrder(
  workspaceSource,
  [
    "useDesignPagePresentationBackupRegistrationFacade({",
    "useDesignPageWorkspaceDeferredPaywallRegistration({",
    "useDesignPagePlanAuthoringRegistration({",
  ],
  "Workspace should preserve deferred paywall registration order"
);
assertSourceOrder(
  planAuthoringRegistrationSource,
  [
    "if (!planSettingsLoaded)",
    "useDesignPageSelectionInspectionRuntime({",
  ],
  "Plan authoring should seed default openings before selection inspection"
);
assert.match(
  presentationBackupRegistrationSource,
  /useDesignPagePresentationExportRuntime\(\{[\s\S]*?useDesignPageLocalBackupHydration\(\{/,
  "Presentation registration should keep export before local-backup hydration."
);
assert.match(
  paywallRegistrationFacadeSource,
  /useDesignPageWorkspaceDeferredPaywallRegistration\(\{[\s\S]*?useDesignPageDeferredPaywallLifecycle\(\{[\s\S]*?navigation,[\s\S]*?searchParams\.get\("session_id"\)[\s\S]*?searchParams\.get\("refresh_plan"\)[\s\S]*?searchParams\.get\("paywall_open"\)[\s\S]*?searchParams\.get\("plans_open"\)/,
  "Deferred paywall registration should own navigation and query-key adaptation."
);
assert.doesNotMatch(
  workspaceSource,
  /useDesignPageDeferredPaywallLifecycle\(\{/,
  "Workspace should not bypass deferred paywall registration."
);
assertSourceOrder(
  planRuntimeSource,
  [
    "planDebugMetrics, setPlanDebugMetrics",
    "showLayoutDebugOverlay, setShowLayoutDebugOverlay",
    "viewportSize, setViewportSize",
    "useDesignPagePlanDocumentState()",
    "useDesignPageFloorPlanDocumentState()",
    "selectedPlanOverlayId, setSelectedPlanOverlayId",
    "suppressedDoorwaySuggestionKeys, setSuppressedDoorwaySuggestionKeys",
    "planRoomSelection, setPlanRoomSelection",
    "useDesignPageCameraBridgeController({",
  ],
  "Plan runtime should preserve plan, selection, and camera hook order"
);
assertSourceOrder(
  shellRuntimeSource,
  [
    "hoveredCartInstanceId, setHoveredCartInstanceId",
    "showPresentModal, setShowPresentModal",
    "presentModeRoomId, setPresentModeRoomId",
    "shoppingReadinessFilter, setShoppingReadinessFilter",
    "useDesignPageSurfaceStateController()",
    "editorMode, setEditorMode",
    "guidedPlanStartMode, setGuidedPlanStartMode",
    "useDesignPagePanelMode({",
    "const updateViewportSize",
    'window.localStorage.getItem("design_layout_debug")',
    "const handlePlanDebugMetricsChange",
    "const handlePlan2DCameraDiagnosticsChange",
    "if (!state.designPanelOpen)",
  ],
  "Editor shell runtime should preserve cart-through-collapse hook order"
);
assertSourceOrder(
  clientLifecycleSource,
  [
    '"seating_zone_auto_disabled"',
    'localStorage.setItem("placement_add_mode"',
    "preloadCoreAssets()",
    'if (state.editorMode === "present")',
    "const signInWithReturn",
  ],
  "Editor client lifecycle should preserve hydration-through-sign-in hook order"
);
assert.match(
  coreShellBaseRegistrationSource,
  /useState<number>\(\(\) => Date\.now\(\)\)/,
  "The AI seed should use a lazy initializer instead of reading time directly during render."
);
assertSourceOrder(
  workspaceSource,
  [
    "useDesignPageDocumentSelectionRegistrationFacade({",
    "useDesignPagePlanAuthoringRegistration({",
    "useDesignPagePersistenceWorkspaceRegistration({",
  ],
  "Late callback bridges should bind in dependency order"
);
assert.match(
  documentSelectionRegistrationSource,
  /useDesignPageLateBoundRef\([\s\S]*?itemSelection\.actions\.resetSelectionState/,
  "Document registration should bind the selection reset bridge before downstream inspection."
);
assertSourceOrder(
  persistenceRegistrationSource,
  [
    "useDesignPagePersistenceNewPlanFacade({",
    "useDesignPageLateBoundRef(localBackupPersistenceActions",
  ],
  "Persistence should register before the local-backup bridge is rebound"
);
assertSourceOrder(
  selectionInspectionRuntimeSource,
  [
    "useDesignPageSelectionCoordinator({",
    "bindFloorSelectionAction(clearNonRoomSelection)",
    "useDesignPageRoomGeometry({",
    "useDesignPageProductInspectionController({",
    "useDesignPageLateBoundRef(",
    "useDesignPageItemGeometry({",
  ],
  "Selection inspection runtime should preserve its hook and effect order"
);
for (const movedOwner of [
  "useDesignPageSelectionCoordinator({",
  "useDesignPageRoomGeometry({",
  "useDesignPageProductInspectionController({",
  "useDesignPageItemGeometry({",
] as const) {
  assert.ok(
    !workspaceSource.includes(movedOwner),
    `Workspace should no longer own ${movedOwner}.`
  );
  assert.ok(
    selectionInspectionRuntimeSource.includes(movedOwner),
    `Selection inspection runtime should own ${movedOwner}.`
  );
}
assert.match(
  selectionInspectionRuntimeSource,
  /boundaries:\s*\{[\s\S]*?coordination: selectionCoordinator,[\s\S]*?inspection: productInspectionController,[\s\S]*?geometry: itemGeometryController,/,
  "Selection inspection runtime should return the raw controller boundaries."
);
assert.match(
  lateBoundRefSource,
  /useLayoutEffect\(\(\) => \{[\s\S]*?targetRef\.current = value/,
  "Late callback bridges should bind before passive startup effects."
);

const initialMetrics = {
  zoom: 1,
  visibleLabelCount: 2,
  projectedRoomMinWidthPx: 3,
  projectedRoomMinHeightPx: 4,
  projectedRoomMinAreaPx: 12,
  cameraValid: true,
  cameraRecoveries: 0,
  cameraTargetX: 5,
  cameraTargetZ: 6,
};
assert.equal(
  mergeDesignPagePlanMetrics(initialMetrics, {
    zoom: 1,
    visibleLabelCount: 2,
  }),
  initialMetrics,
  "Equal plan metrics should retain their object identity."
);
assert.deepEqual(
  mergeDesignPagePlanMetrics(initialMetrics, {
    zoom: 2,
    visibleLabelCount: 3,
  }),
  { ...initialMetrics, zoom: 2, visibleLabelCount: 3 },
  "Changed plan metrics should merge without dropping camera diagnostics."
);
const cameraDiagnostics = {
  valid: false,
  recoveries: 1,
  targetX: 7,
  targetZ: 8,
  projectedRoomMinWidthPx: 9,
  projectedRoomMinHeightPx: 10,
  projectedRoomMinAreaPx: 90,
};
assert.deepEqual(
  mergeDesignPageCameraDiagnostics(initialMetrics, cameraDiagnostics),
  {
    ...initialMetrics,
    cameraValid: false,
    cameraRecoveries: 1,
    cameraTargetX: 7,
    cameraTargetZ: 8,
    projectedRoomMinWidthPx: 9,
    projectedRoomMinHeightPx: 10,
    projectedRoomMinAreaPx: 90,
  },
  "Camera diagnostics should update only their owned metric fields."
);

for (const [componentName, contractKey] of [
  ["DesignSceneStructureLayer", "structure"],
  ["DesignSceneGuidanceLayer", "guidance"],
  ["DesignScenePreviewLayer", "preview"],
] as const) {
  assert.match(
    regionSource,
    new RegExp(
      `import\\s+\\{\\s*${componentName}\\s*\\}\\s+from\\s+"@/components/editor/design-page/${componentName}"`
    ),
    `The scene region should import ${componentName}.`
  );
  assert.match(
    regionSource,
    new RegExp(
      `<${componentName}\\b[\\s\\S]*?state=\\{state\\.${contractKey}\\}[\\s\\S]*?configuration=\\{configuration\\.${contractKey}\\}`
    ),
    `${componentName} should use grouped state and configuration.`
  );
}

const structureIndex = regionSource.indexOf("<DesignSceneStructureLayer");
const guidanceIndex = regionSource.indexOf("<DesignSceneGuidanceLayer");
const itemsIndex = regionSource.indexOf("<SceneItemsLayer", guidanceIndex);
const previewIndex = regionSource.indexOf(
  "<DesignScenePreviewLayer",
  itemsIndex
);
const canvasEndIndex = regionSource.indexOf(
  "</DesignSceneCanvas>",
  previewIndex
);

assert.ok(structureIndex >= 0, "The scene region should render the structure layer.");
assert.ok(
  structureIndex < guidanceIndex &&
    guidanceIndex < itemsIndex &&
    itemsIndex < previewIndex,
  "Scene order should remain Structure -> Guidance -> SceneItemsLayer -> Preview."
);
assert.ok(
  previewIndex < canvasEndIndex,
  "Extracted scene layers should remain inside DesignSceneCanvas."
);

for (const movedOwnership of [
  "<PlanUnderlayRenderer2D",
  "<RoomRenderer2D",
  "<PlanQualityHintOverlay",
  "<HousePlanRenderer3D",
  "catalog-placement-support-surface-highlight",
  "catalog-placement-hover-ghost",
  "ai-layout-preview-layer",
  "<DesignerGrid",
  "<CirculationHeatmapOverlay",
  "<ZoneOutline",
] as const) {
  assert.ok(
    !workspaceSource.includes(movedOwnership),
    `Workspace should no longer own ${movedOwnership}.`
  );
}

for (const contractName of [
  "DesignSceneStructureLayerState",
  "DesignSceneStructureLayerConfiguration",
  "DesignSceneStructureLayerActions",
] as const) {
  assert.match(
    structureSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}

for (const expected of [
  "<PlanUnderlayRenderer2D",
  "<RoomRenderer2D",
  "<PlanQualityHintOverlay",
  "<HousePlanRenderer3D",
  "<Room",
  "mapPlanOpeningsToRoomRenderer(plan.scene.openings)",
  "mapPlanFixedElementsToRoomRenderer(",
  "mapPlanAnnotationsToRoomRenderer(plan.scene.annotations)",
] as const) {
  assert.ok(
    structureSource.includes(expected),
    `Structure layer should own ${expected}.`
  );
}

assert.match(
  structureSource,
  /return \(\s*<>[\s\S]*<PlanUnderlayRenderer2D[\s\S]*<RoomRenderer2D[\s\S]*<PlanQualityHintOverlay/,
  "The 2D structure layer should preserve underlay, room, and quality-overlay paint order."
);
assert.match(
  structureSource,
  /onClearRoomSelection=\{\s*plan\.calibration\.enabled \? undefined : actions\.rooms\.clearSelection\s*\}/,
  "Calibration mode should continue to suppress clearing the room selection."
);
assert.match(
  structureSource,
  /traceOpeningMode=\{plan\.openingTrace\.enabled && !plan\.underlay\}/,
  "Blank-grid opening tracing should remain disabled while an underlay owns tracing."
);
assert.match(
  structureSource,
  /gridBounds=\{configuration\.plan\.gridBounds\}/,
  "The 2D plan renderer should receive whole-plan grid bounds."
);
assert.match(
  adapterSource,
  /gridBounds: plan\.fitBounds/,
  "The scene adapter should source 2D grid bounds from the whole-plan fit bounds."
);
assert.match(
  adapterSource,
  /coverage: editor\.viewMode === "2d" \? "workspace" : "local"/,
  "The active Pro guidance grid should use full-workspace coverage in 2D without changing the local 3D grid."
);
assert.match(
  guidanceSource,
  /coverage=\{configuration\.grid\.coverage\}/,
  "The guidance layer should forward the selected grid coverage to the active grid renderer."
);
assert.match(
  readSource("components/scene/DesignerGrid.tsx"),
  /const WORKSPACE_GRID_FADE_DISTANCE_METERS = 200;/,
  "The visible Pro plan grid should remain present across the usable 2D canvas."
);
assert.match(
  planRendererSource,
  /const PLAN_GRID_MIN_SIZE_METERS = 80;/,
  "The Pro plan grid should cover a useful workspace beyond the plan footprint."
);
assert.match(
  planRendererSource,
  /Math\.floor\(\(gridCenterX - gridWidth \/ 2\) \/ gridStep\) \* gridStep/,
  "The expanded grid should remain aligned to the global measurement grid."
);
assert.match(
  structureSource,
  /interactive=\{\s*configuration\.editorMode !== "present" &&\s*!configuration\.isClientPreview\s*\}/,
  "Whole-home structure interaction should remain disabled in present and client-preview modes."
);
assert.match(
  structureSource,
  /state\.singleRoom\.slabThickness \?\?\s*ROOM_DIMENSION_DEFAULTS\.slabThickness/,
  "The single-room renderer should retain its default slab-thickness fallback."
);

for (const contractName of [
  "DesignSceneGuidanceLayerState",
  "DesignSceneGuidanceLayerConfiguration",
  "DesignSceneGuidanceLayerResolvers",
  "DesignSceneGuidanceLayerActions",
] as const) {
  assert.match(
    guidanceSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}

for (const expected of [
  'name="catalog-placement-support-surface-highlight"',
  'testId: "catalog-placement-support-surface-highlight"',
  'color={placement.targetValid ? "#10b981" : "#ef4444"}',
  'color={placement.targetValid ? "#059669" : "#dc2626"}',
  'color="#34d399"',
  'color="#047857"',
  "raycast={() => null}",
  "<DesignerGrid",
  "<CirculationHeatmapOverlay",
  'if (zone.source === "auto" && !showingPlacementZones) return null;',
  "!supportSurface && zones.compatibleIds.has(zone.id)",
  'helperLabel={compatible ? `Tap to place in ${label}` : undefined}',
  "actions.targetPendingPlacementToRoom(",
  "localPosition: [bounds.centerX, 0, bounds.centerZ]",
  "actions.selectZone(zone.id)",
  "actions.clearSelection()",
] as const) {
  assert.ok(
    guidanceSource.includes(expected),
    `Guidance layer should preserve ${expected}.`
  );
}

assert.match(
  guidanceSource,
  /if \(zones\.pendingPlacement\) \{[\s\S]*if \(!compatible \|\| !configuration\.activeRoomId\) \{[\s\S]*actions\.showToast\([\s\S]*is not a recommended zone for this item/,
  "Pending placement should preserve incompatible-zone feedback."
);
assert.match(
  guidanceSource,
  /return \(\s*<>[\s\S]*<DesignerGrid[\s\S]*<CirculationHeatmapOverlay[\s\S]*<ZoneOutline/,
  "Guidance should remain a fragment with grid, heatmap, and zones in order."
);

for (const contractName of [
  "DesignScenePreviewLayerState",
  "DesignScenePreviewLayerConfiguration",
  "DesignScenePreviewLayerActions",
] as const) {
  assert.match(
    previewSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}

for (const expected of [
  'name="ai-layout-preview-layer"',
  'name={`ai-layout-preview-${preview.id}`}',
  'color={state.placement.hardInvalid ? "#ef4444" : "#22c55e"}',
  'color={state.placement.hardInvalid ? "#dc2626" : "#16a34a"}',
  'testId: "catalog-placement-hover-ghost"',
  'color="#2563eb"',
  "onPointerDown={actions.onPlacementPointerDown}",
  "onPointerMove={actions.onPlacementPointerMove}",
  "onPointerUp={actions.onPlacementPointerUp}",
  "onPointerCancel={actions.onPlacementPointerUp}",
] as const) {
  assert.ok(
    previewSource.includes(expected),
    `Preview layer should preserve ${expected}.`
  );
}

assert.match(
  previewSource,
  /\{pendingPlacement \? \([\s\S]*\) : hoverPlacement \? \(/,
  "Pending placement should continue to suppress the hover ghost."
);
assert.match(
  previewSource,
  /Math\.max\(configuration\.planWidth, 1\)[\s\S]*configuration\.pendingRoomSize\?\.width[\s\S]*configuration\.activeRoomWidth/,
  "The drag plane should retain whole-plan and active-room width fallbacks."
);
assert.match(
  previewSource,
  /Math\.max\(configuration\.planDepth, 1\)[\s\S]*configuration\.pendingRoomSize\?\.depth[\s\S]*configuration\.activeRoomDepth/,
  "The drag plane should retain whole-plan and active-room depth fallbacks."
);

assert.match(
  itemsSource,
  /wallThickness=\{sceneEntry\.roomWallThickness\}[\s\S]*wallContactInset=\{getFurnitureWallInset\(\s*sceneEntry\.roomWallThickness\s*\)\}/,
  "Furniture drag snapping should use the canonical room wall inset used by placement validation."
);
assert.doesNotMatch(
  itemsSource,
  /wall(?:Thickness|ContactInset)=\{sceneProjection\.(?:wallThickness|wallContactInset)\}/,
  "Visual wall projection thickness must not leak into furniture collision or snap bounds."
);

assert.match(
  adapterSource,
  /structure:\s*\{[\s\S]*viewMode: editor\.viewMode,[\s\S]*underlay: plan\.underlay,[\s\S]*scene: plan\.editorScene,[\s\S]*enabled: room\.wholeHomeEnabled,[\s\S]*width: room\.width,/,
  "The scene adapter should map live 2D, whole-home, and single-room structure state."
);
assert.match(
  adapterSource,
  /structure:\s*\{[\s\S]*editorMode: editor\.editorMode,[\s\S]*isClientPreview: editor\.isClientPreview,[\s\S]*layers: plan\.layers,[\s\S]*renderQuality: scene\.renderQuality/,
  "The scene adapter should map editor, plan, and render structure configuration."
);
assert.match(
  sceneWorkspaceSource,
  /buildDesignPageSceneRegionAdapter\(\{[\s\S]*structure:\s*\{[\s\S]*addCalibrationPoint: planAuthoring\.boundaries\.underlay\.actions\.addCalibrationPoint[\s\S]*select: placement\.actions\.targeting\.handlePlacementAwareRoomSelect[\s\S]*select:[\s\S]*selectionInspection\.actions\.selection\.handleSelectPlanOverlay[\s\S]*addRoomPoint:[\s\S]*handleBlankGridRoomDrawPoint[\s\S]*setOpeningDragging:[\s\S]*camera\.actions\.canvas\.changePlanOpeningDragging[\s\S]*reportPlanMetrics:[\s\S]*viewportShell\.actions\.diagnostics\.handlePlanDebugMetricsChange/,
  "Scene workspace should inject grouped underlay, room, overlay, drawing, and whole-home actions into the scene adapter."
);

assert.match(
  sceneWorkspaceSource,
  /buildDesignPageSceneRegionAdapter\(\{[\s\S]*supportSurface:\s*placement\.derived\.activeCatalogPlacementSurfaceHighlight[\s\S]*compatibleZoneIds:\s*placement\.derived\.activePlacementCompatibleZoneIds/,
  "Scene workspace should inject live placement and zone guidance state into the scene adapter."
);
assert.match(
  sceneWorkspaceSource,
  /buildDesignPageSceneRegionAdapter\(\{[\s\S]*pendingScene:\s*placement\.derived\.pendingCatalogPlacementScene[\s\S]*hoverScene:\s*placement\.derived\.hoverCatalogPlacementScene[\s\S]*hardInvalid:\s*placement\.derived\.pendingCatalogPlacementHardInvalid/,
  "Scene workspace should inject pending, hover, and hard-invalid preview state into the scene adapter."
);

assert.match(
  regionSource,
  /useState\(false\)[\s\S]*data-testid="active-room-focus-toolbar"[\s\S]*data-testid="active-room-focus-toggle"[\s\S]*Show home[\s\S]*Focus room/,
  "Whole-home 3D editing should expose a reversible active-room focus control that starts with the entire home visible."
);
assert.match(
  regionSource,
  /const renderFocusRoomId = state\.canvas\.showSceneLoadingVeil[\s\S]*focusRoomId=\{renderFocusRoomId\}[\s\S]*<SceneItemsLayer[\s\S]*focusRoomId=\{renderFocusRoomId\}/,
  "Active-room focus should wait until the full scene has mounted and reported readiness."
);
assert.match(
  structureSource,
  /const visibleRooms = focusRoomId[\s\S]*state\.wholeHome\.rooms\.filter\(\(room\) => room\.id === focusRoomId\)[\s\S]*const topologyOpenings = mapPlanOpeningsToRoomRenderer\([\s\S]*state\.plan\.scene\.openings[\s\S]*rooms=\{visibleRooms\}[\s\S]*topologyRooms=\{state\.wholeHome\.rooms\}[\s\S]*openings=\{topologyOpenings\}[\s\S]*focusRoomId=\{focusRoomId\}/,
  "Focused 3D structure rendering should hide inactive rooms while retaining the complete room and opening graph for shared-wall topology."
);
assert.match(
  itemsSource,
  /const visibleEntries = focusRoomId[\s\S]*entry\.roomId === focusRoomId[\s\S]*visibleEntries\.map/,
  "Focused 3D furniture rendering should omit inactive-room items."
);
assert.match(
  canonicalStructureSource,
  /focusRoomId[\s\S]*wall\.adjacentRoomIds\.includes\(focusRoomId\)[\s\S]*floor=\{visibleFloor\}/,
  "Canonical 3D focus should retain only walls adjacent to the focused room."
);
assert.match(
  cameraNavigationSource,
  /handleFitSelectedPlanRoom[\s\S]*if \(viewMode === "3d"\)[\s\S]*applyQueued3DView\([\s\S]*room\.name\} focused/,
  "Focused rooms should receive a dedicated 3D camera fit."
);
assert.match(
  [canvasSource, lightingSystemSource, sunControllerSource].join("\n"),
  /receiveShadow=\{shadowsEnabled\}[\s\S]*const effectiveShadowsEnabled =[\s\S]*viewMode === "3d" && lighting\.shadows\.enabled[\s\S]*data-shadow-maps-enabled=[\s\S]*shadows=\{effectiveShadowsEnabled \? QUALITY_SHADOW_FILTER : false\}[\s\S]*<LightingSystem[\s\S]*<SunController[\s\S]*castShadow=\{lighting\.sun\.castShadow && lighting\.shadows\.enabled\}/,
  "Quality-mode 3D should provide user-controlled shadow maps, a matching key light, and a shadow-receiving workspace plane."
);
assert.match(
  canvasSource,
  /WORKSPACE_GRID_CELL_SIZE_METERS = 0\.2[\s\S]*WORKSPACE_GRID_SECTION_SIZE_METERS = 1[\s\S]*color="#f3f5f5"[\s\S]*<Grid[\s\S]*cellSize=\{WORKSPACE_GRID_CELL_SIZE_METERS\}[\s\S]*cellThickness=\{0\.45\}[\s\S]*cellColor="#ffffff"[\s\S]*sectionSize=\{WORKSPACE_GRID_SECTION_SIZE_METERS\}[\s\S]*sectionThickness=\{0\.8\}[\s\S]*sectionColor="#ffffff"[\s\S]*material-toneMapped=\{false\}[\s\S]*raycast=\{\(\) => null\}[\s\S]*data-workspace-grid=\{viewMode === "3d" \? "visible" : "hidden"\}[\s\S]*data-workspace-grid-mode="camera-aware-floor-and-ceiling"/,
  "3D should provide a soft light-on-light planning grid with five 200 mm subdivisions inside every one-metre section."
);
assert.match(
  canvasSource,
  /WORKSPACE_GRID_MIN_SIZE_METERS = 160[\s\S]*<meshBasicMaterial[\s\S]*color="#f3f5f5"[\s\S]*toneMapped=\{false\}[\s\S]*<shadowMaterial[\s\S]*opacity=\{shadowsEnabled \? 0\.08 : 0\}[\s\S]*<Grid[\s\S]*args=\{\[size, size\]\}[\s\S]*fadeDistance=\{WORKSPACE_GRID_FADE_DISTANCE_METERS\}[\s\S]*workspaceGridSize/,
  "The 3D grid should cover a full light workspace, retain soft grounding shadows, and fade before its boundary."
);
assert.match(
  canvasSource,
  /WORKSPACE_GRID_CAMERA_SWITCH_Y_METERS = -0\.05[\s\S]*useFrame\(\(\{ camera \}\) => \{[\s\S]*camera\.position\.y < WORKSPACE_GRID_CAMERA_SWITCH_Y_METERS[\s\S]*floorGridRef\.current\.visible = !showCeilingGrid[\s\S]*ceilingGridRef\.current\.visible = showCeilingGrid[\s\S]*name="workspace-floor-grid"[\s\S]*name="workspace-ceiling-grid"[\s\S]*visible=\{false\}/,
  "Bottom-up 3D views should replace the floor grid with a separate overhead grid instead of showing the floor grid from below."
);
assert.match(
  canvasSource,
  /WORKSPACE_GRID_CEILING_CLEARANCE_METERS = 0\.15[\s\S]*workspaceGridCeilingY =[\s\S]*planBounds\.roomHeight \+ WORKSPACE_GRID_CEILING_CLEARANCE_METERS[\s\S]*ceilingY=\{workspaceGridCeilingY\}/,
  "The bottom-up workspace grid should sit just above the plan wall height so it reads as an overhead reference plane."
);
assert.match(
  [canvasSource, sunControllerSource].join("\n"),
  /shadowCameraHalfSpan[\s\S]*presentationBounds\.widthMeters[\s\S]*presentationBounds\.depthMeters[\s\S]*shadow-mapSize-width=\{lighting\.shadows\.mapSize\}[\s\S]*shadow-camera-left=\{-shadowCameraHalfSpan\}[\s\S]*shadow-camera-right=\{shadowCameraHalfSpan\}/,
  "Quality-mode 3D shadows should use a high-resolution map fitted to the visible plan instead of a low-resolution fixed frustum."
);
assert.match(
  [canvasSource, sunControllerSource].join("\n"),
  /QUALITY_SHADOW_FILTER = "percentage"[\s\S]*data-shadow-filter=\{QUALITY_SHADOW_FILTER\}[\s\S]*shadow-radius=\{lighting\.shadows\.radius\}[\s\S]*shadow-intensity=\{0\.52\}/,
  "Quality-mode 3D should select the supported percentage-filtered shader and keep furniture shadows softly blended."
);
assert.match(
  selectionOutlineSource,
  /SELECTION_BOX_SIDE_PADDING_METERS = 0\.035[\s\S]*SELECTION_BOX_TOP_PADDING_METERS = 0\.035[\s\S]*SELECTION_BOX_BOTTOM_INSET_METERS = 0\.012[\s\S]*const centerX = localRenderBounds\.center\[0\][\s\S]*selectionBoxBounds = useMemo[\s\S]*position=\{selectionBoxBounds\.position\}[\s\S]*testId: "selected-furniture-outline"[\s\S]*boxGeometry args=\{selectionBoxBounds\.size\}[\s\S]*color="#79a9e8"[\s\S]*lineWidth=\{1\.75\}[\s\S]*renderOrder=\{25\}[\s\S]*depthTest=\{false\}[\s\S]*depthWrite=\{false\}/,
  "Selected 3D furniture should use a memoized, always-visible full box derived from primitive model-local bounds."
);
assert.match(
  localRenderBoundsSource,
  /GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS = 1e-6[\s\S]*copyGLBLocalRenderBounds[\s\S]*isValidGLBLocalRenderBounds[\s\S]*bounds\.size\.some\(\(value\) => value > 0\)[\s\S]*areGLBLocalRenderBoundsEquivalent[\s\S]*observeGLBLocalRenderBounds[\s\S]*copyGLBLocalRenderBounds\(nextBounds\)/,
  "GLB local bounds should remain valid primitive semantic values with a copied comparison baseline."
);
assert.match(
  measureGLBLocalRenderBoundsSource,
  /export function measureGLBLocalRenderBounds[\s\S]*normalizedModel\.clone\(true\)[\s\S]*updateWorldMatrix\(true, true\)[\s\S]*new THREE\.Box3\(\)\.setFromObject\(detachedModel, true\)[\s\S]*glb-empty-bounds[\s\S]*isValidGLBLocalRenderBounds\(localRenderBounds\)[\s\S]*glb-bounds-failed/,
  "The canonical owner should measure normalized scene-item-local bounds and reject empty or invalid results."
);
assert.match(
  glbModelResourcesSource,
  /measureGLBLocalRenderBounds\(scene\)[\s\S]*localRenderBounds: bounds\.bounds/,
  "Prepared resources should retain the canonical measured local-bounds value."
);
assert.match(
  glbLoadedResourceSource,
  /const model = clonePreparedModel\(prepared\.scene\)[\s\S]*localRenderBounds: copyGLBLocalRenderBounds\(prepared\.localRenderBounds\)/,
  "Each prepared mount should publish an isolated primitive local-bounds value."
);
assert.match(
  glbModelResourceResolutionSource,
  /export function boundsForResource[\s\S]*resource\?\.kind === "prepared"[\s\S]*resource\.localRenderBounds[\s\S]*measureGLBLocalRenderBounds\(model\)/,
  "Prepared cache hits and fresh normalized models should resolve through the same local-bounds contract."
);
assert.match(
  glbModelLifecycleSource,
  /const boundsResult = useMemo\([\s\S]*boundsForResource\(resource, modelResult\.model\)[\s\S]*bounds: boundsResult\.bounds/,
  "The GLB lifecycle should expose canonical local bounds to the renderer."
);
assert.match(
  scaledModelSource,
  /onLocalBoundsChange\?: \(bounds: GLBLocalRenderBounds\)[\s\S]*localBoundsTrackerRef[\s\S]*const observation = observeGLBLocalRenderBounds[\s\S]*observation\.outcome !== "changed"[\s\S]*onLocalBoundsChangeRef\.current\?\.\(observation\.bounds\)/,
  "The GLB renderer should semantically track and publish only material local-bounds changes."
);
assert.doesNotMatch(
  furnitureSource,
  /modelLocalRenderBounds|setModelLocalRenderBounds|onLocalBoundsChange=/,
  "Furniture should not mirror model-derived bounds into React state."
);
assert.match(
  furnitureSource,
  /setReportedModelLoad\(\(current\) =>[\s\S]*current\.url === runtimeModelUrl && current\.state === nextState[\s\S]*diagnosticKey=\{instanceId\}[\s\S]*showSelectionOutline=\{Boolean\(/,
  "Furniture model-load synchronization should remain idempotent and delegate precise selection to the GLB renderer."
);
assert.match(
  scaledModelSource,
  /const selectionOutlineVisible = Boolean\([\s\S]*showSelectionOutline && bounds && model && materialsReady[\s\S]*<FurnitureSelectionOutline localRenderBounds=\{bounds\}/,
  "The GLB renderer should own its precise selection outline from canonical local bounds."
);
assert.match(
  modelLifecycleTypesSource,
  /boundsMaterialChangeCount: number[\s\S]*boundsPublicationCount: number[\s\S]*excessiveBoundsWarningCount: number[\s\S]*selectionOutlineVisible: boolean/,
  "Development diagnostic snapshots should expose bounds churn, publications, warnings, and selection-outline visibility."
);
assert.match(
  modelDiagnosticsSource,
  /GLB_MATERIAL_BOUNDS_CHANGE_WARNING_THRESHOLD = 6[\s\S]*recordGLBBoundsObservation[\s\S]*boundsMaterialChangeCount \+= 1[\s\S]*boundsPublicationCount \+= 1[\s\S]*recordGLBSelectionOutlineVisibility[\s\S]*selectionOutlineVisible = visible[\s\S]*recordGLBExcessiveBoundsWarning[\s\S]*excessiveBoundsWarningCount \+= 1/,
  "Development diagnostics should record each local-bounds observation and outline visibility transition."
);
assert.match(
  [scaledModelSource, normalizeGLBSceneSource].join("\n"),
  /castShadow\?: boolean[\s\S]*castShadow = true[\s\S]*castShadow,[\s\S]*mesh\.castShadow = castShadow;[\s\S]*mesh\.receiveShadow = false;/,
  "Loaded GLB furniture should consume the central cast-shadow decision without receiving topology-shaped self-shadow artifacts."
);
assert.match(
  furnitureSource,
  /resolveObjectShadowEligibility\([\s\S]*castShadow=\{shadowPolicy\.castShadow\}[\s\S]*receiveShadow=\{shadowPolicy\.receiveShadow\}/,
  "GLB and fallback furniture should consume the same object-shadow policy."
);
assert.match(
  shadowBudgetManagerSource,
  /quality === "low" \|\| transparent[\s\S]*NON_SHADOW_CATEGORY_PATTERN[\s\S]*castShadow: true[\s\S]*receiveShadow: false/,
  "The central policy should skip low-tier and transparent/decorative shadows while retaining cast-only furniture shadows."
);

console.log("Design-page scene layer ownership checks passed.");
