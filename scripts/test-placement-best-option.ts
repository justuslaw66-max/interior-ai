import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findBestCatalogVariantPlacement } from "@/lib/catalog-placement-policy";
import {
  makePolicyPlacement,
  makePolicyRoom,
  makePolicyScore,
  multiVariantPolicyProduct,
} from "./catalog-placement-policy-test-utils";

const targetRoom = makePolicyRoom("room-current", "Current room");
const currentVariantId = multiVariantPolicyProduct.defaultVariantId;
const alternatives = multiVariantPolicyProduct.variants.filter(
  (variant) => variant.id !== currentVariantId
);
const invalidVariant = alternatives[0];
const bestVariant = alternatives[1];
assert.ok(invalidVariant && bestVariant);

const requestedVariantIds: string[] = [];
const recommendation = findBestCatalogVariantPlacement({
  pendingPlacement: makePolicyPlacement({ variantId: currentVariantId }),
  currentScore: makePolicyScore(70, "okay"),
  targetRoom,
  product: multiVariantPolicyProduct,
  findPlacement: (_productId, variantId, _purchaseOptionId, room) => {
    assert.ok(variantId);
    requestedVariantIds.push(variantId);
    return makePolicyPlacement({ roomId: room.id, variantId, position: [1, 0, 0] });
  },
  scorePlacement: (placement) =>
    placement.variantId === invalidVariant.id
      ? makePolicyScore(99, "cramped")
      : placement.variantId === bestVariant.id
        ? makePolicyScore(84)
        : makePolicyScore(76),
});

assert.ok(recommendation);
assert.equal(recommendation.placement.variantId, bestVariant.id);
assert.equal(recommendation.variantLabel, bestVariant.label);
assert.equal(recommendation.scoreDelta, 14);
assert.equal(requestedVariantIds.includes(currentVariantId), false);

assert.equal(
  findBestCatalogVariantPlacement({
    pendingPlacement: makePolicyPlacement({ variantId: currentVariantId }),
    currentScore: makePolicyScore(82),
    targetRoom,
    product: multiVariantPolicyProduct,
    findPlacement: (_productId, variantId, _purchaseOptionId, room) =>
      makePolicyPlacement({
        roomId: room.id,
        variantId: variantId ?? currentVariantId,
        position: [1, 0, 0],
      }),
    scorePlacement: () => makePolicyScore(84),
  }),
  null,
  "tiny score gains should not produce a best-option recommendation"
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

assert.match(hookSource, /findBestCatalogVariantPlacement\(\{/);
assert.match(hookSource, /switchPendingCatalogPlacementToBestOption/);
assert.match(confirmPanelSource, /data-testid="catalog-placement-best-option-hint"/);
assert.match(confirmPanelSource, /data-testid="catalog-placement-best-option"/);

console.log("Placement best-option checks passed");
