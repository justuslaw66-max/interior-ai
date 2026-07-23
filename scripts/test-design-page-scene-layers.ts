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
const adapterSource = readSource("lib/design-page-scene-region-adapter.ts");
const sceneWorkspaceSource = readSource(
  "lib/useDesignPageSceneRegionWorkspaceRegistration.ts"
);
const structureSource = readSource(
  "components/editor/design-page/DesignSceneStructureLayer.tsx"
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

console.log("Design-page scene layer ownership checks passed.");
