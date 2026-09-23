import * as THREE from "three";

export type Plan2DCameraControls = {
  target: THREE.Vector3;
  update: () => void;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
};

export type Plan2DCameraInvariantFit = {
  offsetX: number;
  offsetZ: number;
  up: [number, number, number];
  zoom?: number;
};

export type Plan2DCameraInvariantStatus = {
  valid: boolean;
  reason: "valid" | "not_orthographic" | "edge_on" | "up_parallel" | "bad_target" | "bad_zoom";
  directionY: number;
  upDotDirection: number;
  targetY: number;
};

const PLAN_2D_DIRECTION_Y_MIN = 0.98;
const PLAN_2D_UP_DOT_DIRECTION_MAX = 0.08;
const PLAN_2D_TARGET_Y_MAX = 0.001;

export function applyPlan2DCameraInvariant(params: {
  camera: THREE.OrthographicCamera;
  controls?: Plan2DCameraControls | null;
  fit: Plan2DCameraInvariantFit;
  cameraHeightMeters: number;
  updateProjection?: (camera: THREE.Camera | null) => void;
}) {
  const { camera, controls, fit, cameraHeightMeters, updateProjection } = params;
  const height = Math.max(1, cameraHeightMeters);

  camera.position.set(fit.offsetX, height, fit.offsetZ);
  camera.up.set(...fit.up).normalize();
  if (typeof fit.zoom === "number" && Number.isFinite(fit.zoom) && fit.zoom > 0) {
    camera.zoom = fit.zoom;
  }

  if (controls) {
    controls.target.set(fit.offsetX, 0, fit.offsetZ);
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
  }

  camera.lookAt(fit.offsetX, 0, fit.offsetZ);
  updateProjection?.(camera);
  camera.updateProjectionMatrix();
  controls?.update();
}

export function getPlan2DCameraInvariantStatus(
  camera: THREE.Camera | null,
  controls?: Plan2DCameraControls | null
): Plan2DCameraInvariantStatus {
  if (!(camera instanceof THREE.OrthographicCamera)) {
    return {
      valid: false,
      reason: "not_orthographic",
      directionY: 0,
      upDotDirection: 1,
      targetY: controls?.target.y ?? 0,
    };
  }

  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const directionY = direction.y;
  const upDotDirection = Math.abs(camera.up.clone().normalize().dot(direction));
  const targetY = controls?.target.y ?? 0;

  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) {
    return { valid: false, reason: "bad_zoom", directionY, upDotDirection, targetY };
  }
  if (Math.abs(directionY) < PLAN_2D_DIRECTION_Y_MIN) {
    return { valid: false, reason: "edge_on", directionY, upDotDirection, targetY };
  }
  if (upDotDirection > PLAN_2D_UP_DOT_DIRECTION_MAX) {
    return { valid: false, reason: "up_parallel", directionY, upDotDirection, targetY };
  }
  if (Math.abs(targetY) > PLAN_2D_TARGET_Y_MAX) {
    return { valid: false, reason: "bad_target", directionY, upDotDirection, targetY };
  }

  return { valid: true, reason: "valid", directionY, upDotDirection, targetY };
}

export function isPlan2DCameraDegenerate(
  camera: THREE.Camera | null,
  controls?: Plan2DCameraControls | null
) {
  return !getPlan2DCameraInvariantStatus(camera, controls).valid;
}

export function recoverPlan2DCameraIfNeeded(params: {
  camera: THREE.Camera | null;
  controls?: Plan2DCameraControls | null;
  fit: Plan2DCameraInvariantFit;
  cameraHeightMeters: number;
  updateProjection?: (camera: THREE.Camera | null) => void;
}) {
  const { camera, controls, fit, cameraHeightMeters, updateProjection } = params;
  const status = getPlan2DCameraInvariantStatus(camera, controls);
  if (status.valid || !(camera instanceof THREE.OrthographicCamera)) {
    return { recovered: false, status };
  }

  applyPlan2DCameraInvariant({
    camera,
    controls,
    fit: {
      ...fit,
      zoom: fit.zoom ?? camera.zoom,
    },
    cameraHeightMeters,
    updateProjection,
  });

  return {
    recovered: true,
    status: getPlan2DCameraInvariantStatus(camera, controls),
    previousStatus: status,
  };
}
