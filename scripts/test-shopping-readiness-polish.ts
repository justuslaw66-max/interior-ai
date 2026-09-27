import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatSgd } from "../lib/money-format";

// Shop is one Shopping list (UX audit FU7, FU8; UX phase 3c-2). The Shop dock's readiness filters,
// replacement suggestions, cart-ready bulk add and checkout toggles went with it: products without a
// buy link are listed apart ("Not sold online yet"), and remove and swap are the list's own, with
// Undo (test-shop-page.tsx, test-shopping-list.tsx).

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");
const furnishSource = read("components/editor/DesignControlsFurnishPanel.tsx");
const furnishFooterSource = read("components/editor/FurnishFooter.tsx");
const designPageSource = read("components/editor/design-page/DesignPageWorkspace.tsx");
const documentSelectionRegistrationSource = read("lib/useDesignPageDocumentSelectionRegistrationFacade.ts");
const shoppingCatalogRuntimeSource = read("lib/useDesignPageShoppingCatalogRuntime.ts");

// Furnish is products first (UX audit FU1): Furnish's foot shows the room's products and total, on
// the way to Shop.
assert.doesNotMatch(
  furnishSource,
  /shopping-readiness-detail|shopping-readiness-add-cart-ready|onReviewShoppingIssue/,
  "Furnish should leave shopping to Shop."
);
assert.match(furnishFooterSource, /formatSgd\(total\)/, "Furnish's room total should use the shared money format.");
assert.match(furnishFooterSource, /data-testid="furnish-continue-to-shop"/, "Furnish's foot should lead on to Shop.");

// The dock's plumbing is gone, not left behind unused.
for (const retired of ["lib/shopping-readiness.ts", "lib/shopping-replacements.ts", "lib/design-page-shopping-item-replacement.ts"]) {
  assert.equal(existsSync(join(process.cwd(), retired)), false, `${retired} went with the Shop dock.`);
}
for (const [relativePath, retired] of [
  ["components/editor/DesignControlsPanel.tsx", /onReviewShoppingIssue|onAddActiveRoomCartReadyItems|ShoppingReadinessFilter/],
  ["lib/design-page-controls-panel-model.ts", /onReviewShoppingIssue|onAddActiveRoomCartReadyItems/],
  ["lib/design-page-panel-registration.ts", /reviewIssue|addActiveRoomCartReadyItems/],
  ["lib/useDesignPageEditorShellRuntime.ts", /shoppingReadinessFilter|ShoppingReadinessFilter/],
  ["lib/useDesignPageViewportShellRegistration.ts", /shoppingReadinessFilter|setShoppingReadinessFilter/],
  ["lib/useDesignPageRoomReadModel.ts", /setShoppingReadinessFilter/],
  ["lib/useDesignPageSelectionTransforms.ts", /addActiveRoomCartReadyItems|setShoppingItemInclude|setSelectedItemQuantity|activeRoomShoppingItems/],
  ["lib/useDesignPagePanelActions.ts", /removeShoppingItem/],
  ["lib/useDesignPageCatalogPlacement.ts", /addCatalogItemDirectlyToRoom/],
] as const) {
  assert.doesNotMatch(read(relativePath), retired, `${relativePath} keeps none of the Shop dock's plumbing.`);
}

// The catalogue still starts once, from the document boundary, before history shortcuts.
assert.match(
  documentSelectionRegistrationSource,
  /useDesignPageShoppingCatalogRuntime\(\);/,
  "The document boundary should start the catalogue through its runtime."
);
assert.doesNotMatch(
  designPageSource,
  /initializeCatalog\(\)|catalog_initialized/,
  "The workspace should not retain catalog startup behavior."
);
assert.ok(
  documentSelectionRegistrationSource.indexOf("useDesignPageShoppingCatalogRuntime();") <
    documentSelectionRegistrationSource.indexOf("useDesignPageHistoryShortcuts({"),
  "Catalog startup should remain registered before history shortcuts."
);
assert.match(
  shoppingCatalogRuntimeSource,
  /useEffect\(\(\) => \{[\s\S]*?initializeCatalog\(\)[\s\S]*?track\("catalog_initialized"[\s\S]*?\}, \[\]\);/,
  "The catalogue is validated and reported once, on mount."
);
assert.doesNotMatch(shoppingCatalogRuntimeSource, /swapItem|reviewIssue|useCallback/);

// One money format everywhere (UX audit FU9): Singapore dollars with the
// currency visible and grouped whole dollars, never a bare or US dollar.
assert.equal(formatSgd(1738), "S$1,738");
assert.equal(formatSgd(1737.6), "S$1,738");
assert.equal(formatSgd(0), "S$0");
assert.equal(formatSgd(-45), "-S$45");
const readSource = read;
for (const relativePath of [
  "app/share/[shareToken]/(presentation)/page.tsx",
  "app/share/[shareToken]/export/page.tsx",
  "app/share/[shareToken]/export/ShoppingList.tsx",
  "app/share/[shareToken]/export/pdf/route.ts",
  "components/public-share/PublicShareRoomSchedule.tsx",
]) {
  assert.doesNotMatch(
    readSource(relativePath),
    /currency: "USD",\s*maximumFractionDigits: 0/,
    `${relativePath} must format catalog prices as SGD through formatSgd, not as US dollars.`
  );
}
for (const relativePath of [
  "components/editor/shop/ShoppingListSection.tsx",
  "components/editor/shop/ShoppingSummary.tsx",
  "lib/shopping-list.ts",
  "lib/useDesignPageSelectionInspectorModel.ts",
]) {
  const source = readSource(relativePath);
  assert.doesNotMatch(
    source,
    /\$\$\{|>\$\{|Subtotal \$\{|\$\{[^}]*toFixed\(0\)\}/,
    `${relativePath} must not print a bare "$" before a raw number.`
  );
  assert.match(source, /format(?:Sgd|Money)\(/, `${relativePath} should format money through the shared formatter.`);
}
const catalogCardSource = readSource("components/catalog/CatalogCard.tsx");
assert.match(
  catalogCardSource,
  /function CatalogCardPrice[\s\S]*?data-testid=\{`catalog-card-price-\$\{item\.id\}`\}[\s\S]*?item\.priceAmount != null \? formatSgd\(item\.priceAmount\)[\s\S]*?<CatalogCardPrice item=\{item\} \/>/,
  "Catalog cards should show the price when the catalog has one (UX audit FU2)."
);

console.log("Shopping readiness polish checks passed.");
