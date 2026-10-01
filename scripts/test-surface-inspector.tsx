import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RoomSurfaceRows, roomSurfaceRowsOf } from "../components/editor/design-controls-plan/RoomSurfaceRows";
import { SurfaceBrowserHeader, type SurfaceBrowserHeaderProps } from "../components/editor/design-controls-plan/SurfaceBrowserHeader";
import {
  SelectedSurfaceInspector,
  type SelectedSurfaceInspectorActions,
  type SelectedSurfaceInspectorState,
} from "../components/editor/design-page/SelectedSurfaceInspector";

// UX phase 4f (audit ED5): the surface inspector is a heading ("Floor", "North wall", "Ceiling"),
// the finish, Change… and Reset, the sizes, where to apply it, and "Adjust pattern" holding the
// rest: closed for consumers, open for Pro. The publish status is Pro's.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const actions = new Proxy({}, { get: () => () => {} }) as SelectedSurfaceInspectorActions;

const grout = {
  groutSizes: [2, 5].map((valueMm) => ({ valueMm, selected: valueMm === 2, testId: valueMm === 2 ? "surface-joint-size" : `surface-joint-size-${valueMm}` })),
  groutColor: "#cccccc",
  groutPaletteOpen: false,
  groutColors: [],
  disabled: false,
};
const floor: SelectedSurfaceInspectorState = {
  target: "floor",
  wallPanelId: null,
  floorMaterialId: "oak",
  materialId: "oak",
  wallHeight: null,
  header: { label: "Floor", displayName: "Natural oak", metadata: "Castlery · Wood · Size 120 × 20 cm", swatchStyle: {}, publishStatus: "Published", draft: false },
  sizeOptions: [{ materialId: "oak-120", label: "120 × 20 cm", title: "120 × 20 cm", selected: true, disabled: false }],
  controls: { changeDisabled: false, rotateDisabled: false, resetDisabled: false, applyAllDisabled: false },
  picker: null,
  wallGrout: null,
  floorPattern: {
    ...grout,
    value: "straight",
    options: [{ id: "straight", label: "Straight", selected: true }],
    rotations: [0, 90].map((value) => ({ value, selected: value === 0 })),
    scale: 1,
    offset: { x: 0, y: 0 },
  },
  footer: "Rotation 0° · Room area 12 m²",
  blockers: null,
};
const render = (state: SelectedSurfaceInspectorState, pro: boolean) =>
  renderToStaticMarkup(createElement(SelectedSurfaceInspector, { state, configuration: { dark: false, pro }, actions }));

const consumerFloor = render(floor, false);
assert.match(consumerFloor, /<h3 data-testid="surface-inspector-heading"[^>]*>Floor<\/h3>/);
assert.doesNotMatch(consumerFloor, /surface-inspector-publish-status|Published/, "Consumers don't see the publish status.");
assert.match(consumerFloor, /data-testid="plan-change-floor-finish"[^>]*>Change material…<\/button>/);
assert.match(consumerFloor, /data-testid="selection-inspector-floor-reset"[^>]*>Reset<\/button>/);
assert.match(consumerFloor, /data-testid="surface-size-option-oak-120"[^>]*aria-pressed="true"/);
assert.match(consumerFloor, /data-testid="selection-inspector-floor-apply-all"[^>]*>Apply to all floors<\/button>/);
assert.match(consumerFloor, /<details data-testid="surface-adjust-pattern" class="[^"]*"><summary[^>]*>Adjust pattern<\/summary>/, "Closed for consumers.");
const adjust = consumerFloor.slice(consumerFloor.indexOf('data-testid="surface-adjust-pattern"'));
for (const id of ["selection-inspector-floor-rotate", "surface-pattern-options", "surface-rotation-90", "surface-pattern-scale", "surface-joint-size-5", "surface-offset-controls"]) {
  assert.match(adjust, new RegExp(`data-testid="${id}"`), `${id} is in Adjust pattern.`);
}
assert.ok(consumerFloor.indexOf("Rotate 90°") > consumerFloor.indexOf("Adjust pattern"), "Rotate 90° moved into Adjust pattern.");

const proFloor = render(floor, true);
assert.match(proFloor, /<details data-testid="surface-adjust-pattern" open="" /, "Open for Pro.");
assert.match(proFloor, /data-testid="surface-inspector-publish-status"[^>]*>Published<\/span>/);

const wall = render(
  { ...floor, target: "wall", wallPanelId: "north-1", header: { ...floor.header, label: "North wall" }, floorPattern: null, wallGrout: { ...grout, groutSizes: grout.groutSizes.map((size) => ({ ...size, testId: size.testId.replace("surface", "wall-surface") })) } },
  false
);
assert.match(wall, />North wall<\/h3>/);
assert.match(wall, /data-testid="selection-inspector-wall-apply-room"[^>]*>Apply to room<\/button>/);
assert.match(wall, /data-testid="selection-inspector-wall-apply-all"[^>]*>Apply to all walls<\/button>/);
assert.match(wall.slice(wall.indexOf("Adjust pattern")), /data-testid="selection-inspector-wall-grout"[\s\S]*data-testid="wall-surface-joint-size-5"/);

const ceiling = render({ ...floor, target: "ceiling", header: { ...floor.header, label: "Ceiling" }, sizeOptions: [], floorPattern: null }, false);
assert.match(ceiling, /data-testid="plan-change-ceiling-finish"[^>]*>Change paint…<\/button>/);
assert.match(ceiling, /data-testid="selection-inspector-ceiling-reset"/);
assert.match(ceiling, /data-testid="selection-inspector-ceiling-apply-all"[^>]*>Apply to all ceilings<\/button>/);
assert.doesNotMatch(ceiling, /Adjust pattern/, "A painted ceiling has no pattern.");

const picked = render({ ...floor, picker: { title: "Floor materials", options: [], emptyMessage: "No other materials." } }, false);
assert.match(picked, /data-testid="selection-inspector-floor-picker"[\s\S]*Floor materials[\s\S]*selection-inspector-floor-picker-close[\s\S]*No other materials\./);

// The inspector hands Pro to the surface inspector; the extracted parts carry the controls.
assert.match(read("components/editor/design-page/DesignPageSelectionInspector.tsx"), /configuration=\{\{ dark: configuration\.dark, pro: configuration\.proMode \}\}/);
assert.match(read("lib/useDesignPageSurfaceInspector.ts"), /const headerLabel = surfaceInspectorIsWall\s+\? getWallFaceLabel\(wallInspectorFaceId\)\s+: surfaceInspectorIsCeiling\s+\? "Ceiling"\s+: "Floor";/);
for (const file of ["SelectedSurfaceInspector", "SurfacePatternControls", "SurfaceMaterialPicker"]) {
  const lines = read(`components/editor/design-page/${file}.tsx`).split("\n").length;
  assert.ok(lines <= 300, `${file}.tsx stays small (${lines} lines).`);
}

// UX phase 4f (audit ED8): a room's Floor, Walls and Ceiling rows open the picker for that surface.
const summary = (target: "floor" | "walls" | "selected_wall" | "ceiling", materialName: string, roomId = "living") => ({ target, materialName, room: { id: roomId } });
assert.deepEqual(
  roomSurfaceRowsOf([summary("floor", "Natural oak"), summary("walls", "Spanish Red"), summary("ceiling", "Cloud White"), summary("floor", "Tile", "bed")], "living"),
  [
    { target: "floor", label: "Floor", value: "Natural oak" },
    { target: "walls", label: "Walls", value: "Spanish Red" },
    { target: "ceiling", label: "Ceiling", value: "Cloud White" },
  ]
);
assert.equal(roomSurfaceRowsOf([summary("walls", "Spanish Red"), summary("selected_wall", "Anima Beige")], "living")[1].value, "Mixed");
assert.equal(roomSurfaceRowsOf([summary("selected_wall", "Anima Beige"), summary("selected_wall", "Anima Beige")], "living")[1].value, "Anima Beige");
assert.deepEqual(roomSurfaceRowsOf([], "living").map((row) => row.value), ["Starter finish", "Plain walls", "No ceiling paint"]);
const rowsMarkup = renderToStaticMarkup(
  createElement(RoomSurfaceRows, { rows: roomSurfaceRowsOf([], "living"), openTarget: "walls", disabled: false, onOpen: () => {} })
);
assert.match(rowsMarkup, /<ul data-testid="room-surface-rows" aria-label="Surfaces"/);
for (const target of ["floor", "walls", "ceiling"]) {
  assert.match(rowsMarkup, new RegExp(`data-testid="room-surface-row-${target}" aria-expanded="${target === "walls"}"[^>]*class="[^"]*min-h-11`));
}

const header = (pro: boolean) =>
  renderToStaticMarkup(
    createElement(SurfaceBrowserHeader, {
      pro, targetLabel: "Walls", displayName: "Spanish Red", target: "walls", selectedWallFaceId: null, tab: "tiles",
      brush: { active: false, disabled: false, status: "", onToggle: () => {} },
      secondaryActionClass: "", metaClass: "", onBack: () => {}, onOpenSummary: () => {}, onTargetChange: () => {}, onTabChange: () => {},
    } satisfies SurfaceBrowserHeaderProps)
  );
const consumerHeader = header(false);
assert.match(consumerHeader, /data-testid="surfaces-back" aria-label="Back to the room"/);
assert.match(consumerHeader, /Walls · Spanish Red/);
assert.doesNotMatch(consumerHeader, /surface-brush-toggle|surface-summary-open|surface-target-bar|surfaces-tab-/, "Consumers pick for one surface.");
const proHeader = header(true);
for (const id of ["surface-brush-toggle", "surface-summary-open", "surface-target-bar", "surface-target-selected-wall", "surfaces-tab-tiles", "surfaces-tab-rooms"]) {
  assert.match(proHeader, new RegExp(`data-testid="${id}"`), `Pro keeps ${id}.`);
}
assert.match(proHeader, /data-testid="surfaces-tab-tiles"[^>]*>Materials<\/button>/, "Tiles is Materials.");

const planPanel = read("components/editor/DesignControlsPlanPanel.tsx");
assert.match(planPanel, /const openRoomSurface = \(target: RoomSurfaceTarget\) => \{\s+onSurfaceTargetChange\(target\); setSurfaceTab\("tiles"\); setWallSurfaceMode\("paint"\); setRoomFinishPanelOpen\(true\); setPlanSectionCollapsed\("selectedRoom", false\);/);
assert.match(planPanel, /<SurfaceBrowserHeader\s+pro=\{isDesigner\}[\s\S]*?onBack=\{\(\) => setRoomFinishPanelOpen\(false\)\}/);
assert.match(planPanel, /\{ id: "materials" as const, label: "Materials" \}/);
assert.doesNotMatch(planPanel, /data-testid="selected-room-floor-finish"|"Change floor"/);

console.log("Surface inspector and Surfaces rows (ED5, ED8) checks passed");
