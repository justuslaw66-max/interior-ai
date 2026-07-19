import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const lifecycleSource = readSource(
  "lib/useDesignPageFloorPlanLifecycleRegistration.ts"
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

assert.match(
  workspaceSource,
  /useDesignPageFloorPlanLifecycleRegistration\(\{[\s\S]*?coreShell: coreShellRegistration[\s\S]*?documentSelection: documentSelectionRegistration[\s\S]*?persistence: persistenceWorkspaceRegistration/
);
assertSourceOrder(
  workspaceSource,
  [
    "useDesignPagePersistenceWorkspaceRegistration({",
    "useDesignPageFloorPlanLifecycleRegistration({",
    "useDesignPageAiWorkspaceRegistration({",
  ],
  "Floor-plan lifecycle registration must retain its post-persistence hook order"
);
assert.match(
  workspaceSource,
  /\.\.\.floorPlanLifecycleRegistration\.derived\.validation/
);
assert.doesNotMatch(workspaceSource, /reorientConsumerFloorPlanDesign\(/);
assert.doesNotMatch(workspaceSource, /\/floor-plan-update`/);

for (const boundary of [
  "DesignPageCoreShellRegistration",
  "DesignPageDocumentSelectionRegistrationFacade",
  "DesignPagePersistenceWorkspaceRegistration",
] as const) {
  assert.match(lifecycleSource, new RegExp(boundary));
}

const changeOrientationSource = lifecycleSource.slice(
  lifecycleSource.indexOf("const changeOrientation"),
  lifecycleSource.indexOf("const createUpdatedCopy")
);
assertSourceOrder(
  changeOrientationSource,
  [
    "reorientConsumerFloorPlanDesign(",
    'history.begin("Change floor-plan orientation")',
    "setDesignSnapshot(reoriented.snapshot)",
    "setPlanOpenings(reoriented.openings)",
    "setPlanFixedElements(reoriented.fixedElements)",
    "history.commit()",
  ],
  "Orientation changes must remain one history transaction across 2D and 3D state"
);
const createUpdatedCopySource = lifecycleSource.slice(
  lifecycleSource.indexOf("const createUpdatedCopy"),
  lifecycleSource.indexOf("const floorPlanOrientation")
);
assertSourceOrder(
  createUpdatedCopySource,
  [
    "const preserved = await preserveCurrentDesign()",
    'method: "POST"',
    "revisionId: revisionUpdate.revisionId",
    "setDismissedRevisionUpdateKey(revisionUpdateKey(revisionUpdate))",
    "const loaded = await loadDesign(payload.id)",
    'track("floor_plan_revision_copy_opened"',
  ],
  "Revision updates must save first, create an immutable copy, and then load it"
);
assert.match(lifecycleSource, /return \(\) => controller\.abort\(\)/);
assert.match(
  lifecycleSource,
  /revisionUpdateKey\(payload\.update\) === dismissedRevisionUpdateKey/
);
assert.doesNotMatch(lifecycleSource, /replaceCurrentPlan|confirmPendingReplacement/);

for (const group of [
  "boundaries",
  "state",
  "derived",
  "configuration",
  "refs",
  "actions",
] as const) {
  assert.match(lifecycleSource, new RegExp(`\\b${group}:`));
}

assert.ok(
  lifecycleSource.split("\n").length <= 300,
  "The floor-plan lifecycle registration should stay below 300 lines."
);
assert.ok(
  workspaceSource.split("\n").length <= 820,
  "The design-page workspace should stay at or below 820 lines."
);

console.log("design page floor-plan lifecycle registration guardrails passed");
