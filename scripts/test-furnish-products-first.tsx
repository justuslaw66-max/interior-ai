import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CatalogCard, { CATALOG_CARD_ROW_HEIGHT } from "../components/catalog/CatalogCard";
import { CatalogCategoryChips } from "../components/catalog/CatalogCategoryChips";
import { CatalogEmptyState } from "../components/catalog/CatalogEmptyState";
import { FurnishFooter, furnishRoomSummary } from "../components/editor/FurnishFooter";
import { FurnishInThisRoom } from "../components/editor/FurnishInThisRoom";
import { FurnishStepModes } from "../components/editor/FurnishStepModes";
import {
  buildCatalogChips,
  catalogChipTestId,
  catalogResultsLabel,
  orderCatalogCategories,
  recommendedCatalogCategoriesForRoom,
  selectedCatalogChip,
  sortByCategoryOrder,
} from "../lib/catalog/category-chips";
import type { CatalogCardView } from "../lib/catalog/view-builders";
import type { ActiveRoomShoppingItem } from "../lib/room-shopping";

// Furnish, products first (audit findings FU1-FU3, FU5, ST12): the room, the search with Suggest a
// layout beside it, chips, slim cards with one Add, then "In this room" and the way on to Shop.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const noop = () => undefined;

// Chips: Favourites (n), Recent once something was added, All, then the room's categories first.
const living = recommendedCatalogCategoriesForRoom("Living Room");
assert.deepEqual(living.slice(0, 3), ["sofa", "accent_chair", "coffee_table"]);
assert.equal(recommendedCatalogCategoriesForRoom("Bedroom")[0], "bed");
assert.equal(recommendedCatalogCategoriesForRoom("Main bathroom")[0], "decor");
assert.deepEqual(recommendedCatalogCategoriesForRoom("Study"), recommendedCatalogCategoriesForRoom("Custom"));
const counts = { sofa: 4, accent_chair: 3, bed: 2, rug: 0, dining_table: 1 };
const ordered = orderCatalogCategories(counts, living);
assert.deepEqual(ordered, ["sofa", "accent_chair", "bed", "dining_table"], "Room categories first, then catalogue order; none empty.");
const chips = buildCatalogChips({ categories: ordered, favoritesCount: 2, recentCount: 0 });
assert.deepEqual(
  chips.map((chip) => chip.label),
  ["Favourites (2)", "All", "Sofas", "Armchairs", "Beds", "Dining tables"],
  "Recent waits until a product was added."
);
assert.deepEqual(
  buildCatalogChips({ categories: [], favoritesCount: 0, recentCount: 3 }).map((chip) => chip.label),
  ["Favourites (0)", "Recent", "All"]
);
assert.equal(catalogChipTestId("favorites"), "catalog-memory-favorites");
assert.equal(catalogChipTestId("all"), "catalog-memory-all");
assert.equal(catalogChipTestId("tv_console"), "catalog-category-chip-tv_console");
assert.equal(selectedCatalogChip("all", "sofa"), "sofa");
assert.equal(selectedCatalogChip("favorites", "sofa"), "favorites");
assert.equal(catalogResultsLabel(1), "1 product");
assert.equal(catalogResultsLabel(24), "24 products");
assert.deepEqual(
  sortByCategoryOrder(["bed-a", "sofa-a", "bed-b", "sofa-b"], (id) => (id.startsWith("bed") ? "bed" : "sofa"), ["sofa", "bed"]),
  ["sofa-a", "sofa-b", "bed-a", "bed-b"],
  "All lists the room's categories first and keeps catalogue order within one."
);
const chipMarkup = renderToStaticMarkup(createElement(CatalogCategoryChips, { chips, selected: "all", onSelect: noop }));
assert.match(chipMarkup, /role="group" aria-label="Filter products"/);
assert.match(chipMarkup, /data-testid="catalog-memory-all" data-active="true" aria-pressed="true"[^>]*>All</);
assert.match(chipMarkup, /data-testid="catalog-category-chip-sofa" data-active="false" aria-pressed="false"[^>]*>Sofas</);

// The card: name, size, price and one Add; the heart saves it; details open from the card.
const card: CatalogCardView = {
  id: "winora", variantId: "sand", variantLabel: "Sand", title: "Winora Armchair", brand: "Castlery", category: "Arm Chair",
  thumbUrl: null, fallbackThumbUrl: null, priceAmount: 549, dimsLabel: "70.5 x 85 cm", dimsMm: { w: 705, d: 850, h: 850 },
  primarySwatches: [], badges: [], imageClassName: "h-full w-full object-contain",
};
const renderCard = (overrides: Partial<Parameters<typeof CatalogCard>[0]> = {}) =>
  renderToStaticMarkup(createElement(CatalogCard, {
    item: card, roomLabel: "Living Room", inRoom: false, isFavorite: false,
    onPreview: noop, onAdd: noop, onToggleFavorite: noop, ...overrides,
  }));
const plainCard = renderCard();
assert.match(plainCard, /data-testid="catalog-card-winora"[^>]*class="relative flex h-\[232px\]/);
assert.match(plainCard, /data-testid="catalog-preview-winora"[^>]*data-catalog-drawer-focus-action="details"/);
assert.match(plainCard, />Winora Armchair<\/span><span class="sr-only">, view details<\/span>/);
assert.match(plainCard, />70\.5 x 85 cm</);
assert.match(plainCard, /data-testid="catalog-card-price-winora"[^>]*>S\$549</);
assert.match(plainCard, /data-testid="catalog-add-winora" aria-label="Add Winora Armchair to the Living Room"/);
assert.match(plainCard, /data-testid="catalog-favorite-toggle-winora" aria-pressed="false" aria-label="Save Winora Armchair to Favourites"/);
assert.doesNotMatch(plainCard, /In this room|Compare|catalog-auto-place-|Auto place/, "No badge until it's in the room; Compare lives in details.");
const placedCard = renderCard({ inRoom: true, isFavorite: true, item: { ...card, priceAmount: null } });
assert.match(placedCard, /data-testid="catalog-in-room-winora"[^>]*>.*In this room</);
assert.match(placedCard, /aria-pressed="true" aria-label="Remove Winora Armchair from Favourites"/);
assert.match(placedCard, />Price on request</);
assert.equal(CATALOG_CARD_ROW_HEIGHT, 232 + 8, "The grid is virtualised on the card's height plus its gap.");

const favouritesEmpty = renderToStaticMarkup(createElement(CatalogEmptyState, {
  scope: "favorites", hasSearchTerm: false, hasActiveFilters: false, onBrowseAll: noop, onClearSearch: noop, onClearFilters: noop,
}));
assert.match(favouritesEmpty, /No favourites yet.*Tap the heart on a product to keep it here\..*Browse all products/);

// In this room: every placed product is a button that selects it (the keyboard path).
const placed = (instanceId: string, quantity = 1): ActiveRoomShoppingItem => ({
  instanceId, productId: "hugg", variantId: "black", title: "Hugg Nesting Square Coffee Table", variantLabel: "Black",
  imageUrl: null, fallbackImageUrl: null, priceLabel: "S$1,099", quantity, linePrice: 1099, retailerUrl: null,
  retailerLabel: "Castlery", commerceMode: "affiliate", shopifyVariantId: null, retailerStatusLabel: "", includeInCheckout: true,
  cartStatusLabel: "", hasValidCommerce: true, category: "coffee_table",
});
assert.equal(
  renderToStaticMarkup(createElement(FurnishInThisRoom, { roomName: "Living Room", items: [], selectedId: null, canEdit: true, onSelect: noop })),
  ""
);
const inRoom = renderToStaticMarkup(createElement(FurnishInThisRoom, {
  roomName: "Living Room", items: [placed("a"), placed("b", 2)], selectedId: "b", canEdit: true, onSelect: noop,
}));
assert.match(inRoom, /In this room <span[^>]*>2<\/span>/);
assert.match(inRoom, /role="list" aria-label="Placed items in Living Room"/);
assert.equal(inRoom.match(/data-testid="furnish-room-bom-item"/g)?.length, 2);
assert.match(inRoom, /aria-label="Select Hugg Nesting Square Coffee Table, Black" aria-pressed="false" data-testid="placed-item-select-a"/);
assert.match(inRoom, /aria-pressed="true" data-testid="placed-item-select-b"/);
assert.match(inRoom, />Black · Qty 2</);

// The foot: the room, its products and total, and Continue to Shop.
assert.equal(furnishRoomSummary(0, 0), "No products yet");
assert.equal(furnishRoomSummary(1, 549), "1 product · S$549");
assert.equal(furnishRoomSummary(3, 4715), "3 products · S$4,715");
const footer = renderToStaticMarkup(createElement(FurnishFooter, { roomName: "Living Room", productCount: 3, total: 4715, onGoShop: noop }));
assert.match(footer, /class="sticky bottom-0/);
assert.match(footer, /data-testid="furnish-active-room-name"[^>]*>Living Room</);
assert.match(footer, /data-testid="furnish-continue-to-shop"[^>]*>Continue to Shop/);

// The panel's order, with nothing of the old guided mode or its jargon (FU5).
const furnishPanel = read("components/editor/DesignControlsFurnishPanel.tsx");
const panelBody = furnishPanel.slice(furnishPanel.indexOf("export default function DesignControlsFurnishPanel"));
const order = ["<FurnishRoomRow", "<PlacementAddModeToggle", "<FurnishCatalogSection", "<FurnishInThisRoom", "<FurnishImportedModels", "<FurnishFooter"];
const positions = order.map((tag) => panelBody.indexOf(tag));
assert.ok(positions.every((position, index) => position > 0 && (index === 0 || position > positions[index - 1])), "Furnish reads room, products, room list, foot.");
assert.match(
  furnishPanel,
  /function FurnishCatalogSection[\s\S]*?data-testid="editor-workflow-ai"[\s\S]*?Suggest a layout[\s\S]*?<CatalogPanel[\s\S]*?searchAside=\{suggestLayout\}/,
  "Suggest a layout sits beside the search (ST12)."
);
assert.doesNotMatch(
  furnishPanel,
  /How do you want to furnish|Room completeness|Room bill of materials|cart-ready|Shoppable|furnish-mode-guided/i,
  "The guided mode and its words are gone."
);
assert.doesNotMatch(read("components/editor/FurnishStepModes.tsx"), /editor-workflow-ai/, "One Suggest a layout entry, beside the search.");
assert.equal(
  renderToStaticMarkup(createElement(FurnishStepModes, { dark: false, mode: "furnish", onGoFurnish: noop })),
  "",
  "Without Built-ins, Furnish shows no mode row at all."
);
assert.match(
  renderToStaticMarkup(createElement(FurnishStepModes, { dark: false, mode: "ai", onGoFurnish: noop })),
  /data-testid="furnish-step-back-to-products"/
);

const catalogPanel = read("components/catalog/CatalogPanel.tsx");
assert.match(catalogPanel, /<CatalogSearchInput value=\{rawSearch\} onChange=\{setRawSearch\} \/>\s*\{searchAside\}/);
assert.ok(catalogPanel.indexOf("<CatalogCategoryChips") < catalogPanel.indexOf("<CatalogGrid"), "The chips come before the products.");
assert.doesNotMatch(catalogPanel, /CatalogCategoryTabs|catalog-smart-filter|catalog-room-context|Adding to/, "Products first: no category dropdown, quick filters or room banner.");
assert.match(catalogPanel, /Math\.floor\(scrollTop \/ CATALOG_CARD_ROW_HEIGHT\)/);

console.log("Furnish products-first checks passed.");
