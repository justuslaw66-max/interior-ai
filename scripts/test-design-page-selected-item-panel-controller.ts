import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getDesignPageSelectedItemCommerceTarget,
  getDesignPageSelectedItemCommerceType,
  getDesignPageSelectedItemLockLabel,
} from "@/lib/useDesignPageSelectedItemPanelController";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const controllerSource = readSource(
  "lib/useDesignPageSelectedItemPanelController.ts"
);
const itemInteractionFacadeSource = readSource(
  "lib/useDesignPageItemInteractionFacade.ts"
);
const placementSelectionFacadeSource = readSource(
  "lib/useDesignPagePlacementSelectionWorkspaceFacade.ts"
);

function sourceBetween(
  source: string,
  startMarker: string,
  endMarker: string
): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Expected source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Expected source marker: ${endMarker}`);
  return source.slice(start, end);
}

function assertIncludes(
  source: string,
  expected: string,
  message: string
): void {
  assert.ok(source.includes(expected), message);
}

assert.equal(
  getDesignPageSelectedItemLockLabel({
    selectedCount: 0,
    items: [],
    selectedIds: new Set(),
    selectedItem: null,
  }),
  "Lock",
  "An empty selection should use the default single-item lock label."
);

assert.equal(
  getDesignPageSelectedItemLockLabel({
    selectedCount: 1,
    items: [{ instanceId: "chair-1", locked: false }],
    selectedIds: new Set(["chair-1"]),
    selectedItem: { locked: false },
  }),
  "Lock",
  "An unlocked single selection should offer Lock."
);

assert.equal(
  getDesignPageSelectedItemLockLabel({
    selectedCount: 1,
    items: [{ instanceId: "chair-1", locked: true }],
    selectedIds: new Set(["chair-1"]),
    selectedItem: { locked: true },
  }),
  "Unlock",
  "A locked single selection should offer Unlock."
);

const multiSelectedIds = new Set(["chair-1", "table-1"]);
assert.equal(
  getDesignPageSelectedItemLockLabel({
    selectedCount: multiSelectedIds.size,
    items: [
      { instanceId: "chair-1", locked: true },
      { instanceId: "table-1", locked: true },
      { instanceId: "unselected-rug", locked: false },
    ],
    selectedIds: multiSelectedIds,
    selectedItem: { locked: true },
  }),
  "Unlock selected",
  "A fully locked multi-selection should ignore unlocked items outside the selection."
);

assert.equal(
  getDesignPageSelectedItemLockLabel({
    selectedCount: multiSelectedIds.size,
    items: [
      { instanceId: "chair-1", locked: true },
      { instanceId: "table-1", locked: false },
    ],
    selectedIds: multiSelectedIds,
    selectedItem: { locked: true },
  }),
  "Lock selected",
  "A mixed multi-selection should offer to lock the whole selection."
);

const affiliateVariant = {
  commerce: {
    type: "affiliate" as const,
    url: "https://retailer.example/products/chair",
    retailer: "Fixture Retailer",
    priceHint: 499,
    available: true,
  },
};
const shopifyVariant = {
  commerce: {
    type: "shopify" as const,
    productId: "shopify-product",
    variantId: "shopify-variant",
    available: true,
  },
};
const unavailableVariant = {
  commerce: {
    type: "not_buyable" as const,
    reason: "Fixture has no validated commerce mapping",
    available: false as const,
  },
};

assert.equal(
  getDesignPageSelectedItemCommerceType(affiliateVariant),
  "affiliate"
);
assert.equal(
  getDesignPageSelectedItemCommerceType(shopifyVariant),
  "shopify"
);
assert.equal(
  getDesignPageSelectedItemCommerceType(unavailableVariant),
  "not_buyable"
);
assert.equal(
  getDesignPageSelectedItemCommerceType(null),
  "not_buyable",
  "A missing resolved variant should remain non-buyable."
);

assert.deepEqual(
  getDesignPageSelectedItemCommerceTarget({
    product: { id: "catalog-chair" },
    resolvedVariant: affiliateVariant,
  }),
  {
    buyUrl: "https://retailer.example/products/chair",
    retailer: "Fixture Retailer",
  },
  "Affiliate commerce should use the resolved retailer URL and name."
);
assert.deepEqual(
  getDesignPageSelectedItemCommerceTarget({
    product: { id: "catalog-chair" },
    resolvedVariant: shopifyVariant,
  }),
  {
    buyUrl: "https://yoursite.com/products/catalog-chair",
    retailer: null,
  },
  "Shopify commerce should retain the legacy product-route target."
);
assert.deepEqual(
  getDesignPageSelectedItemCommerceTarget({
    product: { id: "catalog-chair" },
    resolvedVariant: unavailableVariant,
  }),
  { buyUrl: "", retailer: null },
  "Non-buyable variants should not expose a commerce target."
);
assert.deepEqual(
  getDesignPageSelectedItemCommerceTarget({
    product: null,
    resolvedVariant: affiliateVariant,
  }),
  { buyUrl: "", retailer: null },
  "A commerce target requires a selected catalog product."
);

assert.match(
  itemInteractionFacadeSource,
  /import\s+\{[^}]*\buseDesignPageSelectedItemPanelController\b[^}]*\}\s+from\s+"@\/lib\/useDesignPageSelectedItemPanelController"/,
  "The item-interaction facade should import the selected-item panel controller."
);
assert.match(
  itemInteractionFacadeSource,
  /useDesignPageSelectedItemPanelController\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The item-interaction facade should compose selected-item actions through grouped contracts."
);
assert.match(
  placementSelectionFacadeSource,
  /useDesignPageItemInteractionFacade\(\{/,
  "The placement/selection workspace facade should compose the item-interaction facade."
);
assert.match(
  workspaceSource,
  /useDesignPagePlacementSelectionWorkspaceFacade\(\{/,
  "The workspace should compose the placement/selection facade."
);

for (const callbackName of [
  "toggleSelectedItemDetails",
  "toggleSelectedItemDimensions",
  "toggleSelectedItemDeliveryWarranty",
  "toggleSelectedItemRotationControls",
  "setSelectedItemPosition",
  "applySelectedItemStyleAlternative",
  "swapSelectedItem",
  "swapSelectedItemToCheaper",
  "upgradeSelectedItem",
  "openSelectedItemCommerce",
  "toggleSelectedItemLock",
  "removeSelectedItemFromDesign",
] as const) {
  assertIncludes(
    controllerSource,
    `const ${callbackName} = useCallback`,
    `${callbackName} should be owned by the selected-item panel controller.`
  );
  assert.ok(
    !workspaceSource.includes(`const ${callbackName} = useCallback`),
    `${callbackName} should no longer be declared inline in the workspace.`
  );
}

const swapSource = sourceBetween(
  controllerSource,
  "const swapSelectedItem = useCallback",
  "const swapSelectedItemToCheaper = useCallback"
);
for (const expected of [
  "findSwapOptions({",
  'direction === "cheaper"',
  '"No cheaper alternatives found"',
  '"No premium alternatives found"',
  "productId: best.id",
  "variantId: best.defaultVariantId",
] as const) {
  assertIncludes(
    swapSource,
    expected,
    `Selected-item swaps should preserve ${expected}.`
  );
}

const commerceSource = sourceBetween(
  controllerSource,
  "const openSelectedItemCommerce = useCallback",
  "const toggleSelectedItemLock = useCallback"
);
for (const expected of [
  'fetch("/api/track/click", {',
  'method: "POST"',
  'headers: { "Content-Type": "application/json" }',
  "designId: designId ?? null",
  "productId: selectedProduct.id",
  "price: getItemPrice(selectedProduct)",
  "retailer",
  "buyUrl",
  "const clickKey = data?.clickKey",
  'url.searchParams.set("clickKey", clickKey)',
  'url.searchParams.set("utm_source", "interior-ai")',
  'url.searchParams.set("utm_medium", "affiliate")',
  'window.open(url.toString(), "_blank", "noopener,noreferrer")',
  'window.open(buyUrl, "_blank", "noopener,noreferrer")',
] as const) {
  assertIncludes(
    commerceSource,
    expected,
    `Selected-item commerce should preserve ${expected}.`
  );
}

const lockSource = sourceBetween(
  controllerSource,
  "const toggleSelectedItemLock = useCallback",
  "const removeSelectedItemFromDesign = useCallback"
);
for (const expected of [
  "const selectedSet = getSelectedIds()",
  "getItems().filter",
  'shouldLock ? "Lock selected" : "Unlock selected"',
  'nextLocked ? "Lock item" : "Unlock item"',
] as const) {
  assertIncludes(
    lockSource,
    expected,
    `Locking should preserve click-time selection behavior for ${expected}.`
  );
}

const removeSource = sourceBetween(
  controllerSource,
  "const removeSelectedItemFromDesign = useCallback",
  "const selectedItemLockLabel ="
);
assert.match(
  removeSource,
  /commitItems\(\(previous\)\s*=>\s*previous\.filter\([\s\S]*?\)\s*\);/,
  "Remove should keep the direct, unlabeled item commit."
);
assert.doesNotMatch(
  removeSource,
  /commitItems\([\s\S]*?,\s*"(?:Remove|Delete)[^"]*"/,
  "Remove should not acquire a new history label during extraction."
);
for (const expected of [
  "const selectedSet = getSelectedIds()",
  "selectedSet.has(selectedItem.instanceId)",
  "const next = new Set(selectedSet)",
  "next.delete(selectedItem.instanceId)",
  "getPrimaryId() === selectedItem.instanceId",
  "Array.from(next)[next.size - 1]",
  "updateSelection(next, nextPrimary)",
] as const) {
  assertIncludes(
    removeSource,
    expected,
    `Remove should preserve selection repair for ${expected}.`
  );
}

for (const [getterName, refRead, contractEntry] of [
  [
    "getSelectedItemPanelSelectedIds",
    "selectedIdsRef.current",
    "getSelectedIds: getSelectedItemPanelSelectedIds",
  ],
  [
    "getSelectedItemPanelItems",
    "itemsRef.current",
    "getItems: getSelectedItemPanelItems",
  ],
  [
    "getSelectedItemPanelPrimaryId",
    "primaryIdRef.current",
    "getPrimaryId: getSelectedItemPanelPrimaryId",
  ],
] as const) {
  assert.match(
    itemInteractionFacadeSource,
    new RegExp(
      `const ${getterName} = useCallback\\([\\s\\S]*?${refRead.replace(
        ".",
        "\\."
      )}[\\s\\S]*?\\[${refRead.split(".")[0]}\\]`
    ),
    `${getterName} should preserve a stable click-time ref read.`
  );
  assertIncludes(
    itemInteractionFacadeSource,
    contractEntry,
    `The controller should receive the stable ref getter ${contractEntry}.`
  );
}

for (const inlineOwnership of [
  "findSwapOptions({",
  'fetch("/api/track/click", {',
  "const selectedItemLockLabel =",
  "const selectedItemCommerceType =",
] as const) {
  assert.ok(
    !workspaceSource.includes(inlineOwnership),
    `The workspace should delegate inline selected-item ownership for ${inlineOwnership}.`
  );
}

console.log("design page selected-item panel controller guardrails passed");
