import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getDesignPageItemCartQuantity,
  removeDesignPageItemCartProduct,
  updateDesignPageItemCartQuantity,
  type DesignPageItemCartEntry,
} from "../lib/design-page-item-cart";

const cart: DesignPageItemCartEntry[] = [
  { id: "a-1", productId: "product-a", title: "A one", qty: 2 },
  { id: "b-1", productId: "product-b", title: "B", qty: 3 },
  { id: "a-2", productId: "product-a", title: "A two", qty: 1 },
];

const removed = removeDesignPageItemCartProduct(cart, "product-a");
assert.deepEqual(removed, [cart[1]]);
assert.equal(cart.length, 3, "Removing a product must not mutate the prior cart.");

const updated = updateDesignPageItemCartQuantity(cart, "product-a", 4);
assert.deepEqual(
  updated.map((item) => item.qty),
  [4, 3, 4],
  "Quantity updates should continue applying to every matching product row."
);
assert.equal(updated[1], cart[1], "Unmatched cart rows should retain identity.");
assert.notEqual(updated[0], cart[0], "Updated cart rows should be copied.");
assert.equal(cart[0]?.qty, 2, "Quantity updates must not mutate the prior cart.");
assert.equal(
  getDesignPageItemCartQuantity(cart),
  6,
  "Cart quantity should remain the raw sum used by the partial-fit warning."
);

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
for (const callbackName of [
  "previewShoppingReplacement",
  "addSelectedImportedToRoom",
  "removeFromCart",
  "updateCartQty",
  "clearCart",
  "addAllToRoom",
]) {
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

const previewOrder = [
  "goFurnish();",
  "previewPlacement(productId, variantId);",
  'showToast("Previewing replacement placement");',
];
let previousPreviewIndex = -1;
for (const marker of previewOrder) {
  const index = controllerSource.indexOf(marker);
  assert.ok(index > previousPreviewIndex, `Preview action order changed: ${marker}`);
  previousPreviewIndex = index;
}

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

assert.match(
  controllerSource,
  /if \(qty <= 0\) \{[\s\S]*?removeFromCart\(productId\);/,
  "Non-positive quantity updates should continue removing the product."
);
assert.match(
  controllerSource,
  /showToast\("Some cart items could not fit in this room\."\);[\s\S]*?clearCart\(\);[\s\S]*?setOpen\(false\);/,
  "Add-all should preserve its warning copy and clear/close ordering."
);

console.log("Design-page commerce action checks passed.");
