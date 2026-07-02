import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designPage = readFileSync(join(process.cwd(), "app/design/page.tsx"), "utf8");

assert.match(
  designPage,
  /const pendingCatalogPlacementImprovement = useMemo/,
  "placement preview should derive a best-scored nearby improvement"
);
assert.match(
  designPage,
  /scoreDelta < 4/,
  "improvement action should avoid noisy tiny score changes"
);
assert.match(
  designPage,
  /const improvePendingCatalogPlacement = useCallback/,
  "placement preview should expose an action for applying the improvement"
);
assert.match(
  designPage,
  /data-testid="catalog-placement-improvement-hint"/,
  "placement score card should explain the better nearby spot"
);
assert.match(
  designPage,
  /data-testid="catalog-placement-improve"/,
  "placement action row should expose the improve placement button"
);
assert.match(
  designPage,
  /Improved placement to \$\{pendingCatalogPlacementImprovement\.score\}\/100/,
  "improvement action should confirm the new score"
);

console.log("Placement improvement action checks passed");
