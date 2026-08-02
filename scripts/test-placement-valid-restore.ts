import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  findRestorableCatalogPlacement,
  resolveCatalogPlacementAssessment,
  resolveCatalogPlacementConfirmation,
  resolveNextLastValidCatalogPlacement,
} from "@/lib/catalog-placement-policy";
import {
  makePolicyPlacement,
  makePolicyScore,
  multiVariantPolicyProduct,
} from "./catalog-placement-policy-test-utils";

const pendingPlacement = makePolicyPlacement({ position: [1, 0, 0] });
const lastValidPlacement = makePolicyPlacement({ position: [0, 0, 0] });

assert.equal(
  findRestorableCatalogPlacement(
    pendingPlacement,
    { ...lastValidPlacement, productId: "different-product" }
  ),
  null
);
const alternateVariant = multiVariantPolicyProduct.variants.find(
  (variant) => variant.id !== pendingPlacement.variantId
);
assert.ok(alternateVariant);
assert.equal(
  findRestorableCatalogPlacement(pendingPlacement, {
    ...lastValidPlacement,
    variantId: alternateVariant.id,
  }),
  null
);
assert.equal(
  findRestorableCatalogPlacement(
    { ...pendingPlacement, purchaseOptionId: "single" },
    { ...lastValidPlacement, purchaseOptionId: "pair" }
  ),
  null
);
assert.equal(
  findRestorableCatalogPlacement(
    makePolicyPlacement({ position: [0.02, 0, 0.02] }),
    lastValidPlacement
  ),
  null,
  "nearly identical placement should not show a restore action"
);
assert.equal(
  findRestorableCatalogPlacement(pendingPlacement, lastValidPlacement),
  lastValidPlacement
);

assert.equal(
  resolveNextLastValidCatalogPlacement({
    currentLastValidPlacement: lastValidPlacement,
    pendingPlacement,
    hardInvalid: true,
  }),
  lastValidPlacement
);
assert.equal(
  resolveNextLastValidCatalogPlacement({
    currentLastValidPlacement: lastValidPlacement,
    pendingPlacement: null,
    hardInvalid: false,
  }),
  null
);

const score = makePolicyScore(25, "cramped", "Move away from nearby furniture");
const assessment = resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked: false,
  blockerLabel: null,
  targetRoomName: "Living room",
  score,
  improvement: null,
  restorablePlacement: lastValidPlacement,
});
assert.equal(assessment.shouldConfirmRestored, true);
const decision = resolveCatalogPlacementConfirmation({
  pendingPlacement,
  improvement: null,
  restorablePlacement: lastValidPlacement,
  assessment,
  score,
  blockerLabel: null,
});
assert.equal(decision.source, "restored");
assert.equal(decision.placement, lastValidPlacement);

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

assert.match(hookSource, /findRestorableCatalogPlacement\(/);
assert.match(hookSource, /restoreLastValidCatalogPlacement/);
assert.match(hookSource, /resolveCatalogPlacementConfirmation\(\{/);
assert.match(confirmPanelSource, /data-testid="catalog-placement-restore-valid"/);

console.log("Placement valid restore checks passed");
