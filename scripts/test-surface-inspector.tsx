import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

console.log("Surface inspector (heading, Change…, Apply, Adjust pattern) checks passed");
