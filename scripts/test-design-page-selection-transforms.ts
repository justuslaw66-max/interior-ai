import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildNearbyDuplicateOffsets } from "../lib/design-page-object-placement";

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
const selectionWorkspaceSource = readFileSync(
  join(root, "lib/useDesignPageSelectionWorkspaceRegistration.ts"),
  "utf8"
);
const controllerSource = readFileSync(
  join(root, "lib/useDesignPageSelectionTransforms.ts"),
  "utf8"
);
const dragControllerSource = readFileSync(
  join(root, "lib/useDesignPageSceneItemDrag.ts"),
  "utf8"
);
const selectedItemPanelSource = readFileSync(
  join(root, "components/editor/SelectedItemDetailsPanel.tsx"),
  "utf8"
);

assert.match(facadeSource, /useDesignPageSelectionTransforms\(\{/);
assert.match(
  placementSelectionFacadeSource,
  /useDesignPageItemInteractionFacade\(\{/
);
assert.match(
  selectionWorkspaceSource,
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
assert.match(controllerSource, /editor_item_transform_rejected/);
assert.match(controllerSource, /selectionType: "single"/);
assert.match(controllerSource, /selectionType: "group"/);
assert.match(controllerSource, /buildNearbyDuplicateOffsets/);
assert.match(controllerSource, /findCatalogPlacementBlockerInRoom/);
assert.match(controllerSource, /No clear nearby space is available for a duplicate/);
assert.match(controllerSource, /selectProductVariant/);
assert.match(dragControllerSource, /dragRejectionRef/);
assert.match(dragControllerSource, /now - previous\.shownAt < 1_500/);
assert.match(dragControllerSource, /commitContinuousCommand\(SCENE_ITEM_DRAG_COMMAND_ID\)/);
assert.match(selectedItemPanelSource, /selected-item-size-guidance/);
assert.match(selectedItemPanelSource, /touchFriendly/);

const nearbyOffsets = buildNearbyDuplicateOffsets({
  widthMeters: 1,
  depthMeters: 0.5,
  clearanceMeters: 0.1,
});
assert.equal(nearbyOffsets.length, 16);
assert.deepEqual(nearbyOffsets[0], [0, 0.6]);
assert.ok(
  nearbyOffsets.every(([deltaX, deltaZ]) => deltaX !== 0 || deltaZ !== 0),
  "Duplicate placement candidates must never reuse the source position."
);
assert.ok(
  Math.hypot(...nearbyOffsets[0]) <= Math.hypot(...nearbyOffsets.at(-1)!),
  "Duplicate placement candidates should be searched nearest-first."
);
assert.doesNotMatch(
  controllerSource,
  /Cabinet|cabinet/,
  "Cabinetry-specific transforms must remain behind page-owned adapters."
);

console.log("design page selection transform controller guardrails passed");
