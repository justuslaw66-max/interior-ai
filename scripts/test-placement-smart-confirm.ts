import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designPage = readFileSync(join(process.cwd(), "app/design/page.tsx"), "utf8");

assert.match(
  designPage,
  /const shouldConfirmImprovedCatalogPlacement = Boolean/,
  "placement preview should derive when confirm can safely use the improved spot"
);
assert.match(
  designPage,
  /pendingCatalogPlacementScore\?\.kind === "blocks_path"/,
  "smart confirm should cover walking-path blocked placements"
);
assert.match(
  designPage,
  /pendingCatalogPlacementScore\?\.kind === "cramped"/,
  "smart confirm should cover cramped placements"
);
assert.match(
  designPage,
  /const placementToConfirm =[\s\S]*shouldConfirmImprovedCatalogPlacement[\s\S]*pendingCatalogPlacementImprovement\.placement/,
  "confirm should switch to the improved placement when appropriate"
);
assert.match(
  designPage,
  /pendingCatalogPlacementHardInvalid &&[\s\S]*!shouldConfirmImprovedCatalogPlacement &&[\s\S]*!shouldConfirmRestoredCatalogPlacement/,
  "blocked previews should remain disabled unless an improved or restored spot can be confirmed"
);
assert.match(
  designPage,
  /Add best spot to/,
  "confirm button should clearly name smart confirm when it will use the improved spot"
);
assert.match(
  designPage,
  /Added improved placement \(\$\{pendingCatalogPlacementImprovement\.score\}\/100\)/,
  "smart confirm should toast the improved score"
);

console.log("Placement smart confirm checks passed");
