import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShoppingListPage, type ShoppingListPageProps } from "../components/editor/shop/ShoppingListPage";
import { CATALOG_ITEMS } from "../lib/catalog";
import type { DesignItem } from "../lib/room-types";
import {
  buildShoppingList,
  shoppingRemovalStep,
  shoppingSwapStep,
  withShoppingLineSwapped,
  withoutShoppingLine,
  type ShoppingList,
} from "../lib/shopping-list";
import { shoppingBuyOpenerId } from "../lib/shopping-list-buy";
import { buildShoppingSurfaces, shoppingSurfacesOf } from "../lib/shopping-surfaces";
import type { RoomSnapshot } from "../lib/room-types";
import { buildRoomSurfaceMaterialBomRows } from "../lib/surface-material-bom";
import type { SurfaceAreaRow } from "../lib/surface-material-areas";

// Shop (audit findings FU7, FU8): one Shopping list over the canvas, one total, one Buy per shop.
// Buying at a shop, and its buy list, are the Retailer gate's: test-retailer-confirmation-static.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const noop = () => undefined;
const affiliate = Object.keys(CATALOG_ITEMS).filter((id) => CATALOG_ITEMS[id].commerce.type === "affiliate");
const item = (instanceId: string, productId: string, extra: Partial<DesignItem> = {}) =>
  ({ instanceId, productId, variantId: CATALOG_ITEMS[productId]?.defaultVariantId ?? "v", ...extra }) as DesignItem;

const rooms = [
  { id: "living", name: "Living Room", items: [item("a", affiliate[0]), item("b", affiliate[1], { qty: 2 })] },
  { id: "dining", name: "Dining", items: [item("c", affiliate[2])] },
];
const list = buildShoppingList({ rooms, style: "modern" });
const actions: ShoppingListPageProps["actions"] = {
  buyAtRetailer: noop, openLine: noop, closeBuyList: noop, checkoutHere: noop,
  dismissNotice: noop, remove: noop, swapForCheaper: noop, goFurnish: noop,
};
const page = (props: Partial<ShoppingListPageProps> & { list: ShoppingList }) =>
  renderToStaticMarkup(createElement(ShoppingListPage, {
    canEdit: true, busy: false, notice: null, buyList: { retailer: null, openedIds: new Set<string>() }, actions, ...props,
  }));

// The page: heading, one section per shop with its rows, one total, one Buy per shop.
const html = page({ list });
assert.match(html, /data-testid="shopping-list-page"/);
assert.match(html, /<h1 id="shopping-list-title"[^>]*>Shopping list<\/h1>/);
assert.match(html, /Everything in this design, in one place\. You pay on the retailer&#x27;s website\./);
assert.equal((html.match(/data-testid="shopping-list-section"/g) ?? []).length, 1);
assert.match(html, /data-section="castlery\.com"/);
assert.match(html, /<h2[^>]*>Castlery<\/h2><span[^>]*>3 products<\/span>/);
assert.equal((html.match(/data-testid="shopping-list-row"/g) ?? []).length, 3);
assert.match(html, /Living Room<\/span>/);
assert.match(html, /Dining<\/span>/);
assert.match(html, /data-testid="shopping-list-row-quantity">Qty 2</);
assert.match(html, /aria-label="Remove [^"]+ from the design"/);
assert.match(html, /data-testid="shopping-list-total"[^>]*>S\$[\d,]+</);
assert.equal((html.match(/data-testid="shopping-buy"/g) ?? []).length, 1);
assert.match(html, new RegExp(`id="${shoppingBuyOpenerId("castlery.com")}"[^>]*data-testid="shopping-buy"[^>]*data-retailer="castlery\\.com"`));
assert.match(html, />Buy at Castlery<svg/);
assert.match(html, /You check out on castlery\.com\. Prices and stock are confirmed there\./);
assert.doesNotMatch(html, /checkout-shopify/, "Checkout here stays hidden without a Shopify product.");
assert.doesNotMatch(html, /shopping-list-empty/);
// The buy list lives on the page body; it isn't rendered on the server.
assert.doesNotMatch(html, /shopping-buy-list/);

// Swap for cheaper shows only where a cheaper product exists, and only for someone who can edit.
const swaps = list.retailers[0].lines.filter((line) => line.cheaperSwap).length;
assert.equal((html.match(/data-testid="shopping-list-swap"/g) ?? []).length, swaps);
assert.doesNotMatch(page({ list, canEdit: false }), /data-testid="shopping-list-swap"/);
assert.match(page({ list, canEdit: false }), /data-testid="shopping-list-remove"[^>]*disabled=""/);

// Nothing to buy: the way back to Furnish, and no summary.
const empty = page({ list: buildShoppingList({ rooms: [{ id: "r", name: "Room", items: [] }], style: "modern" }) });
assert.match(empty, /data-testid="shopping-list-empty"/);
assert.match(empty, />Nothing to buy yet</);
assert.match(empty, /data-testid="shopping-list-go-furnish"/);
assert.doesNotMatch(empty, /shopping-summary/);

// Notices: errors are alerts, the rest statuses.
assert.match(page({ list, notice: { message: "Out of stock: Lamp.", tone: "error" } }), /role="alert" data-testid="shopping-list-notice"[^>]*><span>Out of stock: Lamp\.<\/span>/);
assert.match(page({ list, notice: { message: "Blocked.", tone: "warning" } }), /role="status" data-testid="shopping-list-notice"/);
// While a buy list is open, the page behind it is hidden, so its notice shows in the list instead.
assert.doesNotMatch(
  page({ list, notice: { message: "Blocked.", tone: "warning" }, buyList: { retailer: list.retailers[0], openedIds: new Set() } }),
  /shopping-list-notice/
);

// Checkout here, once a design has a product sold through Shopify, keeps the guest prompt's opener id.
const shopify = { ...list, checkoutHere: { lines: list.retailers[0].lines.slice(0, 1), subtotal: 0 } };
assert.match(page({ list: shopify }), /id="guest-checkout-action" type="button" data-testid="checkout-shopify"[^>]*>Checkout here \(1\)</);

// Remove takes a set's parts with it; swap keeps the place and drops a set purchase option.
const setItems = [
  item("p", affiliate[0], { bundleGroupId: "set-1", bundleRole: "primary" }),
  item("q", affiliate[1], { bundleGroupId: "set-1", bundleRole: "component" }),
  item("r", affiliate[2]),
];
assert.deepEqual(withoutShoppingLine(setItems, "p").map((entry) => entry.instanceId), ["r"]);
assert.deepEqual(withoutShoppingLine(setItems, "r").map((entry) => entry.instanceId), ["p", "q"]);
const swapped = withShoppingLineSwapped([item("s", affiliate[0], { purchaseOptionId: "two", qty: 2 })], "s", { id: affiliate[1], defaultVariantId: "dv" });
assert.deepEqual([swapped[0].productId, swapped[0].variantId, swapped[0].purchaseOptionId, swapped[0].qty], [affiliate[1], "dv", undefined, 2]);
assert.equal(shoppingRemovalStep({ title: "Winora Armchair" }), "Remove Winora Armchair");
assert.equal(shoppingSwapStep({ title: "Dawson Sofa" }, "Hamilton Sofa"), "Swap Dawson Sofa for Hamilton Sofa");

// Surfaces (the Shop mockup): one row per material, where it goes and how much to order with 10%
// extra. Suppliers price them ("Price on request"), so they stay out of the total.
const areaRow = (materialId: string, roomName: string, surface: SurfaceAreaRow["surface"], orderAreaSqm: number) =>
  ({ materialId, roomName, surface, orderAreaSqm }) as SurfaceAreaRow;
const lookup = (materialId: string) =>
  materialId === "unknown" ? null : { materialId: `${materialId}-id`, name: `${materialId} name`, supplier: "Goodrich Global", swatchUrl: null };
const surfaces = buildShoppingSurfaces([
  areaRow("oak", "Living Room", "floor", 20.2),
  areaRow("oak", "Dining", "floor", 15.4),
  areaRow("tile", "Bathroom", "walls", 8.8),
  areaRow("tile", "Bathroom", "selected_wall", 2.2),
  areaRow("tile", "Kitchen", "floor", 5),
  areaRow("paint", "Hall", "walls", 0),
  areaRow("unknown", "Hall", "floor", 3),
  areaRow("stone", "Hall", "floor", 0.4),
], lookup);
assert.deepEqual(
  surfaces.map((surface) => [surface.materialId, surface.name, surface.supplier, surface.where, surface.orderAreaSqm]),
  [
    ["oak-id", "oak name", "Goodrich Global", "Floor in the Living Room and Dining", 36],
    ["tile-id", "tile name", "Goodrich Global", "Walls in the Bathroom, floor in the Kitchen", 16],
    ["stone-id", "stone name", "Goodrich Global", "Floor in the Hall", 1],
  ]
);
// The editor's own surface catalogue names a real material; a room without finishes has none.
const surfaceRoom: RoomSnapshot = {
  id: "surface-room", name: "Living Room", roomType: "living", geometry: { width: 4, depth: 3 },
  surfaces: { floorMaterialId: "goodrich-geff-novaclick-gnv-001-ivory-oak" }, items: [], zones: [], savedViews: [],
};
const [floor] = shoppingSurfacesOf([surfaceRoom]);
assert.deepEqual([floor.materialId, floor.where, floor.orderAreaSqm], ["goodrich-geff-novaclick-gnv-001-ivory-oak", "Floor in the Living Room", 14]);
assert.ok(floor.name.length > 0 && floor.supplier.length > 0, "A surface names its product and supplier.");
assert.deepEqual(shoppingSurfacesOf([{ ...surfaceRoom, surfaces: undefined }]), []);
// The server's order list (the share export) measures the same surfaces from the same module.
const [bomFloor] = buildRoomSurfaceMaterialBomRows([surfaceRoom]);
assert.deepEqual([bomFloor.materialId, bomFloor.surfaceAreaSqm, bomFloor.orderAreaSqm], [floor.materialId, 12, 13.2]);
// Shop runs in the browser: its surfaces must not reach the server-only catalogue (it reads files).
for (const clientModule of ["lib/shopping-surfaces.ts", "lib/surface-material-areas.ts"]) {
  assert.doesNotMatch(read(clientModule), /catalog-registry|surface-material-yaml|surface-material-bom"|node:fs/, `${clientModule} stays browser-safe.`);
}
const withSurfaces = page({ list, surfaces });
assert.match(withSurfaces, /<section aria-labelledby="shopping-section-surfaces" data-testid="shopping-surfaces"/);
assert.match(withSurfaces, /<h2 id="shopping-section-surfaces"[^>]*>Surfaces<\/h2><span[^>]*>Priced by the supplier<\/span>/);
assert.equal((withSurfaces.match(/data-testid="shopping-surface-row"/g) ?? []).length, 3);
assert.match(withSurfaces, /Goodrich Global · Floor in the Living Room and Dining/);
assert.match(withSurfaces, /data-testid="shopping-surface-order"[^>]*>Order about 36 m², including 10% extra for cuts</);
assert.match(withSurfaces, /data-testid="shopping-surface-price"[^>]*>Price on request</);
assert.match(withSurfaces, /data-testid="shopping-summary-count"[^>]*>3 products\. Surfaces are priced separately\.</);
assert.match(html, /data-testid="shopping-summary-count"[^>]*>3 products\.</);
assert.doesNotMatch(html, /shopping-surfaces/);
// Nothing to buy, but surfaces to order: the empty state, then the surfaces, and no summary.
const emptyWithSurfaces = page({ list: buildShoppingList({ rooms: [{ id: "r", name: "Room", items: [] }], style: "modern" }), surfaces });
assert.match(emptyWithSurfaces, /data-testid="shopping-list-empty"[\s\S]*data-testid="shopping-surfaces"/);
assert.doesNotMatch(emptyWithSurfaces, /shopping-summary/);

// Wiring: Shop replaces the dock with a page over the canvas, fed with every room.
const region = read("components/editor/design-page/DesignPagePanelRegion.tsx");
assert.match(region, /data-testid="shop-step"\s+className="absolute inset-x-0 bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\] top-12 z-40 overflow-y-auto bg-\[#fafaf9\] md:bottom-0 md:top-9"/);
assert.match(region, /<ShopStep \{\.\.\.state\.shopping\} \/>/);
assert.doesNotMatch(region, /CartSidebar|ShoppingOverviewPanel|shopping-dock/);
// While Shop covers the canvas, the canvas leaves the tab order and the accessibility tree, and
// Pro's tool rail, which would sit on the page, hides.
assert.match(region, /export function CanvasBehindPage\(\{ covered, children \}[\s\S]*?inert=\{covered\} aria-hidden=\{covered \|\| undefined\}/);
assert.match(
  read("components/editor/design-page/DesignPageWorkspace.tsx"),
  /<CanvasBehindPage covered=\{panelRegionModel\.state\.shopping !== null\}><DesignPageSceneRegion \{\.\.\.sceneRegionModel\} \/><\/CanvasBehindPage>/
);
assert.match(
  read("lib/useDesignPageEditorChromeController.ts"),
  /toolRail: \{ visible: !commandState\.isClientPreview && commandState\.isDesigner && commandState\.editorMode !== "buy",/
);
const registration = read("lib/design-page-panel-registration.ts");
assert.match(registration, /rooms: state\.document\.rooms, planOpenings: planDocument\.state\.planOpenings,\s+style: state\.editor\.controls\.style,/);
// The editor's rooms carry their finishes, so the same rooms feed the Surfaces list.
assert.match(read("lib/design-page-shopping-panel-model.ts"), /return \{ \.\.\.state, surfaceRooms: state\.rooms, actions \};/);
assert.match(read("components/editor/shop/ShopStep.tsx"), /useMemo\(\(\) => \(surfaceRooms \? shoppingSurfacesOf\(surfaceRooms, planOpenings\) : NO_SURFACES\), \[surfaceRooms, planOpenings\]\)/);
assert.match(registration, /commitItemsToRoom: actions\.shopping\.commitItemsToRoom,/);
assert.match(read("lib/design-page-panel-workspace-registration.ts"), /commitItemsToRoom: itemDocument\.actions\.commitItemsToRoom,/);

// Edits are history steps with Undo in a toast.
const step = read("components/editor/shop/ShopStep.tsx");
assert.match(step, /announceUndoableAction\(\{ message: `\$\{line\.title\} removed from the design`, undoLabels: \[step\] \}\)/);
assert.match(step, /announceUndoableAction\(\{ message: `Swapped for \$\{product\.title\}`, undoLabels: \[step\] \}\)/);
// Checkout here: one checkout at a time, and a guest is asked to save first.
const hook = read("lib/useShoppingListBuy.ts");
assert.match(hook, /trackProductEvent\("shopping_list_opened"/);
assert.match(hook, /if \(busy \|\| checkoutLock\.active\(\)\) return;\s+if \(isGuest\) \{\s+openGuestPrompt\("checkout"/);
assert.match(hook, /await checkoutLock\.run\(async \(\) => \{/);

console.log("Shop page checks passed.");
