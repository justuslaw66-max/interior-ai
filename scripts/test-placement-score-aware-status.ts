import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isCatalogPlacementScoreHardInvalid,
  resolveCatalogPlacementAssessment,
  resolveNextLastValidCatalogPlacement,
} from "@/lib/catalog-placement-policy";
import {
  makePolicyPlacement,
  makePolicyScore,
} from "./catalog-placement-policy-test-utils";

const pendingPlacement = makePolicyPlacement({ position: [1, 0, 0] });
const lastValidPlacement = makePolicyPlacement({ position: [0, 0, 0] });
const pathScore = makePolicyScore(25, "blocks_path", "Move away from the doorway");
const crampedScore = makePolicyScore(40, "cramped");

assert.equal(isCatalogPlacementScoreHardInvalid(pathScore), true);
assert.equal(isCatalogPlacementScoreHardInvalid(crampedScore), true);
assert.equal(isCatalogPlacementScoreHardInvalid(makePolicyScore(70, "okay")), false);

const pathAssessment = resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked: false,
  blockerLabel: null,
  targetRoomName: "Living room",
  score: pathScore,
  improvement: null,
  restorablePlacement: null,
});
assert.equal(pathAssessment.scoreHardInvalid, true);
assert.equal(pathAssessment.hardInvalid, true);
assert.equal(pathAssessment.statusLabel, "Blocks walking path");

const crampedAssessment = resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked: false,
  blockerLabel: null,
  targetRoomName: "Living room",
  score: crampedScore,
  improvement: null,
  restorablePlacement: null,
});
assert.equal(crampedAssessment.hardInvalid, true);
assert.equal(crampedAssessment.statusLabel, "Cramped placement");

const blockerAssessment = resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked: true,
  blockerLabel: "Coffee table",
  targetRoomName: "Living room",
  score: null,
  improvement: null,
  restorablePlacement: null,
});
assert.equal(blockerAssessment.statusLabel, "Blocked by Coffee table");

const validAssessment = resolveCatalogPlacementAssessment({
  pendingPlacement,
  blocked: false,
  blockerLabel: null,
  targetRoomName: "Living room",
  score: makePolicyScore(88),
  improvement: null,
  restorablePlacement: null,
});
assert.equal(validAssessment.hardInvalid, false);
assert.equal(validAssessment.statusLabel, "Valid placement");

assert.equal(
  resolveNextLastValidCatalogPlacement({
    currentLastValidPlacement: lastValidPlacement,
    pendingPlacement,
    hardInvalid: true,
  }),
  lastValidPlacement,
  "hard-invalid previews should preserve the latest valid placement"
);
assert.equal(
  resolveNextLastValidCatalogPlacement({
    currentLastValidPlacement: lastValidPlacement,
    pendingPlacement,
    hardInvalid: false,
  }),
  pendingPlacement
);

const hookSource = readFileSync(
  join(process.cwd(), "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const scenePreviewSource = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/DesignScenePreviewLayer.tsx"
  ),
  "utf8"
);
const confirmPanelSource = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/CatalogPlacementConfirmPanel.tsx"
  ),
  "utf8"
);

assert.match(hookSource, /resolveCatalogPlacementAssessment\(\{/);
assert.match(hookSource, /resolveNextLastValidCatalogPlacement\(\{/);
assert.match(
  confirmPanelSource,
  /data-testid="catalog-placement-status"/
);
assert.match(
  scenePreviewSource,
  /state\.placement\.hardInvalid/,
  "the scene preview should remain wired to the policy hard-invalid flag"
);

console.log("Placement score-aware status checks passed");
