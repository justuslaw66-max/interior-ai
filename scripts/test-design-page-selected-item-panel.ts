import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildDesignPagePanelRegionAdapter } from "../lib/design-page-panel-region-adapter";
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
const panelRegionSource = readSource(
  "components/editor/design-page/DesignPagePanelRegion.tsx",
);
const controllerSource = readSource(
  "lib/useDesignPageSelectedItemPanelController.ts",
);
const finishControlsSource = readSource(
  "components/editor/design-page/ProductFinishControls.tsx",
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
  /max-h-\[calc\(100vh-6rem\)\][^"`]*overflow-y-auto/,
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

for (const label of [
  "Swap to cheaper",
  "Upgrade this item",
  "View retailer",
  "Buy now",
  "Needs commerce review",
  "Lock",
  "Unlock",
  "Remove",
] as const) {
  assert.match(
    panelSource,
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
