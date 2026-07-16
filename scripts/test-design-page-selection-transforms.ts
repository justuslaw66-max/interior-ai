import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pageSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const facadeSource = readFileSync(
  join(root, "lib/useDesignPageItemInteractionFacade.ts"),
  "utf8"
);
const placementSelectionFacadeSource = readFileSync(
  join(root, "lib/useDesignPagePlacementSelectionWorkspaceFacade.ts"),
  "utf8"
);
const controllerSource = readFileSync(
  join(root, "lib/useDesignPageSelectionTransforms.ts"),
  "utf8"
);

assert.match(facadeSource, /useDesignPageSelectionTransforms\(\{/);
assert.match(
  placementSelectionFacadeSource,
  /useDesignPageItemInteractionFacade\(\{/
);
assert.match(
  pageSource,
  /useDesignPagePlacementSelectionWorkspaceFacade\(\{/
);
assert.doesNotMatch(pageSource, /const applyItemRotation\s*=/);
assert.doesNotMatch(pageSource, /const duplicateSelectedItem\s*=/);
assert.doesNotMatch(pageSource, /const moveSelectedItemToRoom\s*=/);

for (const contract of ["state", "configuration", "refs", "actions"]) {
  assert.match(
    controllerSource,
    new RegExp(`\\b${contract}\\b`),
    `The controller should retain its grouped ${contract} contract.`
  );
}

for (const historyLabel of [
  "Align X center",
  "Align Z center",
  "Rotate item",
  "Rotate group",
  "Center item",
  "Snap item to wall",
  "Nudge item",
  "Change quantity",
  "Include in checkout",
  "Exclude from checkout",
]) {
  assert.match(
    controllerSource,
    new RegExp(historyLabel),
    `The extracted controller should preserve the ${historyLabel} history label.`
  );
}

assert.match(controllerSource, /track\("editor_item_rotated"/);
assert.match(controllerSource, /selectionType: "single"/);
assert.match(controllerSource, /selectionType: "group"/);
assert.match(controllerSource, /selectProductVariant/);
assert.doesNotMatch(
  controllerSource,
  /Cabinet|cabinet/,
  "Cabinetry-specific transforms must remain behind page-owned adapters."
);

console.log("design page selection transform controller guardrails passed");
