import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const selectionSource = readSource(
  "lib/useDesignPageSelectionWorkspaceRegistration.ts"
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
    "useDesignPageCabinetryWorkspaceRegistration({",
    "useDesignPageSelectionWorkspaceRegistration({",
    "useDesignPagePresentationWorkspaceRegistration({",
  ],
  "Workspace should preserve cabinetry, selection, and presentation order"
);
assert.match(
  selectionSource,
  /useDesignPagePlacementSelectionWorkspaceFacade\(\{/
);
assert.doesNotMatch(
  workspaceSource,
  /useDesignPagePlacementSelectionWorkspaceFacade\(\{/
);
for (const boundary of [
  "DesignPageCoreShellRegistration",
  "DesignPageDocumentSelectionRegistrationFacade",
  "DesignPagePlanAuthoringRegistration",
  "DesignPagePlacementWorkspaceRegistration",
  "DesignPageCabinetryWorkspaceRegistration",
] as const) {
  assert.match(selectionSource, new RegExp(boundary));
}
for (const group of [
  "boundaries",
  "state",
  "derived",
  "configuration",
  "refs",
  "actions",
] as const) {
  assert.match(selectionSource, new RegExp(`\\b${group}:`));
}
assert.match(
  selectionSource,
  /selectedCabinetItem\?\.name[\s\S]*?selectedCabinetItem\?\.cabinetDefinition\.name[\s\S]*?selectedProduct\?\.title[\s\S]*?"Item"/,
  "Selected-item delete labels should preserve cabinetry and catalog fallback order."
);
assert.match(
  selectionSource,
  /delete: planWorkspace\.actions\.room\.deleteRoom[\s\S]*?duplicate: planWorkspace\.actions\.room\.duplicateRoom[\s\S]*?nudge: planWorkspace\.actions\.room\.nudgeSelectedPlanRoom/,
  "Plan-room keyboard actions should remain connected to plan history owners."
);
assert.ok(selectionSource.split("\n").length <= 180);
assert.ok(workspaceSource.split("\n").length <= 1525);

console.log("design page selection workspace registration guardrails passed");
