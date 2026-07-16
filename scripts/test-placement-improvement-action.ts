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
  /const pendingCatalogPlacementImprovement = useMemo/,
  "placement preview should derive a best-scored nearby improvement"
);
assert.match(
  catalogPlacementHook,
  /scoreDelta < 4/,
  "improvement action should avoid noisy tiny score changes"
);
assert.match(
  catalogPlacementHook,
  /const improvePendingCatalogPlacement = useCallback/,
  "placement preview should expose an action for applying the improvement"
);
assert.match(
  confirmPanel,
  /data-testid="catalog-placement-improvement-hint"/,
  "placement score card should explain the better nearby spot"
);
assert.match(
  confirmPanel,
  /data-testid="catalog-placement-improve"/,
  "placement action row should expose the improve placement button"
);
assert.match(
  catalogPlacementHook,
  /Improved placement to \$\{pendingCatalogPlacementImprovement\.score\}\/100/,
  "improvement action should confirm the new score"
);

console.log("Placement improvement action checks passed");
