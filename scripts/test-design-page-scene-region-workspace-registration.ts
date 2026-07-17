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
  "lib/useDesignPageSceneRegionWorkspaceRegistration.ts"
);

assert.match(
  workspaceSource,
  /useDesignPageSceneRegionWorkspaceRegistration\(\{[\s\S]*?presentation: presentationQaWorkspace/
);
assert.match(registrationSource, /useDesignPageSceneItemDrag\(\{/);
assert.match(registrationSource, /buildDesignPageSceneRegionAdapter\(\{/);
assert.doesNotMatch(workspaceSource, /useDesignPageSceneItemDrag\(\{/);
assert.doesNotMatch(workspaceSource, /buildDesignPageSceneRegionAdapter\(\{/);

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
  /selectedIds: itemSelection\.refs\.selectedIds,[\s\S]*?dragCommit: camera\.refs\.canvas\.itemDragCommit/,
  "Drag behavior should retain selection and camera commit refs."
);
assert.match(
  registrationSource,
  /setItems: itemDocument\.actions\.setItemsPresent,[\s\S]*?history: documentRoom\.refs\.documentHistory\.history/,
  "Drag mutations should remain connected to document and history owners."
);
assert.match(
  registrationSource,
  /onRenderReadyChange:[\s\S]*?sceneRoomRead\.actions\.scene\.handleSceneRenderItemReadyChange/,
  "Scene readiness should remain connected to the scene read controller."
);
assert.match(
  registrationSource,
  /onDragPointerMove: scene\.hasWholeHousePlan[\s\S]*?camera\.actions\.navigation\.nudgeWholeHomeCameraForDrag/,
  "Whole-home drag camera nudging should remain conditional."
);

assert.ok(registrationSource.split("\n").length <= 440);
assert.ok(workspaceSource.split("\n").length <= 820);

console.log("design page scene-region workspace registration guardrails passed");
