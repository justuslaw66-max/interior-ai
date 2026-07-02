import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designPage = readFileSync(join(process.cwd(), "app/design/page.tsx"), "utf8");

assert.match(
  designPage,
  /const pendingCatalogPlacementScoreHardInvalid =[\s\S]*pendingCatalogPlacementScore\?\.kind === "blocks_path"[\s\S]*pendingCatalogPlacementScore\?\.kind === "cramped"/,
  "placement preview should treat blocked-path and cramped scores as hard invalid"
);
assert.match(
  designPage,
  /const pendingCatalogPlacementHardInvalid = Boolean/,
  "placement preview should share one hard-invalid flag"
);
assert.match(
  designPage,
  /const pendingCatalogPlacementStatusLabel = pendingCatalogPlacementBlocked[\s\S]*Blocks walking path[\s\S]*Cramped placement/,
  "placement status should explain score-invalid placements"
);
assert.match(
  designPage,
  /pendingCatalogPlacementHardInvalid \? "border-red-200" : "border-emerald-200"/,
  "placement panel border should use score-aware hard-invalid state"
);
assert.match(
  designPage,
  /data-testid="catalog-placement-status"[\s\S]*pendingCatalogPlacementHardInvalid[\s\S]*\{pendingCatalogPlacementStatusLabel\}/,
  "placement status pill should use score-aware hard-invalid state and label"
);
assert.match(
  designPage,
  /disabled=\{[\s\S]*pendingCatalogPlacementHardInvalid &&[\s\S]*!shouldConfirmImprovedCatalogPlacement &&[\s\S]*!shouldConfirmRestoredCatalogPlacement/,
  "confirm should be disabled for score-invalid placements without a fallback"
);
assert.match(
  designPage,
  /color=\{pendingCatalogPlacementHardInvalid \? "#ef4444" : "#22c55e"\}/,
  "placement ghost fill should use score-aware hard-invalid state"
);
assert.match(
  designPage,
  /if \(!pendingCatalogPlacementHardInvalid\) \{[\s\S]*setLastValidCatalogPlacement\(pendingCatalogPlacement\)/,
  "last-valid memory should not store score-invalid placements"
);

console.log("Placement score-aware status checks passed");
