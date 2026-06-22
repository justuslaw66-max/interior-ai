import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  join(process.cwd(), "app/design/page.tsx"),
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
  /const swapShoppingItemReplacement = useCallback/,
  "Shopping replacement swaps should be wired to live design item updates."
);
assert.match(
  designPageSource,
  /position|rotationY/,
  "Replacement swaps should preserve the existing design item placement fields by spreading the item."
);

console.log("Shopping readiness polish checks passed.");
