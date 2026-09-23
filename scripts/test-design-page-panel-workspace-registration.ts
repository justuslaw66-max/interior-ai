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
  /previewReplacement:[\s\S]*?commerceOnboarding\.actions\.commerce\.previewShoppingReplacement[\s\S]*?bulkSwap: aiPanel\.actions\.layout\.bulkSwap/,
  "Shopping and bulk-swap actions should remain connected to their feature owners."
);
assert.match(
  registrationSource,
  /deleteSelected:[\s\S]*?placementSelection\.actions\.interaction\.deleteSelectedItem/,
  "Cabinetry deletion should delegate to the selection controller."
);

assert.ok(registrationSource.split("\n").length <= 240);
assert.ok(workspaceSource.split("\n").length <= 1215);

console.log("design page panel workspace registration guardrails passed");
