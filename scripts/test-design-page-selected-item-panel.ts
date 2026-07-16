import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx",
);
const panelSource = readSource(
  "components/editor/design-page/SelectedItemPanel.tsx",
);
const controllerSource = readSource(
  "lib/useDesignPageSelectedItemPanelController.ts",
);
const finishControlsSource = readSource(
  "components/editor/design-page/ProductFinishControls.tsx",
);

assert.match(
  workspaceSource,
  /import\s+\{\s*SelectedItemPanel\s*\}\s+from\s+"@\/components\/editor\/design-page\/SelectedItemPanel"/,
  "The workspace should import the extracted selected-item panel.",
);
assert.match(
  workspaceSource,
  /\{editorMode\s*===\s*"adjust"\s*&&\s*selectedProduct\s*&&\s*\(\s*<SelectedItemPanel\b/,
  "The workspace should compose the panel only for an Adjust-mode product selection.",
);

const compositionStart = workspaceSource.indexOf("<SelectedItemPanel");
assert.notEqual(compositionStart, -1, "The workspace should render SelectedItemPanel.");
const compositionEnd = workspaceSource.indexOf("/>", compositionStart);
assert.notEqual(compositionEnd, -1, "SelectedItemPanel should be a leaf composition boundary.");
const compositionSource = workspaceSource.slice(compositionStart, compositionEnd + 2);

assert.match(
  compositionSource,
  /product:\s*selectedProduct\b/,
  "The selected product should remain the details-panel product.",
);
assert.match(
  compositionSource,
  /rotation:\s*selectedItem\s*\?/,
  "The workspace should provide rotation state only for a concrete selected item.",
);

for (const callbackName of ["onToggleLock", "onRemove"] as const) {
  assert.match(
    compositionSource,
    new RegExp(`${callbackName}\\s*:`),
    `The workspace should pass ${callbackName} through the panel action contract.`,
  );
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
