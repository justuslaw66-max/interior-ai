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
const selectedItemSource = `${panelSource}\n${detailsPanelSource}`;
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
  /import\s+\{\s*DesignPagePanelRegion\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPagePanelRegion"/,
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
  /<DesignPagePanelRegion\s+\{\.\.\.panelRegionModel\}\s*\/>/,
  "The workspace should compose the panel region through its typed model.",
);
assert.doesNotMatch(
  workspaceSource,
  /(?:import[\s\S]*?from\s+"@\/components\/editor\/design-page\/SelectedItemPanel"|<SelectedItemPanel\b)/,
  "The workspace should not retain selected-item leaf ownership.",
);

const toggleLock = () => undefined;
const removeItem = () => undefined;
const noop = () => undefined;
const buildSelectionModels = (rotationEnabled: boolean) =>
  buildDesignPageSelectionPanelModels({
    cabinet: { state: { cabinet: {}, project: {} }, configuration: {}, actions: {} },
    item: {
      state: {
        document: { rooms: [], activeRoomId: null },
        details: { product: { id: "selected-product" }, item: { instanceId: "selected-item" } },
        rotation: { enabled: rotationEnabled, state: { selectedRotationDegrees: 45 } },
        productModelVariants: {},
        productFinishes: {},
        inspectionController: {
          state: {
            showInspectorDetails: false,
            showFullDimensions: false,
            showDeliveryWarranty: false,
            showRotationControls: true,
            selectedItemCommerceType: "cart_ready",
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
          upgradeSelectedItem: noop,
          openSelectedItemCommerce: noop,
          toggleSelectedItemLock: toggleLock,
          removeSelectedItemFromDesign: removeItem,
        },
        placement: {},
        rotation: {},
        productConfiguration: { model: {}, finish: {}, selectVariant: noop },
      },
    },
  } as unknown as Parameters<typeof buildDesignPageSelectionPanelModels>[0]);

const selectionModels = buildSelectionModels(true);
assert.equal(selectionModels.selectedItem.state.details.product.id, "selected-product");
assert.equal(selectionModels.selectedItem.state.rotation?.selectedRotationDegrees, 45);
assert.strictEqual(selectionModels.selectedItem.actions.onToggleLock, toggleLock);
assert.strictEqual(selectionModels.selectedItem.actions.onRemove, removeItem);
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

for (const callbackName of ["onToggleLock", "onRemove"] as const) {
  assert.match(
    panelSource,
    new RegExp(`actions\\.${callbackName}\\b`),
    `The panel should invoke the passed ${callbackName} callback.`,
  );
}

const toggleLockSource = controllerSource.slice(
  controllerSource.indexOf("const toggleSelectedItemLock"),
  controllerSource.indexOf("const removeSelectedItemFromDesign"),
);
const removeSource = controllerSource.slice(
  controllerSource.indexOf("const removeSelectedItemFromDesign"),
  controllerSource.indexOf("const selectedItemLockLabel"),
);
assert.match(
  toggleLockSource,
  /getSelectedIds\(\)[\s\S]*?getItems\(\)[\s\S]*?commitItems\(/,
  "Locking should keep click-time multi-selection ref reads in the controller callback.",
);
assert.match(
  removeSource,
  /commitItems\([\s\S]*?getSelectedIds\(\)[\s\S]*?getPrimaryId\(\)[\s\S]*?updateSelection\(/,
  "Removing should keep item and primary-selection mutations in the controller callback.",
);

for (const callbackName of [
  "toggleSelectedItemLock",
  "removeSelectedItemFromDesign",
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
  /max-h-\[calc\(100vh-4\.75rem\)\][^"`]*overflow-y-auto/,
  "The panel should preserve its bounded scrolling container.",
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
  /sticky top-0 z-20 -mx-4 mb-2 border-b[^"`]*px-4 py-2/,
  "The Selected Item heading should remain sticky while the inspector scrolls.",
);
assert.match(
  panelSource,
  /data-testid="selected-item-panel-collapse"[\s\S]*aria-expanded=\{!collapsed\}[\s\S]*Collapse[\s\S]*Expand/,
  "The selected-item inspector should expose an accessible compact-state toggle.",
);
assert.match(
  panelSource,
  /data-collapsed=\{collapsed \? "true" : "false"\}[\s\S]*data-testid="selected-item-panel-summary"[\s\S]*state\.details\.selectedBrand[\s\S]*state\.details\.product\.title/,
  "Collapsed selected-item inspectors should preserve the selected product identity.",
);
assert.match(
  detailsPanelSource,
  /data-testid=\{[\s\S]*?"selected-item-availability"[\s\S]*?External retailer[\s\S]*?Check current stock and delivery at \$\{product\.commerce\.data\.retailer\}[\s\S]*?Check stock/,
  "Affiliate products should place a compact stock action beside the external-retailer badge.",
);
assert.match(
  panelSource,
  /onCheckRetailerStock=\{[\s\S]*?state\.details\.product\.commerce\.type === "affiliate"[\s\S]*?actions\.onOpenCommerce/,
  "The external-retailer stock action should use the selected-item commerce handler.",
);

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
  "Swap to cheaper",
  "Upgrade this item",
  "Check current stock and delivery at",
  "Check stock",
  "View retailer",
  "Buy now",
  "Needs commerce review",
  "Lock",
  "Unlock",
  "Remove",
] as const) {
  assert.match(
    selectedItemSource,
    new RegExp(label),
    `The selected-item panel should preserve the ${label} commerce/action copy.`,
  );
}
for (const callbackName of [
  "onSwapToCheaper",
  "onUpgradeItem",
  "onOpenCommerce",
  "onToggleLock",
  "onRemove",
] as const) {
  assert.match(
    panelSource,
    new RegExp(`onClick=\\{actions\\.${callbackName}\\}`),
    `${callbackName} should remain a passed button callback.`,
  );
}
assert.match(
  panelSource,
  /\{state\.lockLabel\}/,
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
