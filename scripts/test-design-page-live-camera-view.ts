import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CAMERA_VIEW_SETTLE_MS,
  cameraViewChanged,
  createLiveCameraViewStore,
  createSettleTimer,
  readCameraViewFromControls,
  type SettleTimers,
} from "@/lib/design-page-live-camera-view";
import type { CameraView } from "@/lib/design-page-types";

const view = (x: number, targetX = 0, fov?: number): CameraView => ({
  pos: [x, 2, 5],
  target: [targetX, 0, 0],
  fov,
});

// The change threshold is the one updateCameraViewFromScene always used.
assert.equal(cameraViewChanged(view(1), view(1.0009)), false);
assert.equal(cameraViewChanged(view(1), view(1.002)), true);
assert.equal(cameraViewChanged(view(1, 0), view(1, 0.002)), true);
assert.equal(cameraViewChanged(view(1, 0, 45), view(1, 0, undefined)), false);
assert.equal(cameraViewChanged(view(1, 0, 45), view(1, 0, 45.02)), true);

// The live store notifies only for a real move, and stops after unsubscribe.
const store = createLiveCameraViewStore(view(1));
let notifications = 0;
const unsubscribe = store.subscribe(() => {
  notifications += 1;
});
store.publish(view(1.0005));
assert.equal(notifications, 0, "A sub-millimetre move should not re-render the navigator.");
assert.deepEqual(store.getSnapshot(), view(1));
store.publish(view(2));
assert.equal(notifications, 1);
assert.deepEqual(store.getSnapshot(), view(2));
unsubscribe();
store.publish(view(3));
assert.equal(notifications, 1);
assert.deepEqual(store.getSnapshot(), view(3));

// The view read from OrbitControls: a perspective camera has a fov, an
// orthographic one does not.
assert.deepEqual(
  readCameraViewFromControls({
    object: { position: { x: 1, y: 2, z: 3 }, fov: 50 },
    target: { x: 4, y: 5, z: 6 },
  }),
  { pos: [1, 2, 3], target: [4, 5, 6], fov: 50 }
);
assert.equal(
  readCameraViewFromControls({
    object: { position: { x: 1, y: 2, z: 3 } },
    target: { x: 0, y: 0, z: 0 },
  }).fov,
  undefined
);

// The settle timer: a stream of changes commits once, after the last one.
let now = 0;
const queue: { at: number; callback: () => void; id: number }[] = [];
let nextId = 1;
const fakeTimers: SettleTimers = {
  set: (callback, delayMs) => {
    const id = nextId++;
    queue.push({ at: now + delayMs, callback, id });
    return id;
  },
  clear: (handle) => {
    const index = queue.findIndex((entry) => entry.id === handle);
    if (index >= 0) queue.splice(index, 1);
  },
};
const advance = (ms: number) => {
  now += ms;
  for (const entry of [...queue].sort((a, b) => a.at - b.at)) {
    if (entry.at > now) continue;
    queue.splice(queue.indexOf(entry), 1);
    entry.callback();
  }
};
const settle = createSettleTimer(fakeTimers, CAMERA_VIEW_SETTLE_MS);
let commits = 0;
for (let frame = 0; frame < 30; frame += 1) {
  settle.schedule(() => {
    commits += 1;
  });
  advance(16);
}
assert.equal(commits, 0, "Orbit frames (and damping's glide) should not commit state.");
assert.equal(settle.pending(), true);
advance(CAMERA_VIEW_SETTLE_MS - 17);
assert.equal(commits, 0);
advance(1);
assert.equal(commits, 1, "The view should commit once the controls are quiet.");
assert.equal(settle.pending(), false);
settle.schedule(() => {
  commits += 1;
});
settle.cancel();
advance(CAMERA_VIEW_SETTLE_MS * 2);
assert.equal(commits, 1, "Cancel (unmount) should drop a pending commit.");

// Wiring: the orbit handler must not set page state per frame, and the
// navigator reads the live store instead of the committed cameraView.
const root = process.cwd();
const read = (path: string) =>
  readFileSync(join(root, path), "utf8").replace(/\s+/g, " ");
const canvasController = read("lib/useDesignPageCanvasInteractionController.ts");
assert.ok(
  canvasController.includes(
    "const handleOrbitChange = useSettledOrbitCameraView( refs, updateCameraViewFromScene );"
  ),
  "OrbitControls onChange should go through the settled live-camera handler."
);
const orbitHook = read("lib/useDesignPageLiveCameraView.ts");
assert.match(
  orbitHook,
  /liveCameraView\.publish\(readCameraViewFromControls\(controls\)\); settleTimer\.schedule\(\(\) => \{ if \(!cameraAnimating\.current\) commit\(\); \}\);/,
  "Each orbit change should publish the live view and only schedule the commit."
);
assert.ok(
  read("lib/design-page-viewport-workspace-read-model.ts").includes(
    "liveCameraView: sources.viewportShell.state.camera.liveCameraView,"
  ),
  "The navigator should receive the live camera store."
);
assert.ok(
  read("components/editor/RoomPanNavigator.tsx").includes(
    "const { pos: cameraPosition, target: cameraTarget } = useLiveCameraView(liveCameraView);"
  ),
  "The navigator marker should follow the live camera."
);
assert.ok(
  read("lib/useDesignPageCameraBridgeController.ts").includes(
    "const liveCameraView = useLiveCameraViewStore(cameraView, cameraViewRef);"
  ),
  "Committed views should sync cameraViewRef and the live store."
);

console.log("Live camera view tests passed.");
