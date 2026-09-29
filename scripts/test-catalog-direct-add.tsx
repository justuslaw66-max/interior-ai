import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogItemDrawerAddSection } from "../components/catalog/CatalogItemDrawerAddSection";
import { actionToastCanUndo } from "../components/editor/command-bar/CommandBarActionToast";
import { PlacementAddModeToggle } from "../components/editor/PlacementAddModeToggle";
import {
  EDITOR_UNDOABLE_ACTION_EVENT,
  catalogAddAnnouncement,
  undoableActionOf,
} from "../lib/editor-action-toast";

// One-step Add (audit finding FU4): consumers' Add places the product and says so in a toast with
// Undo; "Choose where it goes" opens the preview. Pro keeps its Preview Add or Auto Add choice.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const noop = () => undefined;

// The toast's words, and Undo only while the add is still the newest step in the history.
const added = catalogAddAnnouncement("Winora Armchair", "Living Room");
assert.equal(added.message, "Winora Armchair added to the Living Room");
assert.deepEqual(added.undoLabels, ["Add Winora Armchair", "Add Winora Armchair set"]);
assert.equal(catalogAddAnnouncement(undefined, undefined).message, "Item added to the room");
assert.equal(actionToastCanUndo(added, "Add Winora Armchair"), true);
assert.equal(actionToastCanUndo(added, "Add Winora Armchair set"), true, "A set is one step too.");
assert.equal(actionToastCanUndo(added, "Rotate +90"), false, "Something newer: Undo would undo that instead.");
assert.equal(actionToastCanUndo(added, null), false);
assert.deepEqual(undoableActionOf(new CustomEvent(EDITOR_UNDOABLE_ACTION_EVENT, { detail: added })), added);
assert.equal(undoableActionOf(new Event(EDITOR_UNDOABLE_ACTION_EVENT)), null);

// The adds that place directly announce it; the history names match the toast's labels.
const placement = read("lib/useDesignPageCatalogPlacement.ts");
assert.match(
  placement,
  /const smart = placementAddMode === "auto" \? findSmartCatalogPlacement\(productId, variantId, purchaseOptionId\) : null;\s*if \(smart\) \{\s*if \(addCatalogPlacementToRoom\(smart\)\) announceUndoableAction\(catalogAddAnnouncement\(/,
  "Add places the product when there's an open spot, and announces it."
);
assert.match(placement, /showToast\(placementAddMode === "auto" \? "No open spot here\. Move it where you want it, then Add\."/, "With no open spot, the preview opens instead.");
assert.match(placement, /if \(addCatalogPlacementToRoom\(smartPlacement\)\) announceUndoableAction\(/, "A drop that places the product announces it too.");
assert.match(placement, /`Add \$\{product\.title \|\| "Item"\}`/);
assert.match(placement, /`Add \$\{product\.title\} set`/);
assert.match(placement, /findSmartCatalogPlacement\(productId, variantId, purchaseOptionId\) \?\? buildCatalogPlacementPreview\(productId, variantId, purchaseOptionId\)/, "Choose where it goes always opens a preview.");

// Consumers get Auto; Pro keeps its choice, and only Pro sees the toggle.
assert.match(
  read("lib/useDesignPagePlacementWorkspaceRegistration.ts"),
  /placementAddMode: isDesigner \? base\.state\.editor\.placementAddMode : "auto", \/\/ FU4/
);
const furnishPanel = read("components/editor/DesignControlsFurnishPanel.tsx");
assert.match(furnishPanel, /<PlacementAddModeToggle visible=\{isDesigner\} mode=\{placementAddMode\} onChange=\{onPlacementAddModeChange\} \/>/);
assert.match(furnishPanel, /onAddToRoom=\{onAddCatalogItemToRoom\} directAdd=\{!isDesigner\}/);
assert.match(read("components/editor/DesignControlsPanel.tsx"), /<DesignControlsFurnishPanel\s+dark=\{dark\}\s+canEdit=\{canEdit\} isDesigner=\{isDesigner\}/);
assert.match(read("components/catalog/CatalogPanel.tsx"), /placesDirectly=\{directAdd\} onChooseSpot=\{onAutoPlaceInRoom\}/);
assert.equal(renderToStaticMarkup(createElement(PlacementAddModeToggle, { visible: false, mode: "auto", onChange: noop })), "");
const toggle = renderToStaticMarkup(createElement(PlacementAddModeToggle, { visible: true, mode: "preview", onChange: noop }));
assert.match(toggle, /data-testid="placement-add-mode-preview" data-active="true"[^>]*>Preview Add</);
assert.match(toggle, /data-testid="placement-add-mode-auto" data-active="false"[^>]*>Auto Add</);

// The drawer: consumers add in one step, or choose where it goes; Pro previews first.
const drawer = (placesDirectly: boolean, onChooseSpot?: () => void) =>
  renderToStaticMarkup(createElement(CatalogItemDrawerAddSection, {
    productId: "winora", variantId: "sand", purchaseOptionId: undefined, addQuantity: 1,
    summary: { finishLabel: "Sand", optionLabel: "Single", dimsLabel: "70.5 x 85 cm", roomLabel: "Living Room", price: "$549", compareAt: null },
    retailerUrl: "https://www.castlery.com/sg/products/winora-armchair", isCompared: false,
    placesDirectly, onAdd: noop, onChooseSpot, onToggleCompare: noop, onClose: noop,
  }));
const consumer = drawer(true, noop);
assert.match(consumer, /data-testid="catalog-detail-add-to-room"[^>]*>Add to Living Room</);
assert.match(consumer, /data-testid="catalog-detail-choose-spot"[^>]*>Choose where it goes</);
assert.doesNotMatch(consumer, /Ready to preview|confirm the placement ghost/);
assert.match(consumer, /Sand · Single · 70\.5 x 85 cm · Living Room/);
const pro = drawer(false, noop);
assert.match(pro, /Ready to preview: /);
assert.match(pro, /Next: confirm the placement ghost/);
assert.doesNotMatch(pro, /catalog-detail-choose-spot/);
assert.match(pro, /data-testid="catalog-compare-toggle-drawer-winora"[^>]*>Compare</);

// The toast lives with Undo in the command bar, portaled out of the bar's containing block.
assert.match(
  read("components/editor/command-bar/CommandBarCanvasControls.tsx"),
  /<CommandBarActionToast isClientPreview=\{props\.isClientPreview\} undoName=\{props\.undoName\} onUndo=\{props\.onUndo\} \/>/
);
const toastSource = read("components/editor/command-bar/CommandBarActionToast.tsx");
assert.match(toastSource, /createPortal\(/);
assert.match(toastSource, /role="status" aria-live="polite"/);
assert.match(toastSource, /data-testid="editor-action-toast-undo"\s+className="min-h-11 /, "Undo is a 44px target on phones.");

console.log("One-step Add with Undo checks passed.");
