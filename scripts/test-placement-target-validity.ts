import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CATALOG_ITEMS } from "@/lib/catalog";
import { isCatalogPlacementTargetAcceptable } from "@/lib/catalog-placement-policy";
import {
  makePolicyPlacement,
  makePolicyRoom,
  makePolicyScore,
} from "./catalog-placement-policy-test-utils";

const placement = makePolicyPlacement();
const targetRoom = makePolicyRoom("room-current");

function evaluateTarget({
  contained = true,
  collides = false,
  scoreKind = "great",
}: {
  contained?: boolean;
  collides?: boolean;
  scoreKind?: "great" | "okay" | "cramped" | "blocks_path";
}): boolean {
  return isCatalogPlacementTargetAcceptable({
    placement,
    targetRoom,
    catalogItems: CATALOG_ITEMS,
    geometry: {
      isContainedInRoom: () => contained,
      collidesInRoom: () => collides,
    },
    scorePlacement: () => makePolicyScore(80, scoreKind),
  });
}

assert.equal(evaluateTarget({ contained: false }), false);
assert.equal(evaluateTarget({ collides: true }), false);
assert.equal(evaluateTarget({ scoreKind: "blocks_path" }), false);
assert.equal(evaluateTarget({ scoreKind: "cramped" }), false);
assert.equal(evaluateTarget({ scoreKind: "okay" }), true);

const hookSource = readFileSync(
  join(process.cwd(), "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const designPageSource = readFileSync(
  join(process.cwd(), "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);

assert.match(hookSource, /evaluateCatalogPlacementTarget\(\{/);
assert.match(
  hookSource,
  /resolveCatalogPlacementRoomTarget\(\{[\s\S]*isAcceptable: isCatalogPlacementTargetAcceptable/
);
assert.match(
  designPageSource,
  /const activePlacementTargetValid = pendingCatalogPlacement[\s\S]*\? !pendingCatalogPlacementHardInvalid/,
  "the scene target outline should remain wired to the policy assessment"
);

console.log("Placement target validity checks passed");
