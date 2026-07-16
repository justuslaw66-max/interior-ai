import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designPage = readFileSync(
  join(process.cwd(), "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const catalogPlacementHook = readFileSync(
  join(process.cwd(), "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);

assert.match(
  catalogPlacementHook,
  /const isCatalogPlacementTargetAcceptable = useCallback/,
  "placement targeting should share an acceptability helper"
);
assert.match(
  catalogPlacementHook,
  /score\.kind !== "blocks_path" && score\.kind !== "cramped"/,
  "target validity should reject path-blocking and cramped scored placements"
);
assert.match(
  catalogPlacementHook,
  /const acceptable = isCatalogPlacementTargetAcceptable\(\s*nextPlacement,\s*targetRoom\s*\)[\s\S]*valid: acceptable/,
  "preview drag and room tap should use scored target validity"
);
assert.match(
  catalogPlacementHook,
  /valid: isCatalogPlacementTargetAcceptable\(placement, targetRoom\)/,
  "catalog drag-over should use scored target validity"
);
assert.match(
  designPage,
  /const activePlacementTargetValid = pendingCatalogPlacement[\s\S]*\? !pendingCatalogPlacementHardInvalid/,
  "active target outline should reflect blocked-path and cramped score states"
);

console.log("Placement target validity checks passed");
