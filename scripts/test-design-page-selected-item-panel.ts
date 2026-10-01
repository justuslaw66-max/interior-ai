import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID,
  CASTLERY_CONFIGURATION_ICON_FALLBACK,
  getCastleryConfigurationIconDescriptor,
} from "../components/editor/design-page/castleryConfigurationIcons";
import { buildDesignPagePanelRegionAdapter } from "../lib/design-page-panel-region-adapter";
import {
  MODEL_FAMILY_BY_PRODUCT_ID,
  MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID,
  MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID,
} from "../lib/design-page-model-maps";
import { buildDesignPageSelectionPanelModels } from "../lib/design-page-selection-panel-model";
import { CATALOG_ITEMS } from "../lib/catalog";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx",
);
const panelSource = readSource(
  "components/editor/design-page/SelectedItemPanel.tsx",
);
const detailsPanelSource = readSource(
  "components/editor/SelectedItemDetailsPanel.tsx",
);
const summaryCardSource = readSource(
  "components/editor/design-page/SelectedItemSummaryCard.tsx",
);
const quickActionsSource = readSource(
  "components/editor/design-page/SelectedItemQuickActions.tsx",
);
const selectionModelSource = readSource("lib/design-page-selection-panel-model.ts");
const selectedItemSource = `${panelSource}\n${detailsPanelSource}\n${summaryCardSource}\n${quickActionsSource}`;
const panelRegionSource = readSource(
  "components/editor/design-page/DesignPagePanelRegion.tsx",
);
const controllerSource = readSource(
  "lib/useDesignPageSelectedItemPanelController.ts",
);
const finishControlsSource = readSource(
  "components/editor/design-page/ProductFinishControls.tsx",
);
const modelVariantControlsSource = readSource(
  "components/editor/design-page/ProductModelVariantControls.tsx",
);

assert.match(
  workspaceSource,
  /import\s+\{\s*(?:CanvasBehindPage,\s*)?DesignPagePanelRegion\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPagePanelRegion"/,
  "The workspace should import the fixed panel region.",
);
assert.match(
  panelRegionSource,
  /import\s+\{[\s\S]*?SelectedItemPanel[\s\S]*?from\s+"@\/components\/editor\/design-page\/SelectedItemPanel"/,
  "The panel region should import the selected-item leaf it owns.",
);
assert.match(
  panelRegionSource,
  /\{state\.selectedItem\s*\?\s*<SelectedItemPanel\s+\{\.\.\.state\.selectedItem\}\s*\/>\s*:\s*null\}/,
  "The panel region should own the selected-item leaf composition.",
);
assert.match(
  workspaceSource,
  /<DesignPagePanelRegion\s+\{\.\.\.panelRegionModel\}(?:\s+planTools=\{presentExportDialog\})?\s*\/>/,
  "The workspace should compose the panel region through its typed model (and the plan's tools, UX 4e).",
);
assert.doesNotMatch(
  workspaceSource,
  /(?:import[\s\S]*?from\s+"@\/components\/editor\/design-page\/SelectedItemPanel"|<SelectedItemPanel\b)/,
  "The workspace should not retain selected-item leaf ownership.",
);

const toggleLock = () => undefined;
const removeItem = () => undefined;
const deselect = () => undefined;
const noop = () => undefined;
const castleryProduct = Object.values(CATALOG_ITEMS).find(
  (product) => product.commerce.type === "affiliate" && product.commerce.data.url && product.commerce.data.priceHint,
)!;
assert.ok(castleryProduct, "The local catalogue has a product sold by a shop, with a price.");
const buildSelectionModels = (rotationEnabled: boolean) =>
  buildDesignPageSelectionPanelModels({
    cabinet: { state: { cabinet: {}, project: {} }, configuration: {}, actions: {} },
    item: {
      state: {
        document: { rooms: [], activeRoomId: null },
        details: {
          product: castleryProduct,
          item: {
            instanceId: "selected-item",
            productId: castleryProduct.id,
            variantId: castleryProduct.defaultVariantId,
            position: [0, 0, 0],
          },
          measurementUnit: "cm",
        },
        summarySource: { style: "modern", planningDimensionsMm: { w: 705, d: 850, h: 850 } },
        rotation: { enabled: rotationEnabled, state: { selectedRotationDegrees: 45 } },
        productModelVariants: {},
        productFinishes: {},
        inspectionController: {
          state: {
            showInspectorDetails: false,
            showFullDimensions: false,
            showDeliveryWarranty: false,
            showRotationControls: true,
            selectedItemLockLabel: "Lock",
          },
          adjustableHangingHeight: null,
        },
      },
      configuration: {},
      actions: {
        inspectionController: {
          toggleSelectedItemDetails: noop,
          toggleSelectedItemDimensions: noop,
          toggleSelectedItemDeliveryWarranty: noop,
          toggleSelectedItemRotationControls: noop,
          setSelectedItemPosition: noop,
          applySelectedItemStyleAlternative: noop,
          swapSelectedItemToCheaper: noop,
          swapSelectedItemToPricier: noop,
          openSelectedItemCommerce: noop,
          toggleSelectedItemLock: toggleLock,
        },
        placement: { onDelete: removeItem, onDuplicate: noop },
        selection: { clearAllSelection: deselect },
        rotation: {},
        productConfiguration: { model: {}, finish: {}, selectVariant: noop },
      },
    },
  } as unknown as Parameters<typeof buildDesignPageSelectionPanelModels>[0]);

const selectionModels = buildSelectionModels(true);
assert.equal(selectionModels.selectedItem.state.details.product.id, castleryProduct.id);
assert.equal(selectionModels.selectedItem.state.rotation?.selectedRotationDegrees, 45);
assert.strictEqual(selectionModels.selectedItem.actions.onToggleLock, toggleLock);
// One Remove for a product (UX audit ED3, FU12): the placement's delete, with its lock check.
assert.strictEqual(selectionModels.selectedItem.actions.onRemove, removeItem);
assert.strictEqual(selectionModels.selectedItem.actions.onDeselect, deselect);
// The summary: the product's own words, its size in the design's units.
const summary = selectionModels.selectedItem.state.summary;
assert.equal(summary.title, castleryProduct.title);
assert.equal(summary.sale.kind, "retailer");
assert.match(summary.priceLabel, /^S\$[\d,]+$/);
assert.equal(summary.sizeLabel, "70.5 W × 85 D × 85 H cm");
assert.equal(
  buildSelectionModels(false).selectedItem.state.rotation,
  null,
  "the pure selection-panel model should omit rotation without a concrete selected item.",
);

const panelModelInput = {
  state: {
    editorMode: "adjust",
    shoppingVisible: false,
    controlsVisible: false,
    hasSelectedCabinet: false,
    hasSelectedProduct: true,
  },
  configuration: {
    designerTheme: false,
    isDesigner: false,
    isClientPreview: true,
  },
  panels: {
    shopping: {},
    selectedCabinet: {},
    selectedItem: selectionModels.selectedItem,
    controls: {},
  },
  actions: { exitClientPreview: noop },
} as unknown as Parameters<typeof buildDesignPagePanelRegionAdapter>[0];
assert.strictEqual(
  buildDesignPagePanelRegionAdapter(panelModelInput).state.selectedItem,
  selectionModels.selectedItem,
  "client preview should keep the Adjust-mode panel mounted for its leaf-level aria and opacity policy.",
);
assert.equal(
  buildDesignPagePanelRegionAdapter({
    ...panelModelInput,
    state: { ...panelModelInput.state, editorMode: "design" },
  }).state.selectedItem,
  null,
  "the pure panel adapter should gate selected-item composition to Adjust mode.",
);

for (const callbackName of ["onToggleLock", "onRemove", "onDeselect", "onViewProduct", "onDuplicate"] as const) {
  assert.match(
    panelSource,
    new RegExp(`actions\\.${callbackName}\\b`),
    `The panel should invoke the passed ${callbackName} callback.`,
  );
}

const toggleLockSource = controllerSource.slice(
  controllerSource.indexOf("const toggleSelectedItemLock"),
  controllerSource.indexOf("const selectedItemLockLabel"),
);
assert.match(
  toggleLockSource,
  /getSelectedIds\(\)[\s\S]*?getItems\(\)[\s\S]*?commitItems\(/,
  "Locking should keep click-time multi-selection ref reads in the controller callback.",
);
assert.doesNotMatch(
  controllerSource,
  /removeSelectedItemFromDesign/,
  "The panel's second remove path (unnamed, no lock check) is gone: Remove is the placement's delete.",
);
assert.match(
  selectionModelSource,
  /const \{ onDuplicate, onDelete, \.\.\.placementDetails \} = item\.actions\.placement;[\s\S]*onRemove: onDelete,/,
  "The item panel's Remove should be the placement's delete.",
);

for (const callbackName of [
  "toggleSelectedItemLock",
] as const) {
  assert.match(
    controllerSource,
    new RegExp(`const ${callbackName} = useCallback`),
    `${callbackName} should be owned by the selected-item controller.`,
  );
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`const ${callbackName} = useCallback`),
    `${callbackName} should not remain inline in the workspace.`,
  );
}

assert.doesNotMatch(
  panelSource,
  /\b(?:itemsRef|selectedIdsRef|primaryIdRef|commitItems|updateSelection)\b/,
  "Selection refs and item mutations should remain outside the presentation component.",
);

assert.match(
  panelSource,
  /data-testid="selected-item-panel"/,
  "The extracted panel should preserve its stable test id.",
);
assert.match(
  panelSource,
  /right-4 top-bar-17 z-40 md:top-bar-6 w-\[320px\] max-h-\[calc\(100vh-12\.75rem-env\(safe-area-inset-bottom\)\)\][^"`]*overflow-y-auto[^"`]*md:max-h-\[calc\(100vh-var\(--editor-bar-h\)-2\.5rem\)\]/,
  "The panel should preserve its bounded scrolling container: on phones under the canvas pills and clear of the step bar.",
);
assert.match(
  panelSource,
  /\bisClientPreview\s*\?\s*"pointer-events-none opacity-0"\s*:\s*"opacity-100"/,
  "Client preview should keep the panel mounted but visually and interactively hidden.",
);
assert.match(
  panelSource,
  /aria-hidden=\{isClientPreview\}/,
  "The mounted client-preview panel should remain hidden from assistive technology.",
);
assert.doesNotMatch(
  panelSource,
  /if\s*\(\s*isClientPreview\s*\)\s*return\s+null/,
  "Client preview should not unmount the selected-item panel.",
);
assert.match(
  panelSource,
  /sticky top-0 z-20 -mx-4 -mt-4[^"`]*border-b[^"`]*px-4 py-2/,
  "The Selected heading should remain sticky while the panel scrolls.",
);
// As in the Furnish mockup (UX audit FU12): "Selected" and a Deselect (×), no collapsed summary.
assert.match(
  panelSource,
  />Selected<\/span>[\s\S]*data-testid="selected-item-deselect"[\s\S]*aria-label=\{`Deselect \$\{title\}`\}[\s\S]*onClick=\{onDeselect\}/,
  "The panel should say Selected and offer a named Deselect.",
);
assert.doesNotMatch(panelSource, /selected-item-panel-collapse|selected-item-panel-summary|Selected Item/);
// Where it's sold, in the app's words.
assert.match(
  summaryCardSource,
  /data-testid="selected-item-availability"[\s\S]*?Sold by \{sale\.retailer\}[\s\S]*?aria-label=\{`View product at \$\{sale\.retailer\}`\}[\s\S]*?onClick=\{onViewProduct\}[\s\S]*?View product/,
  "A product sold by a shop should read \"Sold by <shop> · View product\".",
);
assert.match(summaryCardSource, /"Checkout here, from your Shopping list" : "Not sold online yet"/);
assert.match(panelSource, /onViewProduct=\{actions\.onViewProduct\}/);
for (const retired of ["External retailer", "Check stock", "View retailer", "Needs commerce review", "Buy now"]) {
  assert.ok(
    !`${panelSource}\n${detailsPanelSource}\n${summaryCardSource}\n${quickActionsSource}`
      .replace(/\/\*\*[\s\S]*?\*\//g, "")
      .includes(retired),
    `The item panel should not say "${retired.trim()}" (the shop's own words; UX audit FU12).`,
  );
}
// One Remove: Rotate, Duplicate and Remove in one row, and no Delete left in the details.
assert.match(
  quickActionsSource,
  /data-testid="rotation-controls-toggle"[\s\S]*?aria-expanded=\{rotationOpen\}[\s\S]*?Rotate[\s\S]*?data-testid="selected-item-duplicate"[\s\S]*?Duplicate[\s\S]*?data-testid="selected-item-delete"[\s\S]*?onClick=\{onRemove\}[\s\S]*?Remove/,
  "Rotate, Duplicate and Remove should sit in one row, in that order.",
);
assert.doesNotMatch(
  detailsPanelSource,
  /selected-item-delete|selected-item-duplicate|rotation-controls-toggle|>\s*Delete\s*</,
  "The details keep the placement tools only: no second Delete, Duplicate or Rotation toggle.",
);
// Named swaps: what it swaps to, and what that costs.
assert.match(
  quickActionsSource,
  /\{swap\.title\}<\/span>\s*<span className="shrink-0">· \{swap\.priceLabel\}[\s\S]*?label="Swap for cheaper"[\s\S]*?label="Swap for pricier"/,
  "Swaps should name the product they swap to and its price.",
);
assert.match(panelSource, /data-testid="selected-item-dimensions"[\s\S]*?state\.summary\.sizeLabel/);

for (const childName of [
  "SelectedItemDetailsPanel",
  "SelectedItemRotationControls",
  "ProductModelVariantControls",
  "ProductFinishControls",
] as const) {
  assert.match(
    panelSource,
    new RegExp(`<${childName}\\b`),
    `${childName} should remain a direct selected-item panel child.`,
  );
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`<${childName}\\b`),
    `${childName} JSX ownership should move out of the workspace.`,
  );
}
assert.match(
  panelSource,
  /state\.rotation\s*\?\s*\(\s*<SelectedItemRotationControls\b/,
  "Rotation controls should remain conditional on selected-item rotation state.",
);
assert.match(
  modelVariantControlsSource,
  /data-testid=\{`\$\{family\}-configuration-selector`\}[\s\S]*Configuration[\s\S]*configurations/,
  "Mapped Castlery collections should render through the compact configuration selector.",
);
for (const family of ["STANDARD", "L-SHAPED", "U-SHAPED", "ARMCHAIR", "SLEEPER"] as const) {
  assert.match(
    modelVariantControlsSource,
    new RegExp(`label: "${family}"`),
    `The Castlery configuration selector should include the ${family} family.`,
  );
}
assert.match(
  modelVariantControlsSource,
  /data-testid=\{`\$\{family\}-config-option-\$\{option\.key\}`\}[\s\S]*CastleryConfigurationDiagram/,
  "Mapped Castlery configurations should use visual plan cards instead of long text buttons.",
);
assert.match(
  modelVariantControlsSource,
  /getCastleryConfigurationIconDescriptor\(productId\)[\s\S]*<img[\s\S]*src=\{descriptor\.src\}/,
  "Hamilton and Dawson diagrams should render typed local icon descriptors.",
);
assert.match(
  modelVariantControlsSource,
  /filter:\s*active\s*\?\s*"brightness\(0\) invert\(1\)"/,
  "Selected configuration artwork should be recoloured white.",
);
assert.doesNotMatch(
  modelVariantControlsSource,
  /<svg\b|rx="/,
  "Mapped product controls should not retain the rounded procedural SVG fallback.",
);
assert.match(
  modelVariantControlsSource,
  /className="grid grid-cols-4[^"]*"[\s\S]*data-testid=\{`\$\{family\}-configuration-grid`\}/,
  "Castlery configuration cards should remain visible in rows of four without horizontal scrolling.",
);
assert.match(
  modelVariantControlsSource,
  /className=\{`flex h-12 min-w-0/,
  "Castlery configuration cards should retain the compact 48px height.",
);
assert.match(
  modelVariantControlsSource,
  /data-testid=\{`\$\{family\}-orientation-selector`\}[\s\S]*\$\{family\}-orientation-/,
  "Mapped Castlery orientation should use a separate diagram-based selector.",
);
assert.match(
  modelVariantControlsSource,
  /activeCastleryConfigurationGroup === "sleeper"/,
  "Mapped Castlery sleeper products should expose their state control beneath the configuration selector.",
);
const hamiltonFamilyProductIds = [
  "sofa-real-castlery-hamilton-2-seater",
  "sofa-real-castlery-hamilton-2-seater-with-storage-ottoman",
  "sofa-real-castlery-hamilton-3-seater",
  "sofa-real-castlery-hamilton-3-seater-with-storage-ottoman",
  "sofa-real-castlery-hamilton-3-seater-sofa-bed",
  "sofa-real-castlery-hamilton-chaise-sectional-left",
  "sofa-real-castlery-hamilton-chaise-sectional-right",
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left",
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-right",
  "sofa-real-castlery-hamilton-round-chaise-sectional-left",
  "sofa-real-castlery-hamilton-round-chaise-sectional-right",
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left",
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-right",
  "armchair-real-castlery-hamilton-round-swivel-armchair",
  "armchair-real-castlery-hamilton-round-swivel-1-5-seater-armchair",
] as const;
const hamiltonSelectorProductIds = [
  "sofa-real-castlery-hamilton-3-seater",
  "sofa-real-castlery-hamilton-3-seater-with-storage-ottoman",
  "sofa-real-castlery-hamilton-2-seater",
  "sofa-real-castlery-hamilton-2-seater-with-storage-ottoman",
  "sofa-real-castlery-hamilton-round-chaise-sectional-left",
  "sofa-real-castlery-hamilton-chaise-sectional-left",
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left",
  "armchair-real-castlery-hamilton-round-swivel-armchair",
  "armchair-real-castlery-hamilton-round-swivel-1-5-seater-armchair",
  "sofa-real-castlery-hamilton-3-seater-sofa-bed",
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left",
] as const;
const dawsonFamilyProductIds = [
  "sofa-real-castlery-dawson-3s",
  "sofa-real-castlery-dawson-extended-sofa",
  "sofa-real-castlery-dawson-ottoman",
  "sofa-real-castlery-dawson-storage-ottoman",
  "sofa-real-castlery-dawson-wide-chaise-sectional-left",
  "sofa-real-castlery-dawson-wide-chaise-sectional",
  "sofa-real-castlery-dawson-chaise-sectional-left",
  "sofa-real-castlery-dawson-chaise-sectional",
  "sofa-real-castlery-dawson-pit-sectional",
  "sofa-real-castlery-dawson-swivel-armchair",
] as const;
const castleryIconProductIds = [
  ...hamiltonFamilyProductIds,
  ...dawsonFamilyProductIds,
] as const;

for (const productId of castleryIconProductIds) {
  const descriptor = CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[productId];
  assert.ok(descriptor, `${productId} should resolve to a configuration icon.`);
  assert.equal(
    descriptor.fallback,
    undefined,
    `${productId} should not use the missing-asset fallback.`,
  );
  assert.equal(
    existsSync(join(root, "public", descriptor.src.slice(1))),
    true,
    `${productId} should reference an asset that exists in public/.`,
  );
}
const canonicalHamiltonAssetByProductId = {
  "sofa-real-castlery-hamilton-3-seater": "3-seater.avif",
  "sofa-real-castlery-hamilton-3-seater-with-storage-ottoman":
    "3-seater-with-ottoman.avif",
  "sofa-real-castlery-hamilton-2-seater": "2-seater.avif",
  "sofa-real-castlery-hamilton-2-seater-with-storage-ottoman":
    "2-seater-with-ottoman.avif",
  "sofa-real-castlery-hamilton-round-chaise-sectional-left":
    "round-chaise-left.avif",
  "sofa-real-castlery-hamilton-chaise-sectional-left": "chaise-left.avif",
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left":
    "chaise-with-ottoman-left.avif",
  "armchair-real-castlery-hamilton-round-swivel-armchair":
    "round-swivel-armchair.avif",
  "armchair-real-castlery-hamilton-round-swivel-1-5-seater-armchair":
    "round-swivel-1-5-seater.avif",
  "sofa-real-castlery-hamilton-3-seater-sofa-bed":
    "3-seater-sofa-bed.avif",
  "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left":
    "chaise-sofa-bed-left.avif",
} as const;
for (const [productId, assetName] of Object.entries(
  canonicalHamiltonAssetByProductId,
)) {
  const descriptor = CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[productId];
  assert.equal(
    descriptor.src,
    `/assets/configuration-icons/castlery/hamilton/${assetName}`,
    `${productId} should resolve to its exact locally stored Castlery artwork.`,
  );
  const assetBytes = readFileSync(
    join(root, "public", descriptor.src.slice(1)),
  );
  assert.equal(
    assetBytes.subarray(4, 12).toString("ascii"),
    "ftypavif",
    `${productId} should use the unmodified transparent AVIF delivered by Castlery.`,
  );
}
assert.equal(
  Object.keys(canonicalHamiltonAssetByProductId).length,
  hamiltonSelectorProductIds.length,
  "Every Hamilton selector configuration should have one canonical Castlery asset.",
);
for (const productId of dawsonFamilyProductIds) {
  assert.match(
    CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[productId].src,
    /^\/assets\/configuration-icons\/castlery\/[^/]+\.svg$/,
    `${productId} should retain its local Dawson SVG asset.`,
  );
}
for (const productId of hamiltonFamilyProductIds) {
  assert.deepEqual(
    MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[productId],
    [...hamiltonSelectorProductIds],
    `${productId} should expose Castlery's round-chaise, chaise, and chaise-with-ottoman order.`,
  );
}

for (const [leftProductId, rightProductId] of [
  [
    "sofa-real-castlery-hamilton-chaise-sectional-left",
    "sofa-real-castlery-hamilton-chaise-sectional-right",
  ],
  [
    "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left",
    "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-right",
  ],
  [
    "sofa-real-castlery-hamilton-round-chaise-sectional-left",
    "sofa-real-castlery-hamilton-round-chaise-sectional-right",
  ],
  [
    "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-left",
    "sofa-real-castlery-hamilton-chaise-sectional-sofa-bed-right",
  ],
  [
    "sofa-real-castlery-dawson-wide-chaise-sectional-left",
    "sofa-real-castlery-dawson-wide-chaise-sectional",
  ],
  [
    "sofa-real-castlery-dawson-chaise-sectional-left",
    "sofa-real-castlery-dawson-chaise-sectional",
  ],
] as const) {
  const left = CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[leftProductId];
  const right = CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[rightProductId];
  assert.equal(
    right.src,
    left.src,
    `${rightProductId} should reuse the canonical left-facing asset.`,
  );
  assert.notEqual(
    left.mirror,
    true,
    `${leftProductId} should retain the canonical asset orientation.`,
  );
  assert.equal(
    right.mirror,
    true,
    `${rightProductId} should mirror the canonical left-facing asset.`,
  );
}

assert.equal(
  CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[
    "sofa-real-castlery-dawson-ottoman"
  ].src,
  "/assets/configuration-icons/castlery/ottoman.svg",
  "The Dawson ottoman should use the square top-view artwork.",
);
assert.equal(
  CASTLERY_CONFIGURATION_ICON_BY_PRODUCT_ID[
    "sofa-real-castlery-dawson-storage-ottoman"
  ].src,
  "/assets/configuration-icons/castlery/storage-ottoman.svg",
  "The Dawson storage ottoman should use the square top-view artwork.",
);
assert.strictEqual(
  getCastleryConfigurationIconDescriptor("missing-castlery-product"),
  CASTLERY_CONFIGURATION_ICON_FALLBACK,
  "Unknown configurations should resolve the local missing-asset fallback.",
);
const dawsonSelectorProductIds = [
  "sofa-real-castlery-dawson-3s",
  "sofa-real-castlery-dawson-extended-sofa",
  "sofa-real-castlery-dawson-ottoman",
  "sofa-real-castlery-dawson-storage-ottoman",
  "sofa-real-castlery-dawson-wide-chaise-sectional-left",
  "sofa-real-castlery-dawson-chaise-sectional-left",
  "sofa-real-castlery-dawson-pit-sectional",
  "sofa-real-castlery-dawson-swivel-armchair",
] as const;
for (const productId of dawsonFamilyProductIds) {
  assert.deepEqual(
    MODEL_FAMILY_BY_PRODUCT_ID[productId],
    [...dawsonFamilyProductIds],
    `${productId} should resolve the complete Dawson model family.`,
  );
  assert.deepEqual(
    MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[productId],
    [...dawsonSelectorProductIds],
    `${productId} should expose the eight geometry-backed Dawson configurations.`,
  );
}
assert.equal(
  MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID[
    "sofa-real-castlery-dawson-wide-chaise-sectional"
  ],
  "sofa-real-castlery-dawson-wide-chaise-sectional-left",
  "The right-facing Dawson wide chaise should resolve to its one selector card.",
);
assert.equal(
  MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID[
    "sofa-real-castlery-dawson-chaise-sectional"
  ],
  "sofa-real-castlery-dawson-chaise-sectional-left",
  "The right-facing Dawson chaise should resolve to its one selector card.",
);

for (const label of [
  "Swap for cheaper",
  "Swap for pricier",
  "Sold by",
  "View product",
  "Rotate",
  "Duplicate",
  "Remove",
] as const) {
  assert.match(
    selectedItemSource,
    new RegExp(label),
    `The selected-item panel should keep the ${label} copy.`,
  );
}
for (const [prop, callbackName] of [
  ["onSwapToCheaper", "onSwapToCheaper"],
  ["onSwapToPricier", "onSwapToPricier"],
  ["onToggleLock", "onToggleLock"],
  ["onRemove", "onRemove"],
  ["onDuplicate", "onDuplicate"],
  ["onRotate", "onToggleRotation"],
  ["onDeselect", "onDeselect"],
] as const) {
  assert.match(
    panelSource,
    new RegExp(`${prop}=\\{actions\\.${callbackName}\\}`),
    `${callbackName} should remain a passed callback.`,
  );
}
assert.match(panelSource, /lockLabel=\{state\.lockLabel\}/);
assert.match(
  panelSource,
  /onClick=\{onToggleLock\}[\s\S]*?\{lockLabel\}/,
  "The lock button should render the workspace-derived selection label.",
);

assert.doesNotMatch(
  workspaceSource,
  /data-testid="selected-item-panel"/,
  "The selected-item panel test-id should have one owner.",
);

assert.doesNotMatch(
  panelSource,
  /\bcreatePortal\b/,
  "The parent panel should not absorb the material preview portal.",
);
assert.match(
  finishControlsSource,
  /import\s+\{\s*createPortal\s*\}\s+from\s+"react-dom"/,
  "ProductFinishControls should continue to own material preview portal rendering.",
);
assert.match(
  finishControlsSource,
  /state\.structuredColour\.preview[\s\S]{0,160}\?\s*createPortal\(/,
  "Structured-colour previews should still portal from ProductFinishControls.",
);

console.log("Design-page selected-item panel ownership checks passed.");
