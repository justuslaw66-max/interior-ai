import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProductLightControls } from "../components/editor/design-page/ProductLightControls";
import type { SelectedItemPanelProps } from "../components/editor/design-page/SelectedItemPanel";
import { withSelectedItemLight } from "../lib/design-page-selection-panel-model";
import { showsItemPanel } from "../lib/item-panel-steps";
import { withFixtureLightPatch, type ProductFixtureLight } from "../lib/product-fixture-light";
import type { DesignItem } from "../lib/room-types";
import { isDesignPageSelectionInspectorVisible } from "../lib/useDesignPageSelectionInspectorModel";

// UX phase 4f: a product shows the one item panel in every step (Plan, Furnish, Suggest a layout).
// Plan's inspector loses its product card, Plan's right rail steps aside, and a lamp's controls
// move into the item panel, so Furnish can dim a lamp.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

assert.deepEqual(
  (["design", "adjust", "ai", "buy", "present"] as const).map((mode) => showsItemPanel(mode)),
  [true, true, true, false, false]
);
const visible = (editorMode: "design" | "adjust" | "ai" | "present", hasSelectedProduct: boolean) =>
  isDesignPageSelectionInspectorVisible({ editorMode, hasInspectorSummary: true, hasSelectedProduct, isClientPreview: false });
assert.equal(visible("design", true), false, "Plan shows a product in the item panel, not the inspector.");
assert.equal(visible("ai", true), false);
assert.equal(visible("adjust", true), false);
assert.equal(visible("design", false), true, "Rooms, walls, doors and windows keep the inspector.");

// The lamp's controls, with the inspector's test ids.
const light: ProductFixtureLight = {
  isOn: true, dimmer: 0.5, cctKelvin: 3000, beamAngleDeg: 42, beamAdjustable: false,
  luminousFluxLumens: 300, dimmable: false, verification: "estimated",
};
const markup = renderToStaticMarkup(createElement(ProductLightControls, { light, disabled: false, onChange: () => {} }));
assert.match(markup, /<section data-testid="selection-inspector-fixture-lighting" aria-labelledby="selected-item-light-heading"/);
assert.match(markup, /<h3 id="selected-item-light-heading"[^>]*>Light<\/h3>/);
assert.match(markup, /300 lm · Estimated output/);
assert.match(markup, /role="switch" aria-checked="true" aria-label="Turn the light off" data-testid="selection-inspector-fixture-power"/);
assert.match(markup, /data-testid="selection-inspector-fixture-dimmer"[^>]*disabled=""/, "A lamp that can't dim has its dimmer off.");
assert.match(markup, /<option value="3000" selected="">3000K<\/option>/);
assert.match(markup, /data-testid="selection-inspector-fixture-beam"[^>]*disabled=""[\s\S]*Lights all around/);

const items = [{ instanceId: "a" }, { instanceId: "b", fixtureLight: { dimmer: 0.2 } }] as DesignItem[];
assert.deepEqual(withFixtureLightPatch(items, "b", { isOn: false }).map((item) => item.fixtureLight), [undefined, { dimmer: 0.2, isOn: false }]);

const onChangeLight = () => {};
const panel = { state: { lockLabel: "Lock" }, actions: {}, configuration: {} } as unknown as SelectedItemPanelProps;
const region = { state: { selectedItem: panel }, configuration: {}, actions: {} };
const lit = withSelectedItemLight(region, light, onChangeLight);
assert.equal(lit.state.selectedItem?.state.light, light);
assert.equal(lit.state.selectedItem?.actions.onChangeLight, onChangeLight);
const empty = { state: { selectedItem: null }, configuration: {}, actions: {} };
assert.equal(withSelectedItemLight(empty, light, onChangeLight), empty);

// Where it's wired.
assert.match(
  read("components/editor/design-page/SelectedItemPanel.tsx"),
  /\{state\.light && actions\.onChangeLight \? <ProductLightControls light=\{state\.light\} disabled=\{editsDisabled\} onChange=\{actions\.onChangeLight\} \/> : null\}/
);
assert.match(read("lib/design-page-panel-workspace-registration.ts"), /regions: \{ panel: withProductLight\(region, \{ coreShell, placementSelection, selectionInspection, itemDocument \}\) \}/);
assert.match(read("lib/design-page-panel-workspace-registration.ts"), /return withSelectedItemLight\(region, light, \(patch: PlacedFixtureLightState\) => \{/);
assert.match(read("lib/design-page-panel-region-adapter.ts"), /selectedItem: showsItemPanel\(state\.editorMode\) && state\.hasSelectedProduct \? panels\.selectedItem : null,/);
assert.match(
  read("lib/design-page-viewport-workspace-read-model.ts"),
  /rail:\s+\(planWorkspace\.derived\.floatingPlanOverlayStackVisible \|\| importedWallEditing\.state\.available\) &&\s+!\(sources\.selectionInspection\.derived\.selectedProduct && showsItemPanel\(sources\.viewportShell\.state\.editor\.editorMode\)\),/
);
const inspector = read("components/editor/design-page/DesignPageSelectionInspector.tsx");
assert.doesNotMatch(inspector, /selection-inspector-(?:center|snap|duplicate|delete)-item|selection-inspector-fixture|selectedFixtureLight|changeFixtureLight/);

console.log("Item panel in every step and the lamp's light checks passed");
