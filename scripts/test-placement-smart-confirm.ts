import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveCatalogPlacementAssessment,
  resolveCatalogPlacementConfirmation,
  type CatalogPlacementImprovement,
} from "@/lib/catalog-placement-policy";
import {
  makePolicyPlacement,
  makePolicyScore,
} from "./catalog-placement-policy-test-utils";

const pendingPlacement = makePolicyPlacement({ position: [1.5, 0, 0] });
const improvedPlacement = makePolicyPlacement({ position: [0, 0, 0] });
const restoredPlacement = makePolicyPlacement({ position: [-1, 0, 0] });
const blockedScore = makePolicyScore(
  25,
  "blocks_path",
  "Move away from the walking path"
);
const improvement: CatalogPlacementImprovement = {
  placement: improvedPlacement,
  score: 88,
  scoreDelta: 63,
};

const improvedAssessment = resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked: false,
  blockerLabel: null,
  targetRoomName: "Living room",
  score: blockedScore,
  improvement,
  restorablePlacement: restoredPlacement,
});
assert.equal(improvedAssessment.shouldConfirmImproved, true);
assert.equal(improvedAssessment.shouldConfirmRestored, false);
const improvedDecision = resolveCatalogPlacementConfirmation({
  pendingPlacement,
  improvement,
  restorablePlacement: restoredPlacement,
  assessment: improvedAssessment,
  score: blockedScore,
  blockerLabel: null,
});
assert.equal(improvedDecision.source, "improved");
assert.equal(improvedDecision.placement, improvedPlacement);

const restoredAssessment = resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked: false,
  blockerLabel: null,
  targetRoomName: "Living room",
  score: blockedScore,
  improvement: null,
  restorablePlacement: restoredPlacement,
});
const restoredDecision = resolveCatalogPlacementConfirmation({
  pendingPlacement,
  improvement: null,
  restorablePlacement: restoredPlacement,
  assessment: restoredAssessment,
  score: blockedScore,
  blockerLabel: null,
});
assert.equal(restoredDecision.source, "restored");
assert.equal(restoredDecision.placement, restoredPlacement);

const blockedAssessment = resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked: false,
  blockerLabel: null,
  targetRoomName: "Living room",
  score: blockedScore,
  improvement: null,
  restorablePlacement: null,
});
const blockedDecision = resolveCatalogPlacementConfirmation({
  pendingPlacement,
  improvement: null,
  restorablePlacement: null,
  assessment: blockedAssessment,
  score: blockedScore,
  blockerLabel: null,
});
assert.equal(blockedDecision.source, "blocked");
assert.equal(blockedDecision.blockedMessage, blockedScore.summary);

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

assert.match(hookSource, /resolveCatalogPlacementConfirmation\(\{/);
assert.match(confirmPanelSource, /shouldConfirmImprovedCatalogPlacement/);
assert.match(confirmPanelSource, /shouldConfirmRestoredCatalogPlacement/);

console.log("Placement smart confirm checks passed");
