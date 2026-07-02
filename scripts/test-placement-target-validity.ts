import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designPage = readFileSync(join(process.cwd(), "app/design/page.tsx"), "utf8");

assert.match(
  designPage,
  /const isCatalogPlacementTargetAcceptable = useCallback/,
  "placement targeting should share an acceptability helper"
);
assert.match(
  designPage,
  /score\.kind !== "blocks_path" && score\.kind !== "cramped"/,
  "target validity should reject path-blocking and cramped scored placements"
);
assert.match(
  designPage,
  /const acceptable = isCatalogPlacementTargetAcceptable\(nextPlacement, targetRoom\)[\s\S]*valid: acceptable/,
  "preview drag and room tap should use scored target validity"
);
assert.match(
  designPage,
  /const acceptable = isCatalogPlacementTargetAcceptable\(placement, targetRoom\)[\s\S]*valid: acceptable/,
  "catalog drag-over should use scored target validity"
);
assert.match(
  designPage,
  /const activePlacementTargetValid = pendingCatalogPlacement[\s\S]*\? !pendingCatalogPlacementHardInvalid/,
  "active target outline should reflect blocked-path and cramped score states"
);

console.log("Placement target validity checks passed");
