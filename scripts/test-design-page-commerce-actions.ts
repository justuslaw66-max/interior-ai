import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const controllerSource = readFileSync(
  join(root, "lib/useDesignPageCommerceActions.ts"),
  "utf8"
);
const placementWorkspaceSource = readFileSync(
  join(root, "lib/useDesignPagePlacementWorkspaceRegistration.ts"),
  "utf8"
);
const commerceOnboardingSource = readFileSync(
  join(root, "lib/useDesignPageCommerceOnboardingRegistration.ts"),
  "utf8"
);

assert.match(
  workspaceSource,
  /import \{ useDesignPageCommerceOnboardingRegistration \} from "@\/lib\/useDesignPageCommerceOnboardingRegistration";/,
  "The workspace should import commerce actions through their lifecycle owner."
);
assert.match(
  commerceOnboardingSource,
  /useDesignPageCommerceActions\(\{/,
  "The commerce/onboarding registration should mount the focused commerce controller."
);
for (const callbackName of ["addSelectedImportedToRoom"]) {
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`const ${callbackName}\\s*=\\s*useCallback`),
    `The workspace should not retain ${callbackName} implementation ownership.`
  );
}

assert.match(
  placementWorkspaceSource,
  /movePendingCatalogPlacementToBestRoomAction\(\);/,
  "Placement should retain its stable best-room adapter before commerce mounts."
);
const workspaceOrder = [
  "useDesignPagePlacementWorkspaceRegistration({",
  "useDesignPageCommerceOnboardingRegistration({",
  "useDesignPageCabinetryWorkspaceRegistration({",
];
let previousWorkspaceIndex = -1;
for (const marker of workspaceOrder) {
  const index = workspaceSource.indexOf(marker);
  assert.ok(
    index > previousWorkspaceIndex,
    `Commerce registration should preserve its workspace position: ${marker}`
  );
  previousWorkspaceIndex = index;
}

assert.ok(
  commerceOnboardingSource.indexOf("useDesignPageCommerceActions({") <
    commerceOnboardingSource.indexOf(
      "useDesignPageOnboardingRegistrationFacade({"
    ),
  "Commerce should remain mounted before onboarding effects."
);

const importedOrder = [
  "getRelatedProductIds(selectedImportedProductId);",
  "related.forEach((id) => ensureCatalogItem(id));",
  "addToRoom(selectedImportedProductId);",
];
let previousImportedIndex = -1;
for (const marker of importedOrder) {
  const index = controllerSource.indexOf(marker);
  assert.ok(
    index > previousImportedIndex,
    `Imported-catalog action order changed: ${marker}`
  );
  previousImportedIndex = index;
}

// The Selection Tray went with the one Shopping list (UX 3c-2): no cart state, no Tray actions.
assert.equal(existsSync(join(root, "components/ItemCartDrawer.tsx")), false, "The Tray drawer is gone.");
assert.equal(existsSync(join(root, "lib/design-page-item-cart.ts")), false, "The Tray's cart helpers are gone.");
for (const retired of [
  "previewShoppingReplacement",
  "removeFromCart",
  "updateCartQty",
  "clearCart",
  "addAllToRoom",
  "itemCart",
]) {
  assert.doesNotMatch(controllerSource, new RegExp(`\\b${retired}\\b`), `Commerce no longer owns ${retired}.`);
  assert.doesNotMatch(commerceOnboardingSource, new RegExp(`\\b${retired}\\b`), `Commerce registration no longer wires ${retired}.`);
  assert.doesNotMatch(workspaceSource, new RegExp(`\\b${retired}\\b`), `The workspace no longer wires ${retired}.`);
}
for (const relativePath of [
  "lib/useDesignPageCoreShellBaseRegistration.ts",
  "lib/design-page-dialog-layer-model.ts",
  "lib/design-page-dialog-layer-adapter.ts",
  "components/editor/design-page/DesignPageDialogLayer.tsx",
  "lib/useDesignPagePanelMode.ts",
  "lib/useDesignPagePanelActions.ts",
]) {
  assert.doesNotMatch(
    readFileSync(join(root, relativePath), "utf8"),
    /itemCart|ItemCart|setItemCartOpen|toggleItemCart/,
    `${relativePath} keeps no Tray state or wiring.`
  );
}

console.log("Design-page commerce action checks passed.");
