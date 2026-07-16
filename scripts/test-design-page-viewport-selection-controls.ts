import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDesignPageViewportSelectionControlsState } from "@/lib/design-page-viewport-selection-controls";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const normalizeWhitespace = (source: string) => source.replace(/\s+/g, " ");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const viewportOverlaySource = readSource(
  "components/editor/design-page/DesignPageViewportOverlayLayer.tsx"
);
const controlsSource = readSource(
  "components/editor/design-page/DesignPageViewportSelectionControls.tsx"
);
const modelSource = readSource(
  "lib/design-page-viewport-selection-controls.ts"
);
const normalizedWorkspace = normalizeWhitespace(workspaceSource);
const normalizedViewportOverlay = normalizeWhitespace(viewportOverlaySource);
const normalizedModel = normalizeWhitespace(modelSource);

assert.match(
  workspaceSource,
  /import\s+\{\s*DesignPageViewportOverlayLayer\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPageViewportOverlayLayer"/,
  "Workspace should import the viewport-overlay boundary."
);
assert.match(
  workspaceSource,
  /<DesignPageViewportOverlayLayer[\s\S]*?selectionControls:\s*resolveDesignPageViewportSelectionControlsState\(\{/,
  "Workspace should resolve selection-control policy at the viewport boundary."
);
for (const expectedBoundary of [
  "selectionControls: { dark: showDesignerTheme }",
  "selectionControls: { floorStack: { switchFloor: handleSwitchFloor }",
] as const) {
  assert.ok(
    normalizedWorkspace.includes(expectedBoundary),
    `Workspace should preserve the selection-control boundary: ${expectedBoundary}.`
  );
}
assert.match(
  viewportOverlaySource,
  /import\s+\{\s*DesignPageViewportSelectionControls\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPageViewportSelectionControls"/,
  "The viewport layer should own the selection-control import."
);
assert.ok(
  normalizedViewportOverlay.includes(
    "<DesignPageViewportSelectionControls state={state.selectionControls} configuration={configuration.selectionControls} actions={actions.selectionControls} />"
  ),
  "The viewport layer should render grouped selection controls without reinterpreting live policy."
);

for (const componentName of [
  "FloorStackControl",
  "MultiSelectionToolbar",
  "SelectedZoneToolbar",
] as const) {
  assert.ok(
    !workspaceSource.includes(`<${componentName}`),
    `Workspace should no longer render ${componentName} directly.`
  );
  assert.ok(
    !workspaceSource.includes(`/design-page/${componentName}"`),
    `Workspace should no longer import ${componentName} directly.`
  );
}

assert.ok(
  normalizedModel.includes(
    'floorStack: viewMode === "3d" && stackedFloorView && floorOptions.length > 1 && !isClientPreview ? {'
  ),
  "Floor-stack controls should keep their exact 3D, stack, count, and preview gate."
);
assert.ok(
  normalizedModel.includes(
    "multiSelection: selectedCount > 1 && !isClientPreview ? {"
  ),
  "Multi-selection controls should remain limited to multiple selections outside preview."
);
assert.ok(
  normalizedModel.includes(
    "selectedZone: selectedZone && !isClientPreview ? {"
  ),
  "Selected-zone controls should remain limited to an active zone outside preview."
);

for (const expected of [
  "viewMode",
  "stackedFloorView",
  "floorOptions",
  "activeFloorLevel",
  "hiddenFloorLevels",
  "selectedCount: selectedIds.size",
  "pendingZoneType",
  "selectedZone",
  "isClientPreview",
  "floorStack: { switchFloor: handleSwitchFloor }",
  "alignX: alignSelectionX",
  "alignZ: alignSelectionZ",
  "changeZoneType: setPendingZoneType",
  "createZone: createZoneFromSelection",
  "clear: clearAllSelection",
  "autoLayout: autoLayoutZone",
  "rotateQuarterTurn: (zoneId) => rotateZone(zoneId, Math.PI / 2)",
  "ungroup: ungroupZone",
] as const) {
  assert.ok(
    normalizedWorkspace.includes(expected),
    `Workspace should preserve ${expected}.`
  );
}

for (const expected of [
  "active: option.level === activeFloorLevel",
  "hidden: hiddenFloorLevels.includes(option.level)",
  "accentColor: getFloorAccentColor(option.level)",
  "count: selectedCount",
  "label: getZoneLabel(selectedZone.type)",
] as const) {
  assert.ok(
    normalizedModel.includes(expected),
    `The pure state resolver should preserve ${expected}.`
  );
}

assert.match(
  modelSource,
  /export type DesignPageViewportSelectionControlsInput =/,
  "The pure state resolver should expose a typed input contract."
);
assert.match(
  modelSource,
  /export function resolveDesignPageViewportSelectionControlsState\(/,
  "Viewport visibility and display models should be owned by a pure resolver."
);

for (const contractName of [
  "DesignPageViewportSelectionControlsState",
  "DesignPageViewportSelectionControlsConfiguration",
  "DesignPageViewportSelectionControlsActions",
] as const) {
  assert.match(
    controlsSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}

const floorIndex = controlsSource.indexOf("<FloorStackControl");
const multiSelectionIndex = controlsSource.indexOf(
  "<MultiSelectionToolbar",
  floorIndex
);
const selectedZoneIndex = controlsSource.indexOf(
  "<SelectedZoneToolbar",
  multiSelectionIndex
);

assert.ok(floorIndex >= 0, "The composition should own FloorStackControl.");
assert.ok(
  floorIndex < multiSelectionIndex && multiSelectionIndex < selectedZoneIndex,
  "Control paint order should remain floor stack -> multi-selection -> selected zone."
);
assert.match(
  controlsSource,
  /return \(\s*<>[\s\S]*<FloorStackControl[\s\S]*<MultiSelectionToolbar[\s\S]*<SelectedZoneToolbar[\s\S]*<\/\>\s*\);/,
  "The controls composition should remain wrapper-free."
);

for (const expected of [
  "state={state.floorStack}",
  "actions={actions.floorStack}",
  "state={state.multiSelection}",
  "actions={actions.multiSelection}",
  "state={{ label: selectedZone.label }}",
  "actions.selectedZone.autoLayout(selectedZone.id)",
  "actions.selectedZone.rotateQuarterTurn(selectedZone.id)",
  "actions.selectedZone.ungroup(selectedZone.id)",
] as const) {
  assert.ok(
    controlsSource.includes(expected),
    `The controls composition should preserve ${expected}.`
  );
}

const visibleState = resolveDesignPageViewportSelectionControlsState({
  viewMode: "3d",
  stackedFloorView: true,
  floorOptions: [
    { level: 1, label: "1F", roomCount: 1 },
    { level: 2, label: "2F", roomCount: 2 },
  ],
  activeFloorLevel: 2,
  hiddenFloorLevels: [1],
  selectedCount: 2,
  pendingZoneType: "reading",
  selectedZone: { id: "zone-reading", type: "reading" },
  isClientPreview: false,
});

assert.deepEqual(
  visibleState,
  {
    floorStack: {
      floors: [
        {
          level: 1,
          label: "1F",
          active: false,
          hidden: true,
          accentColor: "#059669",
        },
        {
          level: 2,
          label: "2F",
          active: true,
          hidden: false,
          accentColor: "#d97706",
        },
      ],
    },
    multiSelection: { count: 2, zoneType: "reading" },
    selectedZone: { id: "zone-reading", label: "Reading nook" },
  },
  "The pure resolver should preserve every visible control model independently."
);

const previewState = resolveDesignPageViewportSelectionControlsState({
  viewMode: "3d",
  stackedFloorView: true,
  floorOptions: [
    { level: 1, label: "1F", roomCount: 1 },
    { level: 2, label: "2F", roomCount: 1 },
  ],
  activeFloorLevel: 1,
  hiddenFloorLevels: [],
  selectedCount: 2,
  pendingZoneType: "seating",
  selectedZone: { id: "zone-seating", type: "seating" },
  isClientPreview: true,
});

assert.deepEqual(
  previewState,
  { floorStack: null, multiSelection: null, selectedZone: null },
  "Client preview should continue to suppress all three viewport controls."
);

console.log("Design-page viewport selection-control ownership checks passed.");
