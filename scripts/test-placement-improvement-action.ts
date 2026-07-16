import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findCatalogPlacementImprovement } from "@/lib/catalog-placement-policy";
import {
  makePolicyPlacement,
  makePolicyRoom,
  makePolicyScore,
} from "./catalog-placement-policy-test-utils";

const room = makePolicyRoom("room-current");
const pendingPlacement = makePolicyPlacement({ position: [0, 0, 0] });
const improvedPlacement = makePolicyPlacement({ position: [1, 0, 0] });

const improvement = findCatalogPlacementImprovement({
  pendingPlacement,
  currentScore: makePolicyScore(70, "okay"),
  targetRoom: room,
  findPlacement: () => improvedPlacement,
  scorePlacement: () => makePolicyScore(85),
});
assert.ok(improvement);
assert.equal(improvement.score, 85);
assert.equal(improvement.scoreDelta, 15);
assert.match(improvement.placement.reason, /Improved placement \(85\/100\)/);

assert.equal(
  findCatalogPlacementImprovement({
    pendingPlacement,
    currentScore: makePolicyScore(82),
    targetRoom: room,
    findPlacement: () => improvedPlacement,
    scorePlacement: () => makePolicyScore(85),
  }),
  null,
  "score gains below four points should be ignored"
);

assert.equal(
  findCatalogPlacementImprovement({
    pendingPlacement,
    currentScore: makePolicyScore(60),
    targetRoom: room,
    findPlacement: () => makePolicyPlacement({ position: [0.02, 0, 0.02] }),
    scorePlacement: () => makePolicyScore(90),
  }),
  null,
  "a recommendation should move or rotate the placement meaningfully"
);

const hookSource = readFileSync(
  join(process.cwd(), "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const confirmPanelSource = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/CatalogPlacementConfirmPanel.tsx"
  ),
  "utf8"
);

assert.match(hookSource, /findCatalogPlacementImprovement\(\{/);
assert.match(hookSource, /improvePendingCatalogPlacement/);
assert.match(confirmPanelSource, /data-testid="catalog-placement-improvement-hint"/);
assert.match(confirmPanelSource, /data-testid="catalog-placement-improve"/);

console.log("Placement improvement action checks passed");
