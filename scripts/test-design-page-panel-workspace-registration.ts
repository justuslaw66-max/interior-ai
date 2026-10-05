import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const registrationSource = readSource(
  "lib/design-page-panel-workspace-registration.ts"
);

assert.match(
  workspaceSource,
  /buildDesignPagePanelWorkspaceRegistration\(\{[\s\S]*?presentation: presentationQaWorkspace/
);
assert.match(registrationSource, /buildDesignPagePanelRegistration\(\{/);
assert.doesNotMatch(workspaceSource, /buildDesignPagePanelRegistration\(\{/);

for (const group of [
  "boundaries",
  "state",
  "derived",
  "configuration",
  "refs",
  "actions",
  "regions",
] as const) {
  assert.match(registrationSource, new RegExp(`\\b${group}:`));
}

assert.match(
  registrationSource,
  /roomFloor: documentRoom\.boundaries\.roomFloor,[\s\S]*?sceneRoom: sceneRoomRead\.boundaries\.sceneRoom/,
  "Panel composition should use the document and scene registration boundaries."
);
assert.match(
  registrationSource,
  /changeHeight:[\s\S]*?selectionInspection\.actions\.roomGeometry[\s\S]*?changeActiveRoomHeightMm/,
  "Room geometry changes should remain owned by selection inspection."
);
assert.match(
  registrationSource,
  /shopping: \{\s+commitItemsToRoom: itemDocument\.actions\.commitItemsToRoom, commitItemsToRooms: itemDocument\.actions\.commitItemsToRooms,\s+openPricing: \(openerId\) => \{ base\.actions\.dialogs\.setPlansOpenerId\(openerId\); base\.actions\.dialogs\.setShowPlans\(true\); \},\s+openGuestPrompt: persistence\.actions\.persistence\.openGuestPrompt,/,
  "Shop's edits (Swap all's several rooms too) should go through the item document, Swap all's Pro badge to Pricing, and its checkout through the guest prompt."
);
assert.match(
  registrationSource,
  /deleteSelected:[\s\S]*?placementSelection\.actions\.interaction\.deleteSelectedItem/,
  "Cabinetry deletion should delegate to the selection controller."
);

assert.ok(registrationSource.split("\n").length <= 240);
assert.ok(workspaceSource.split("\n").length <= 1215);

console.log("design page panel workspace registration guardrails passed");
