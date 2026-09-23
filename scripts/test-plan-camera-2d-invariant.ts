import assert from "node:assert/strict";
import * as THREE from "three";
import {
  applyPlan2DCameraInvariant,
  getPlan2DCameraInvariantStatus,
  isPlan2DCameraDegenerate,
  recoverPlan2DCameraIfNeeded,
  type Plan2DCameraControls,
} from "../lib/plan-camera-2d";

function makeCamera() {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 2000);
  camera.position.set(0, 12, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function makeControls(): Plan2DCameraControls {
  return {
    target: new THREE.Vector3(0, 0, 0),
    update: () => undefined,
  };
}

{
  const camera = makeCamera();
  const controls = makeControls();
  applyPlan2DCameraInvariant({
    camera,
    controls,
    fit: { offsetX: 2, offsetZ: -3, up: [0, 0, -1], zoom: 80 },
    cameraHeightMeters: 18,
  });

  const status = getPlan2DCameraInvariantStatus(camera, controls);
  assert.equal(status.valid, true, "normal 2D camera invariant should be valid");
  assert.equal(camera.zoom, 80);
  assert.equal(controls.target.x, 2);
  assert.equal(controls.target.y, 0);
  assert.equal(controls.target.z, -3);
  assert.equal(controls.minPolarAngle, 0);
  assert.equal(controls.maxPolarAngle, Math.PI);
}

{
  const camera = makeCamera();
  const controls = makeControls();
  applyPlan2DCameraInvariant({
    camera,
    controls,
    fit: { offsetX: -4, offsetZ: 1, up: [1, 0, 0], zoom: 92 },
    cameraHeightMeters: 16,
  });

  assert.equal(
    getPlan2DCameraInvariantStatus(camera, controls).valid,
    true,
    "rotated 2D camera invariant should be valid"
  );
}

{
  const camera = makeCamera();
  const controls = makeControls();
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);

  assert.equal(
    isPlan2DCameraDegenerate(camera, controls),
    true,
    "Y-up top-down camera is degenerate because up is parallel to view direction"
  );

  const recovery = recoverPlan2DCameraIfNeeded({
    camera,
    controls,
    fit: { offsetX: 0, offsetZ: 0, up: [0, 0, -1], zoom: 70 },
    cameraHeightMeters: 14,
  });

  assert.equal(recovery.recovered, true, "degenerate 2D camera should recover");
  assert.equal(
    getPlan2DCameraInvariantStatus(camera, controls).valid,
    true,
    "recovered 2D camera should be valid"
  );
}

{
  const camera = makeCamera();
  const controls = makeControls();
  camera.position.set(0, 1, 12);
  controls.target.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);

  assert.equal(
    getPlan2DCameraInvariantStatus(camera, controls).reason,
    "edge_on",
    "edge-on plan camera should be detected before rooms collapse into lines"
  );
}

console.log("Plan 2D camera invariant tests passed.");
