import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const catalogPlacementHook = readFileSync(
  join(process.cwd(), "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const confirmPanel = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/CatalogPlacementConfirmPanel.tsx"
  ),
  "utf8"
);

assert.match(
  catalogPlacementHook,
  /const pendingCatalogBestVariantPlacement = useMemo/,
  "placement preview should derive the best-scored variant recommendation"
);
assert.match(
  catalogPlacementHook,
  /if \(variant\.id === currentVariant\.variantId\) continue/,
  "best-option recommendation should skip the current variant"
);
assert.match(
  catalogPlacementHook,
  /score\.kind === "blocks_path" \|\| score\.kind === "cramped"/,
  "best-option recommendation should skip blocked or cramped variants"
);
assert.match(
  catalogPlacementHook,
  /best\.scoreDelta < 4/,
  "best-option recommendation should avoid noisy tiny score gains"
);
assert.match(
  catalogPlacementHook,
  /const switchPendingCatalogPlacementToBestOption = useCallback/,
  "placement panel should expose an action for switching to the best option"
);
assert.match(
  confirmPanel,
  /data-testid="catalog-placement-best-option-hint"/,
  "placement score card should explain the best-option recommendation"
);
assert.match(
  confirmPanel,
  /data-testid="catalog-placement-best-option"/,
  "placement action row should expose the best-option button"
);
assert.match(
  catalogPlacementHook,
  /Switched to \$\{pendingCatalogBestVariantPlacement\.variantLabel\}/,
  "best-option action should confirm the selected variant"
);

console.log("Placement best-option checks passed");
