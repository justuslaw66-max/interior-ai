import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const normalizeWhitespace = (source: string) => source.replace(/\s+/g, " ");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const overlaySource = readSource(
  "components/editor/design-page/DesignPageViewportOverlayLayer.tsx"
);
const normalizedWorkspace = normalizeWhitespace(workspaceSource);
const normalizedOverlay = normalizeWhitespace(overlaySource);

assert.match(
  workspaceSource,
  /import\s+\{\s*DesignPageViewportOverlayLayer\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPageViewportOverlayLayer"/,
  "Workspace should import the viewport-overlay composition boundary."
);
assert.match(
  workspaceSource,
  /<DesignPageViewportOverlayLayer\s+[\s\S]*?state=\{\{[\s\S]*?configuration=\{\{[\s\S]*?references=\{\{[\s\S]*?actions=\{\{/,
  "Workspace should compose the viewport layer through grouped state, configuration, references, and actions."
);

for (const contractName of [
  "DesignPageViewportOverlayLayerState",
  "DesignPageViewportOverlayLayerConfiguration",
  "DesignPageViewportOverlayLayerReferences",
  "DesignPageViewportOverlayLayerActions",
] as const) {
  assert.match(
    overlaySource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit exported contract.`
  );
}

// Workspace owns live policy and action selection; the layer only composes it.
for (const expected of [
  "railVisible: floatingPlanOverlayStackVisible",
  "sceneLoadingVisible: showSceneLoadingVeil",
  "!isClientPreview && visiblePlanOpening && selectedPlanOverlayId",
  "floatingSelectionInspectorVisible && selectedObjectInspector",
  "planQuality: plan2DQualityReviewPanelVisible",
  "planCanvas: planCanvasOverlaysState",
  "pendingAiLayoutProposal && !isClientPreview",
  'crossRoomDragTarget?.kind === "item"',
  'viewMode === "3d" && hasWholeHousePlan',
  "floorProperties: floatingFloorPropertiesPanelVisible",
  "selectionControls: resolveDesignPageViewportSelectionControlsState({",
  "planQuality: { setPanel: setPlanQualityReviewPanelNode }",
  "deleteOpening: () => { deletePlanOverlayById(selectedPlanOverlayId); showRuleToast(\"Opening deleted\"); }",
  "planCanvas: { guidedActionsChoice:",
  "navigator: { onMoveCamera: handleWholeHomeMoveCamera",
  'onAddUpperFloor: (mode) => handleAddFloor("upper", mode)',
  "selectionControls: { floorStack: { switchFloor: handleSwitchFloor }",
] as const) {
  assert.ok(
    normalizedWorkspace.includes(expected),
    `Workspace should preserve the live viewport boundary: ${expected}.`
  );
}

const leafComponents = [
  {
    name: "SceneReadyVeil",
    importPath: "@/components/editor/design-page/SceneReadyVeil",
  },
  {
    name: "SelectedPlanOpeningActions",
    importPath:
      "@/components/editor/design-page/SelectedPlanOpeningActions",
  },
  {
    name: "DesignPageSelectionInspector",
    importPath:
      "@/components/editor/design-page/DesignPageSelectionInspector",
  },
  {
    name: "PlanQualityReviewPanel",
    importPath:
      "@/components/editor/design-page/PlanQualityReviewPanel",
  },
  {
    name: "DesignPagePlanCanvasOverlays",
    importPath:
      "@/components/editor/design-page/DesignPagePlanCanvasOverlays",
  },
  {
    name: "AiLayoutPreviewBanner",
    importPath:
      "@/components/editor/design-page/AiLayoutPreviewBanner",
  },
  {
    name: "CrossRoomDragTarget",
    importPath:
      "@/components/editor/design-page/CrossRoomDragTarget",
  },
  {
    name: "RoomPanNavigator",
    importPath: "@/components/editor/RoomPanNavigator",
  },
  {
    name: "FloorPropertiesPanel",
    importPath: "@/components/editor/FloorPropertiesPanel",
  },
  {
    name: "DesignPageViewportSelectionControls",
    importPath:
      "@/components/editor/design-page/DesignPageViewportSelectionControls",
  },
] as const;

for (const { name, importPath } of leafComponents) {
  assert.ok(
    overlaySource.includes(`from "${importPath}"`),
    `The viewport layer should own the ${name} import.`
  );
  assert.ok(
    overlaySource.includes(`<${name}`),
    `The viewport layer should render ${name}.`
  );
  assert.ok(
    !workspaceSource.includes(`from "${importPath}"`),
    `Workspace should not import ${name} directly.`
  );
  assert.ok(
    !workspaceSource.includes(`<${name}`),
    `Workspace should not render ${name} directly.`
  );
}

const childOrder = [
  'data-testid="plan-right-rail"',
  "<SceneReadyVeil",
  "<SelectedPlanOpeningActions",
  "<DesignPageSelectionInspector",
  "<PlanQualityReviewPanel",
  "<DesignPagePlanCanvasOverlays",
  "<AiLayoutPreviewBanner",
  "<CrossRoomDragTarget",
  "<RoomPanNavigator",
  "<FloorPropertiesPanel",
  "<DesignPageViewportSelectionControls",
] as const;
let previousChildIndex = -1;
for (const marker of childOrder) {
  const markerIndex = overlaySource.indexOf(marker, previousChildIndex + 1);
  assert.ok(
    markerIndex > previousChildIndex,
    `${marker} should preserve viewport overlay paint order.`
  );
  previousChildIndex = markerIndex;
}
assert.match(
  overlaySource,
  /return \(\s*<>[\s\S]*data-testid="plan-right-rail"[\s\S]*<DesignPageViewportSelectionControls[\s\S]*<\/>\s*\);/,
  "The viewport overlay composition should remain wrapper-free."
);

const railSlotOrder = [
  "ref={setNavigatorRailElement}",
  "ref={setFloorRailElement}",
  "ref={setReviewRailElement}",
  "ref={setSelectionRailElement}",
] as const;
let previousRailSlotIndex = -1;
for (const marker of railSlotOrder) {
  const markerIndex = overlaySource.indexOf(marker);
  assert.ok(
    markerIndex > previousRailSlotIndex,
    `${marker} should preserve navigator -> floor -> review -> selection rail order.`
  );
  previousRailSlotIndex = markerIndex;
}

for (const gate of [
  "{state.railVisible ? ( <aside",
  "{state.navigator ? ( <div ref={setNavigatorRailElement}",
  "{state.floorProperties ? ( <div ref={setFloorRailElement}",
  "{state.planQuality ? ( <div ref={setReviewRailElement}",
  "{state.selectionInspector ? ( <div ref={setSelectionRailElement}",
  "{state.sceneLoadingVisible ? ( <SceneReadyVeil",
  "{state.selectedOpening ? ( <SelectedPlanOpeningActions",
  "{state.selectionInspector ? ( <DesignPageSelectionInspector",
  "{state.planQuality ? ( <PlanQualityReviewPanel",
  "{state.aiLayoutPreview ? ( <AiLayoutPreviewBanner",
  "{state.crossRoomDragTarget ? ( <CrossRoomDragTarget",
  "{state.railVisible && state.navigator && navigatorRailElement ? createPortal(",
  "{state.floorProperties && floorRailElement ? createPortal(",
] as const) {
  assert.ok(
    normalizedOverlay.includes(gate),
    `The viewport layer should preserve the exact child gate: ${gate}.`
  );
}

for (const stateOwner of [
  "navigatorRailElement, setNavigatorRailElement",
  "floorRailElement, setFloorRailElement",
  "reviewRailElement, setReviewRailElement",
  "selectionRailElement, setSelectionRailElement",
] as const) {
  assert.ok(
    normalizedOverlay.includes(
      `const [${stateOwner}] = useState<HTMLDivElement | null>(null);`
    ),
    `The viewport layer should own its ${stateOwner.split(",")[0]} portal target.`
  );
}

for (const portalWiring of [
  "...configuration.selectionInspector, portalTarget: selectionRailElement",
  "...configuration.planQuality, portalTarget: reviewRailElement",
  "references={references.planQuality}",
  "<RoomPanNavigator {...state.navigator} {...configuration.navigator} {...actions.navigator} />",
  "/>, navigatorRailElement )",
  "<FloorPropertiesPanel {...state.floorProperties} {...configuration.floorProperties} {...actions.floorProperties} />",
  "/>, floorRailElement )",
] as const) {
  assert.ok(
    normalizedOverlay.includes(portalWiring),
    `The viewport layer should preserve portal ownership: ${portalWiring}.`
  );
}

assert.ok(
  normalizedOverlay.includes(
    "<DesignPagePlanCanvasOverlays state={state.planCanvas} actions={actions.planCanvas} />"
  ),
  "Plan-canvas overlays should remain an unconditional child of the viewport layer."
);
assert.ok(
  normalizedOverlay.includes(
    "<DesignPageViewportSelectionControls state={state.selectionControls} configuration={configuration.selectionControls} actions={actions.selectionControls} />"
  ),
  "Selection controls should remain an unconditional child driven by resolved nullable state."
);

console.log("Design-page viewport overlay-layer ownership checks passed.");
