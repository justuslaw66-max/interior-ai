import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_ITEMS } from "../lib/catalog";
import type { CatalogItemSchema } from "../lib/catalog-schema";
import { mapToTopCategory } from "../lib/catalog/view-builders";
import { replaceShoppingItemWithRecommendation } from "../lib/design-page-shopping-item-replacement";
import { resolveRoomShoppingItems, type ActiveRoomShoppingItem } from "../lib/room-shopping";
import type { DesignItem } from "../lib/room-types";
import { buildShoppingReplacementSuggestions } from "../lib/shopping-replacements";

const furnishSource = readFileSync(
  join(process.cwd(), "components/editor/DesignControlsFurnishPanel.tsx"),
  "utf8"
);
const shoppingSource = readFileSync(
  join(process.cwd(), "components/editor/ShoppingOverviewPanel.tsx"),
  "utf8"
);
const readinessSource = readFileSync(
  join(process.cwd(), "lib/shopping-readiness.ts"),
  "utf8"
);
const replacementSource = readFileSync(
  join(process.cwd(), "lib/shopping-replacements.ts"),
  "utf8"
);
const designPageSource = readFileSync(
  join(process.cwd(), "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const documentSelectionRegistrationSource = readFileSync(
  join(
    process.cwd(),
    "lib/useDesignPageDocumentSelectionRegistrationFacade.ts"
  ),
  "utf8"
);
const shoppingCatalogRuntimeSource = readFileSync(
  join(process.cwd(), "lib/useDesignPageShoppingCatalogRuntime.ts"),
  "utf8"
);

assert.match(
  readinessSource,
  /export function summarizeShoppingReadinessItems/,
  "Shopping readiness should be centralized in a shared helper."
);
assert.match(
  readinessSource,
  /missingPriceCount/,
  "Shopping readiness should flag missing prices."
);
assert.match(
  readinessSource,
  /missingCheckoutLinkCount/,
  "Shopping readiness should flag missing checkout or retailer links."
);
assert.match(
  readinessSource,
  /notInCartCount/,
  "Shopping readiness should flag cart-ready items that are not included in checkout."
);
assert.match(
  furnishSource,
  /data-testid="shopping-readiness-detail"/,
  "Room completeness should show a shopping-readiness detail card."
);
assert.match(
  furnishSource,
  /onReviewShoppingIssue\(blocker\.filter\)/,
  "Room completeness blocker chips should open a filtered shopping review."
);
assert.match(
  furnishSource,
  /data-testid="shopping-readiness-add-cart-ready"/,
  "Shopping readiness should expose a direct add-cart-ready action."
);
assert.match(
  shoppingSource,
  /data-testid="shopping-readiness-filters"/,
  "Shopping overview should expose filter chips for readiness issues."
);
assert.match(
  shoppingSource,
  /data-testid=\{`shopping-readiness-badge-\$\{badge\.id\}`\}/,
  "Shopping overview rows should show item-level readiness badges."
);
assert.match(
  shoppingSource,
  /data-testid="shopping-item-add-to-cart"/,
  "Shopping overview rows should include a one-click add-to-cart action."
);
assert.match(
  shoppingSource,
  /Replace with shoppable/,
  "Shopping overview rows should offer a shoppable replacement path."
);
assert.match(
  replacementSource,
  /export function buildShoppingReplacementSuggestions/,
  "Shopping replacements should be ranked by a shared helper."
);
assert.match(
  replacementSource,
  /same category/,
  "Shopping replacements should prioritize same-category items."
);
assert.match(
  replacementSource,
  /if \(!retailerUrl\) return \[\];/,
  "Shopping replacements should require a concrete retailer or affiliate URL."
);
assert.match(
  replacementSource,
  /price <= 0/,
  "Shopping replacements should require a positive price."
);
assert.match(
  shoppingSource,
  /data-testid="shopping-item-replacements"/,
  "Bad shopping rows should show inline replacement suggestions."
);
assert.match(
  shoppingSource,
  /data-testid="shopping-replacement-swap"/,
  "Replacement suggestions should support one-click swapping."
);
assert.match(
  shoppingSource,
  /data-testid="shopping-replacement-preview"/,
  "Replacement suggestions should support placement preview."
);
assert.match(
  designPageSource,
  /useDesignPageDocumentSelectionRegistrationFacade\(\{/,
  "The workspace should register shopping behavior through the document boundary."
);
assert.match(
  documentSelectionRegistrationSource,
  /useDesignPageShoppingCatalogRuntime\(\{/,
  "The document boundary should register shopping actions and catalog startup through their runtime."
);
assert.doesNotMatch(
  designPageSource,
  /const swapShoppingItemReplacement = useCallback/,
  "The workspace should not retain shopping replacement behavior."
);
assert.doesNotMatch(
  designPageSource,
  /initializeCatalog\(\)|catalog_initialized/,
  "The workspace should not retain catalog startup behavior."
);
assert.ok(
  documentSelectionRegistrationSource.indexOf(
    "useDesignPageShoppingCatalogRuntime({"
  ) <
    documentSelectionRegistrationSource.indexOf(
      "useDesignPageHistoryShortcuts({"
    ),
  "Shopping callbacks and catalog startup should remain registered before history shortcuts."
);
assert.match(
  shoppingCatalogRuntimeSource,
  /const swapItem = useCallback[\s\S]*?const reviewIssue = useCallback[\s\S]*?useEffect\(\(\) => \{[\s\S]*?initializeCatalog\(\)[\s\S]*?track\("catalog_initialized"/,
  "The shopping runtime should preserve swap, review, and catalog-startup hook order."
);

const replacementItems: DesignItem[] = [
  {
    instanceId: "shopping-replacement-target",
    productId: "old-product",
    variantId: "old-variant",
    position: [1.25, 0.5, -2.75],
    rotationY: Math.PI / 3,
    qty: 2,
    includeInCheckout: false,
    purchaseOptionId: "old-purchase-option",
    configurationCode: "old-configuration",
    bundleGroupId: "old-bundle",
    bundleRole: "primary",
    bundleQuantity: 3,
    materialPreset: "old-material-preset",
    materialOverrides: {
      roughness: 0.4,
      metalness: 0.2,
      colorHex: "#123456",
    },
  },
  {
    instanceId: "shopping-replacement-untouched",
    productId: "untouched-product",
    variantId: "untouched-variant",
    position: [0, 0, 0],
  },
];
const replacedItems = replaceShoppingItemWithRecommendation(
  replacementItems,
  "shopping-replacement-target",
  {
    productId: "new-product",
    variantId: "new-variant",
    purchaseOptionId: "new-purchase-option",
  }
);
const replacedItem = replacedItems[0];

assert.notEqual(
  replacedItems,
  replacementItems,
  "Shopping replacement should return a new item collection."
);
assert.equal(
  replacedItems[1],
  replacementItems[1],
  "Shopping replacement should retain unrelated item identity."
);
assert.deepEqual(
  {
    instanceId: replacedItem.instanceId,
    productId: replacedItem.productId,
    variantId: replacedItem.variantId,
    purchaseOptionId: replacedItem.purchaseOptionId,
    position: replacedItem.position,
    rotationY: replacedItem.rotationY,
    qty: replacedItem.qty,
    includeInCheckout: replacedItem.includeInCheckout,
  },
  {
    instanceId: "shopping-replacement-target",
    productId: "new-product",
    variantId: "new-variant",
    purchaseOptionId: "new-purchase-option",
    position: [1.25, 0.5, -2.75],
    rotationY: Math.PI / 3,
    qty: 2,
    includeInCheckout: true,
  },
  "Shopping replacement should change commerce identity while preserving placement and quantity."
);
assert.deepEqual(
  {
    configurationCode: replacedItem.configurationCode,
    bundleGroupId: replacedItem.bundleGroupId,
    bundleRole: replacedItem.bundleRole,
    bundleQuantity: replacedItem.bundleQuantity,
    materialPreset: replacedItem.materialPreset,
    materialOverrides: replacedItem.materialOverrides,
  },
  {
    configurationCode: undefined,
    bundleGroupId: undefined,
    bundleRole: undefined,
    bundleQuantity: undefined,
    materialPreset: undefined,
    materialOverrides: undefined,
  },
  "Shopping replacement should clear product-specific compatibility state."
);

const catalogItems = Object.values(CATALOG_ITEMS);
const sourceProduct = CATALOG_ITEMS["armchair-real-castlery-avery-performance-armchair"];
assert.ok(sourceProduct, "Shopping replacement fixture should have a public source armchair.");

const [validSourceItem] = resolveRoomShoppingItems({
  items: [
    {
      instanceId: "shopping-readiness-source",
      productId: sourceProduct.id,
      variantId: sourceProduct.defaultVariantId,
      position: [0, 0, 0],
      rotationY: 0,
      includeInCheckout: true,
    },
  ],
});
assert.ok(validSourceItem, "Shopping replacement fixture should resolve a source shopping item.");

const brokenSourceItem: ActiveRoomShoppingItem = {
  ...validSourceItem,
  linePrice: 0,
  priceLabel: "Missing price",
  retailerUrl: null,
  retailerStatusLabel: "Retailer link missing",
  commerceMode: "not_buyable",
  cartStatusLabel: "Needs commerce",
  hasValidCommerce: false,
  warningLabel: "Missing validated commerce mapping",
  category: mapToTopCategory(sourceProduct.category, sourceProduct),
};

const readyReplacementSuggestions = buildShoppingReplacementSuggestions({
  item: brokenSourceItem,
  catalogItems,
  roomType: "living",
  limit: 5,
});

assert.ok(
  readyReplacementSuggestions.length > 0,
  "A broken public armchair row should receive real shoppable replacement suggestions."
);
for (const suggestion of readyReplacementSuggestions) {
  assert.notEqual(
    suggestion.productId,
    brokenSourceItem.productId,
    "Replacement suggestions should not point back to the broken source product."
  );
  assert.ok(suggestion.price > 0, `Replacement ${suggestion.productId} should have a positive price.`);
  assert.ok(
    suggestion.retailerUrl && /^https?:\/\//.test(suggestion.retailerUrl),
    `Replacement ${suggestion.productId} should expose a concrete commerce URL.`
  );
}

const invalidReplacementCandidate: CatalogItemSchema = {
  ...sourceProduct,
  id: "qa-invalid-armchair-replacement",
  title: "QA Invalid Armchair Replacement",
  commerce: { type: "affiliate", data: { retailer: "QA", url: "", priceHint: 0 } },
  metadata: { ...(sourceProduct.metadata ?? {}), priceUsd: 0 },
  variants: sourceProduct.variants.map((variant) => ({
    ...variant,
    id: `${variant.id}-qa-invalid`,
    priceHint: 0,
    affiliateUrl: undefined,
    purchaseOptions: variant.purchaseOptions?.map((option) => ({
      ...option,
      id: `${option.id}-qa-invalid`,
      affiliateUrl: undefined,
      priceHint: 0,
    })),
  })),
};

const suggestionsWithInvalidCandidate = buildShoppingReplacementSuggestions({
  item: brokenSourceItem,
  catalogItems: [invalidReplacementCandidate, ...catalogItems],
  roomType: "living",
  limit: 10,
});

assert.ok(
  suggestionsWithInvalidCandidate.length > 0,
  "Invalid replacement candidate fixture should not prevent valid suggestions from appearing."
);
assert.ok(
  suggestionsWithInvalidCandidate.every(
    (suggestion) => suggestion.productId !== invalidReplacementCandidate.id
  ),
  "Replacement suggestions must exclude products without a valid price and commerce URL."
);

console.log("Shopping readiness polish checks passed.");
