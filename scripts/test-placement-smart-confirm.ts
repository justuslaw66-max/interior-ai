import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const catalogPlacementHook = readFileSync(
  join(process.cwd(), "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const confirmPanel = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/CatalogPlacementConfirmPanel.tsx"
  ),
  "utf8"
);

assert.match(
  catalogPlacementHook,
  /const shouldConfirmImprovedCatalogPlacement = Boolean/,
  "placement preview should derive when confirm can safely use the improved spot"
);
assert.match(
  catalogPlacementHook,
  /pendingCatalogPlacementScore\?\.kind === "blocks_path"/,
  "smart confirm should cover walking-path blocked placements"
);
assert.match(
  catalogPlacementHook,
  /pendingCatalogPlacementScore\?\.kind === "cramped"/,
  "smart confirm should cover cramped placements"
);
assert.match(
  catalogPlacementHook,
  /const placementToConfirm =[\s\S]*shouldConfirmImprovedCatalogPlacement[\s\S]*pendingCatalogPlacementImprovement\.placement/,
  "confirm should switch to the improved placement when appropriate"
);
assert.match(
  confirmPanel,
  /pendingCatalogPlacementHardInvalid &&[\s\S]*!shouldConfirmImprovedCatalogPlacement &&[\s\S]*!shouldConfirmRestoredCatalogPlacement/,
  "blocked previews should remain disabled unless an improved or restored spot can be confirmed"
);
assert.match(
  confirmPanel,
  /Add best spot to/,
  "confirm button should clearly name smart confirm when it will use the improved spot"
);
assert.match(
  catalogPlacementHook,
  /Added improved placement \(\$\{pendingCatalogPlacementImprovement\.score\}\/100\)/,
  "smart confirm should toast the improved score"
);

console.log("Placement smart confirm checks passed");
