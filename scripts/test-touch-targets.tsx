import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CatalogCard from "../components/catalog/CatalogCard";
import EditorViewToggle from "../components/editor/EditorViewToggle";
import { PhoneStepSheet } from "../components/editor/PhoneStepSheet";
import { PlanGuidedActionsToggle } from "../components/editor/design-page/PlanGuidedActionsToggle";
import { PlanManualQuickActions } from "../components/editor/design-page/PlanManualQuickActions";
import { Button } from "../components/ui/Button";

// Touch (UX 4d, audit AX1): on phones and touch screens the editor's controls are 44px targets, and
// on phones its fields use 16px text so iOS doesn't zoom in. The Playwright projects use a fine
// pointer, so the coarse-pointer half is pinned here; 20-mobile-plan-mode measures the phone half.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const noop = () => undefined;
const css = read("app/globals.css");

// The touch: variant, and the touch areas: every button, select, switch and text field in one is at
// least 44px tall, in the utilities layer so it outranks their dense sizes.
assert.match(css, /@custom-variant touch \{\s*@media \(width < 48rem\), \(pointer: coarse\) \{\s*@slot;\s*\}\s*\}/);
assert.match(
  css,
  /@layer utilities \{\s*@media \(width < 48rem\), \(pointer: coarse\) \{\s*\[data-touch-area\]\s*:is\(button, select, \[role="switch"\], input:not\([^)]*\[type="checkbox"\][^)]*\)\):not\(\[data-touch-exempt\]\) \{\s*min-height: 2\.75rem;/
);
assert.match(
  css,
  /@media \(width < 48rem\) \{\s*input:not\(\[type="checkbox"\], \[type="radio"\], \[type="range"\], \[type="color"\], \[type="file"\]\),\s*select,\s*textarea \{\s*font-size: 1rem;/,
  "Phone fields are 16px, outside the layers."
);
assert.doesNotMatch(css.split("/* Fields use 16px text on phones")[1]?.split("html,")[0] ?? "", /@layer/, "The field rule stays unlayered.");

// The touch areas: the phone's sheet, the menus, and the panels over the canvas.
assert.match(
  renderToStaticMarkup(<PhoneStepSheet dark={false} title="Plan" subtitle="x" collapsed={false}>{null}</PhoneStepSheet>),
  /^<section data-testid="design-controls-panel" data-touch-area="true"/
);
for (const [path, testId] of [
  ["components/editor/command-bar/CommandBarMoreMenu.tsx", "editor-command-overflow-menu"],
  ["components/editor/command-bar/CommandBarAccountMenu.tsx", "editor-command-account-menu"],
  ["components/editor/design-page/SelectedItemPanel.tsx", "selected-item-panel"],
  ["components/editor/design-page/SelectedCabinetPanel.tsx", "selected-cabinet-panel"],
  ["components/editor/design-page/PlanCanvasGuidance.tsx", "plan-canvas-guidance"],
  ["components/editor/design-page/SelectedPlanOpeningActions.tsx", "selected-plan-opening-actions"],
  ["components/editor/design-page/DesignPageSelectionInspector.tsx", "selection-inspector"],
] as const) {
  assert.match(read(path), new RegExp(`data-testid="${testId}" data-touch-area\\b`), testId);
}
assert.match(
  read("components/editor/EditorCommandBar.tsx"),
  /const menuPanelClass = `absolute max-h-\[calc\(100dvh-4\.5rem\)\] overflow-y-auto /,
  "A menu of 44px rows scrolls inside itself on a short phone."
);

// Controls sized by hand get the touch: size: Button's dense sizes, the canvas toolbar's 2D | 3D,
// Plan's quick actions and Tips, and a product card's heart. The card's name is exempt: the card's
// height is fixed (the grid is virtualised on it), and the whole card opens the details.
const button = (size: "compact" | "icon" | "round") => renderToStaticMarkup(createElement(Button, { size, "aria-label": "x" }, "x"));
assert.match(button("compact"), /class="[^"]*\btouch:h-11 h-\[30px\]/);
assert.match(button("icon"), /class="[^"]*\btouch:h-11 touch:w-11 h-9 w-9\b/);
assert.match(button("round"), /class="[^"]*\btouch:h-11 touch:w-11 h-10 w-10\b/);
const toggle = renderToStaticMarkup(createElement(EditorViewToggle, { value: "2d", onChange: noop, variant: "canvas" }));
assert.equal(toggle.match(/\bh-8 touch:h-11\b/g)?.length, 2, "Both 2D | 3D segments.");
const quickActions = renderToStaticMarkup(createElement(PlanManualQuickActions, {
  state: { activeTool: "select", hasUnderlay: false, calibrationActive: false, canScale: false, hasRooms: true },
  actions: { select: noop, scale: noop, drawRoom: noop, addOpening: noop, fit: noop },
}));
const quickButtons = quickActions.match(/<button [^>]*>/g) ?? [];
assert.ok(quickButtons.length >= 5);
for (const tag of quickButtons) assert.match(tag, /\bh-10 w-10 touch:h-11 touch:w-11\b/, tag);
const tips = (compact: boolean) =>
  renderToStaticMarkup(createElement(PlanGuidedActionsToggle, { state: { enabled: false, compact }, actions: { toggle: noop } }));
assert.match(tips(false), /\btouch:min-h-11\b/);
assert.match(tips(true), /\bleft-1\/2 top-bar-32 translate-x-4\b/, "Beside the quick actions, Tips sits under them on phones.");
const card = renderToStaticMarkup(createElement(CatalogCard, {
  item: {
    id: "winora", variantId: "sand", variantLabel: "Sand", title: "Winora Armchair", brand: "Castlery", category: "Arm Chair",
    thumbUrl: null, fallbackThumbUrl: null, priceAmount: 549, dimsLabel: "70.5 x 85 cm", dimsMm: { w: 705, d: 850, h: 850 },
    primarySwatches: [], badges: [], imageClassName: "h-full w-full object-contain",
  },
  roomLabel: "Living Room", inRoom: false, isFavorite: false, onPreview: noop, onAdd: noop, onToggleFavorite: noop,
}));
assert.match(card, /data-testid="catalog-favorite-toggle-winora"[^>]*class="[^"]*\bh-8 w-8 touch:h-11 touch:w-11\b/);
assert.match(card, /data-testid="catalog-preview-winora" data-touch-exempt="true"/);
assert.match(card, /data-testid="catalog-add-winora"[^>]*class="[^"]*\bmin-h-10\b/, "Add grows to 44px in the sheet and still fits the card.");

console.log("Touch target checks passed.");
