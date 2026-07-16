import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CameraView } from "@/lib/design-page-types";
import type { SavedView } from "@/lib/room-types";
import {
  appendDesignPageSavedCameraView,
  buildDesignPageSavedCameraView,
  mapDesignPageSavedCameraViewsToLegacy,
  removeDesignPageSavedCameraView,
} from "@/lib/useDesignPageNamedCameraViewsController";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const layoutControllerSource = readFileSync(
  join(root, "lib/useDesignPageLayoutVersionsController.ts"),
  "utf8"
);
const namedViewsControllerSource = readFileSync(
  join(root, "lib/useDesignPageNamedCameraViewsController.ts"),
  "utf8"
);
const presentExportControllerSource = readFileSync(
  join(root, "lib/useDesignPagePresentExportController.ts"),
  "utf8"
);

assert.match(
  workspaceSource,
  /useDesignPageLayoutVersionsController\(\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The workspace should compose layout versions through grouped refs and actions."
);
assert.match(
  workspaceSource,
  /useDesignPageNamedCameraViewsController\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{[\s\S]*?actions:\s*\{/,
  "The workspace should compose named camera views through grouped contracts."
);
assert.match(
  workspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?camera:\s*\{[\s\S]*?open:\s*openSavedCameraView/,
  "The workspace should inject the named-view controller's open action at the presentation/QA boundary."
);
assert.match(
  presentExportControllerSource,
  /onOpenCameraView:\s*actions\.camera\.open/,
  "The present/export controller should map the injected named-view action to the dialog contract."
);
assert.doesNotMatch(
  workspaceSource,
  /onOpenCameraView:\s*\([^)]*\)\s*=>/,
  "The workspace should not retain the old inline camera-view opener."
);
assert.doesNotMatch(
  workspaceSource,
  /const \[cameraViewNameInput,\s*setCameraViewNameInput\]\s*=\s*useState/,
  "The camera-view input state should be owned by its controller."
);
assert.doesNotMatch(
  workspaceSource,
  /const \[layoutVersionNameInput,\s*setLayoutVersionNameInput\]\s*=\s*useState/,
  "The layout-version input state should be owned by its controller."
);

for (const callbackName of [
  "saveRoomLayoutVersion",
  "saveCurrentLayoutVersion",
  "restoreRoomLayoutVersion",
  "deleteRoomLayoutVersion",
]) {
  assert.match(
    layoutControllerSource,
    new RegExp(`const ${callbackName} = useCallback`),
    `${callbackName} should be owned by the layout-versions controller.`
  );
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`const ${callbackName} = useCallback`),
    `${callbackName} should not be declared inline in the workspace.`
  );
}

assert.match(
  layoutControllerSource,
  /name:\s*`Before \$\{currentVersion\.name\}`/,
  "Restoring a layout should first name a rollback snapshot for the current room state."
);
assert.match(
  layoutControllerSource,
  /appendLayoutVersion\(\s*restoreLayoutVersion\(currentRoom, currentVersion\),\s*beforeRestore\s*\)/,
  "The rollback snapshot should remain in history after the selected layout is restored."
);

for (const callbackName of [
  "saveCurrentNamedView",
  "deleteSavedCameraView",
  "openSavedCameraView",
]) {
  assert.match(
    namedViewsControllerSource,
    new RegExp(`const ${callbackName} = useCallback`),
    `${callbackName} should be owned by the named-camera-views controller.`
  );
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`const ${callbackName} = useCallback`),
    `${callbackName} should not be declared inline in the workspace.`
  );
}

const cameraPosition: CameraView["pos"] = [1, 2, 3];
const cameraTarget: CameraView["target"] = [4, 5, 6];
const namedView = buildDesignPageSavedCameraView({
  requestedName: "  Client hero  ",
  existingViewCount: 2,
  idTimestamp: 1_700_000_000_001,
  timestamp: 1_700_000_000_002,
  cameraPosition,
  cameraTarget,
});

assert.deepEqual(
  namedView,
  {
    id: "view-1700000000001",
    name: "Client hero",
    cameraPosition: [1, 2, 3],
    cameraTarget: [4, 5, 6],
    timestamp: 1_700_000_000_002,
  },
  "A named camera view should trim its name and use injected identity fields."
);
assert.notStrictEqual(
  namedView.cameraPosition,
  cameraPosition,
  "The saved camera position should not retain the live camera tuple by reference."
);
assert.notStrictEqual(
  namedView.cameraTarget,
  cameraTarget,
  "The saved camera target should not retain the live camera tuple by reference."
);
cameraPosition[0] = 99;
cameraTarget[0] = 98;
assert.deepEqual(
  [namedView.cameraPosition[0], namedView.cameraTarget[0]],
  [1, 4],
  "Changing the live camera after saving should not change the saved view."
);

assert.equal(
  buildDesignPageSavedCameraView({
    requestedName: "   ",
    existingViewCount: 6,
    idTimestamp: 10,
    timestamp: 11,
    cameraPosition: [0, 1, 2],
    cameraTarget: [3, 4, 5],
  }).name,
  "View 7",
  "A blank camera-view name should use the next room-scoped fallback name."
);

function makeSavedView(index: number): SavedView {
  return {
    id: `view-${index}`,
    name: `View ${index}`,
    cameraPosition: [index, index + 1, index + 2],
    cameraTarget: [index + 3, index + 4, index + 5],
    timestamp: index,
  };
}

const originalViews = Array.from({ length: 6 }, (_, index) =>
  makeSavedView(index + 1)
);
const cappedViews = appendDesignPageSavedCameraView(
  originalViews,
  makeSavedView(7),
  6
);
assert.deepEqual(
  cappedViews.map((view) => view.id),
  ["view-2", "view-3", "view-4", "view-5", "view-6", "view-7"],
  "Appending should retain the newest six views in chronological display order."
);
assert.deepEqual(
  originalViews.map((view) => view.id),
  ["view-1", "view-2", "view-3", "view-4", "view-5", "view-6"],
  "Appending a saved view should not mutate the existing room views."
);

assert.deepEqual(
  mapDesignPageSavedCameraViewsToLegacy(cappedViews.slice(-2), 37),
  [
    {
      name: "View 6",
      view: { pos: [6, 7, 8], target: [9, 10, 11], fov: 37 },
    },
    {
      name: "View 7",
      view: { pos: [7, 8, 9], target: [10, 11, 12], fov: 37 },
    },
  ],
  "Legacy camera views should preserve order and apply the current field of view."
);

const remainingViews = removeDesignPageSavedCameraView(
  cappedViews,
  "view-4"
);
assert.deepEqual(
  remainingViews.map((view) => view.id),
  ["view-2", "view-3", "view-5", "view-6", "view-7"],
  "Removing a named view should keep every other view in its existing order."
);
assert.deepEqual(
  cappedViews.map((view) => view.id),
  ["view-2", "view-3", "view-4", "view-5", "view-6", "view-7"],
  "Removing a named view should not mutate the source collection."
);

console.log("design page layout-version and named-camera-view controller guardrails passed");
