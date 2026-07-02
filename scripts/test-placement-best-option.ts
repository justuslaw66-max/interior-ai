import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designPage = readFileSync(join(process.cwd(), "app/design/page.tsx"), "utf8");

assert.match(
  designPage,
  /const pendingCatalogBestVariantPlacement = useMemo/,
  "placement preview should derive the best-scored variant recommendation"
);
assert.match(
  designPage,
  /if \(variant\.id === currentVariant\.variantId\) continue/,
  "best-option recommendation should skip the current variant"
);
assert.match(
  designPage,
  /score\.kind === "blocks_path" \|\| score\.kind === "cramped"/,
  "best-option recommendation should skip blocked or cramped variants"
);
assert.match(
  designPage,
  /best\.scoreDelta < 4/,
  "best-option recommendation should avoid noisy tiny score gains"
);
assert.match(
  designPage,
  /const switchPendingCatalogPlacementToBestOption = useCallback/,
  "placement panel should expose an action for switching to the best option"
);
assert.match(
  designPage,
  /data-testid="catalog-placement-best-option-hint"/,
  "placement score card should explain the best-option recommendation"
);
assert.match(
  designPage,
  /data-testid="catalog-placement-best-option"/,
  "placement action row should expose the best-option button"
);
assert.match(
  designPage,
  /Switched to \$\{pendingCatalogBestVariantPlacement\.variantLabel\}/,
  "best-option action should confirm the selected variant"
);

console.log("Placement best-option checks passed");
