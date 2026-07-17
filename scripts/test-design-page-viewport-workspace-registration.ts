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
  "lib/design-page-viewport-workspace-registration.ts"
);

assert.match(
  workspaceSource,
  /buildDesignPageViewportWorkspaceRegistration\(\{[\s\S]*?presentation: presentationQaWorkspace/
);
assert.match(registrationSource, /buildDesignPageViewportRegionAdapter\(\{/);
assert.doesNotMatch(workspaceSource, /buildDesignPageViewportRegionAdapter\(\{/);

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
  /selectedCount: itemSelection\.state\.selectedIds\.size[\s\S]*?pendingZoneType: zone\.state\.pendingZoneType/,
  "Selection controls should retain item-selection and zone ownership."
);
assert.match(
  registrationSource,
  /setPanel: planWorkspace\.refs\.quality\.setReviewPanelNode[\s\S]*?toggleCollapsed: planWorkspace\.actions\.quality\.toggleReviewPanel/,
  "Plan-quality refs and actions should remain connected to their controller."
);
assert.match(
  registrationSource,
  /onRedo: documentSelection\.actions\.history\.redoSafe[\s\S]*?onActiveRoomHeightMmChange:[\s\S]*?selectionInspection\.actions\.roomGeometry\.changeActiveRoomHeightMm/,
  "Floor properties should retain history and room-geometry actions."
);
assert.match(
  registrationSource,
  /planCanvas: presentation\.actions\.planCanvas/,
  "Viewport overlays should use presentation-owned plan-canvas actions."
);

assert.ok(registrationSource.split("\n").length <= 280);
assert.ok(workspaceSource.split("\n").length <= 550);

console.log("design page viewport workspace registration guardrails passed");
