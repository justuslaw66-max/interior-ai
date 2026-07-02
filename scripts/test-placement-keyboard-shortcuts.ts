import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designPage = readFileSync(join(process.cwd(), "app/design/page.tsx"), "utf8");

assert.match(
  designPage,
  /if \(pendingCatalogPlacement && canEdit\)/,
  "placement keyboard shortcuts should only run while a preview is active and editable"
);
assert.match(
  designPage,
  /event\.key === "Enter"[\s\S]*confirmPendingCatalogPlacement\(\)/,
  "Enter should confirm the pending catalog placement"
);
assert.match(
  designPage,
  /event\.key\.toLowerCase\(\) === "r"[\s\S]*rotatePendingCatalogPlacement\(event\.shiftKey \? "left" : "right"\)/,
  "R and Shift+R should rotate the pending catalog placement"
);
assert.match(
  designPage,
  /const placementNudgeStep = event\.shiftKey \? 0\.25 : 0\.1/,
  "placement arrow-key nudging should support coarse and fine steps"
);
assert.match(
  designPage,
  /event\.key === "ArrowLeft"[\s\S]*nudgePendingCatalogPlacement\(-placementNudgeStep, 0\)/,
  "ArrowLeft should nudge the pending placement left"
);
assert.match(
  designPage,
  /event\.key === "ArrowDown"[\s\S]*nudgePendingCatalogPlacement\(0, placementNudgeStep\)/,
  "ArrowDown should nudge the pending placement forward"
);

console.log("Placement keyboard shortcut checks passed");
