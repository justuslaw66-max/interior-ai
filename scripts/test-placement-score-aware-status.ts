import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const scenePreviewLayer = readFileSync(
  join(process.cwd(), "components/editor/design-page/DesignScenePreviewLayer.tsx"),
  "utf8"
);
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
  /const pendingCatalogPlacementScoreHardInvalid =[\s\S]*pendingCatalogPlacementScore\?\.kind === "blocks_path"[\s\S]*pendingCatalogPlacementScore\?\.kind === "cramped"/,
  "placement preview should treat blocked-path and cramped scores as hard invalid"
);
assert.match(
  catalogPlacementHook,
  /const pendingCatalogPlacementHardInvalid = Boolean/,
  "placement preview should share one hard-invalid flag"
);
assert.match(
  catalogPlacementHook,
  /const pendingCatalogPlacementStatusLabel = pendingCatalogPlacementBlocked[\s\S]*Blocks walking path[\s\S]*Cramped placement/,
  "placement status should explain score-invalid placements"
);
assert.match(
  confirmPanel,
  /pendingCatalogPlacementHardInvalid \? "border-red-200" : "border-emerald-200"/,
  "placement panel border should use score-aware hard-invalid state"
);
assert.match(
  confirmPanel,
  /data-testid="catalog-placement-status"[\s\S]*pendingCatalogPlacementHardInvalid[\s\S]*\{pendingCatalogPlacementStatusLabel\}/,
  "placement status pill should use score-aware hard-invalid state and label"
);
assert.match(
  confirmPanel,
  /disabled=\{[\s\S]*pendingCatalogPlacementHardInvalid &&[\s\S]*!shouldConfirmImprovedCatalogPlacement &&[\s\S]*!shouldConfirmRestoredCatalogPlacement/,
  "confirm should be disabled for score-invalid placements without a fallback"
);
assert.match(
  scenePreviewLayer,
  /color=\{state\.placement\.hardInvalid \? "#ef4444" : "#22c55e"\}/,
  "placement ghost fill should use score-aware hard-invalid state"
);
assert.match(
  catalogPlacementHook,
  /if \(!pendingCatalogPlacementHardInvalid\) \{[\s\S]*setLastValidPlacement\(pendingPlacement\)/,
  "last-valid memory should not store score-invalid placements"
);

console.log("Placement score-aware status checks passed");
