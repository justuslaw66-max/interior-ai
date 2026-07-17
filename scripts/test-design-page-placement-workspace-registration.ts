import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const placementSource = readSource(
  "lib/useDesignPagePlacementWorkspaceRegistration.ts"
);

const assertSourceOrder = (
  source: string,
  markers: readonly string[],
  message: string
) => {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(index > previousIndex, `${message}: ${marker}`);
    previousIndex = index;
  }
};

assertSourceOrder(
  workspaceSource,
  [
    "useDesignPageAiWorkspaceRegistration({",
    "useDesignPagePlacementWorkspaceRegistration({",
    "useDesignPageCommerceActions({",
  ],
  "Workspace should preserve AI, placement, and commerce registration order"
);
assertSourceOrder(
  placementSource,
  [
    "useDesignPageCatalogPlacementRegistrationFacade({",
    "useDesignPageSurfaceTargetingFacade({",
    "const movePendingCatalogPlacementToBestRoom = useCallback(",
  ],
  "Placement registration should preserve catalog, targeting, and adapter hook order"
);

for (const boundary of [
  "DesignPageCoreShellRegistration",
  "DesignPageDocumentSelectionRegistrationFacade",
  "DesignPagePlanAuthoringRegistration",
  "DesignPageEditorInteractionRegistration",
] as const) {
  assert.match(placementSource, new RegExp(boundary));
}
for (const group of [
  "boundaries",
  "state",
  "derived",
  "configuration",
  "refs",
  "actions",
] as const) {
  assert.match(placementSource, new RegExp(`\\b${group}:`));
}
for (const formerWorkspaceOwner of [
  "useDesignPageCatalogPlacementRegistrationFacade({",
  "useDesignPageSurfaceTargetingFacade({",
] as const) {
  assert.ok(
    !workspaceSource.includes(formerWorkspaceOwner),
    `Workspace should not retain direct ownership of ${formerWorkspaceOwner}.`
  );
}

assert.match(
  placementSource,
  /catalogCanvasDragDisabled:[\s\S]*?isClientPreview \|\| editorMode === "present"/,
  "Placement registration should retain client-preview and presentation drag guards."
);
assert.match(
  placementSource,
  /resetFloorPlanTraceRoomPoints:[\s\S]*?tracing\.actions\.handleResetFloorPlanTraceRoomPoints/,
  "Surface targeting should retain the plan-trace cleanup adapter."
);
assert.ok(
  placementSource.split("\n").length <= 250,
  "Placement workspace registration should stay below 250 lines."
);
assert.ok(
  workspaceSource.split("\n").length <= 1700,
  "Placement extraction should keep the workspace at or below 1,700 lines."
);

console.log("design page placement workspace registration guardrails passed");
