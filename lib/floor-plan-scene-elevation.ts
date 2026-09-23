import type { CameraView } from "@/lib/design-page-types";

/**
 * Pure projection helpers shared by room surfaces and furniture. Canonical
 * elevation stays in integer millimetres at rest and is converted only at the
 * renderer boundary.
 */
export function resolveCanonicalFloorElevationMeters(value: {
  floorElevationMm?: number;
}): number | null {
  return typeof value.floorElevationMm === "number" &&
    Number.isInteger(value.floorElevationMm)
    ? value.floorElevationMm / 1000
    : null;
}

const FLOOR_UNDERSIDE_CUTAWAY_SLAB_FRACTION = 0.35;

/**
 * Returns the camera threshold used to hide a floor during underside
 * inspection. `floorWorldY` is the finished-floor world plane; slab thickness
 * extends below that plane and does not change the canonical floor elevation.
 * This is a render-visibility threshold, not the slab bottom or a clipping
 * plane.
 */
export function resolveFloorUndersideCutawayElevationMeters(
  floorWorldY: number,
  slabThicknessMeters: number
): number {
  return (
    floorWorldY -
    slabThicknessMeters * FLOOR_UNDERSIDE_CUTAWAY_SLAB_FRACTION
  );
}

/**
 * Projects a room-relative camera preset into world space without mutating it.
 * `origin` is the room's plan centre (x/z) and finished-floor world plane (y).
 */
export function resolveCameraViewForRoomOrigin(
  view: CameraView,
  origin: { x: number; y: number; z: number }
): CameraView {
  return {
    pos: [view.pos[0] + origin.x, view.pos[1] + origin.y, view.pos[2] + origin.z],
    target: [view.target[0] + origin.x, view.target[1] + origin.y, view.target[2] + origin.z],
    fov: view.fov,
  };
}

/** Projects a floor-relative camera preset into world space without mutating it. */
export function resolveCameraViewForFloorWorldY(
  view: CameraView,
  floorWorldY: number
): CameraView {
  return resolveCameraViewForRoomOrigin(view, { x: 0, y: floorWorldY, z: 0 });
}

export function addFloorElevationToItemPosition(
  position: [number, number, number],
  floorElevationMeters: number
): [number, number, number] {
  return [
    position[0],
    (position[1] ?? 0) + floorElevationMeters,
    position[2],
  ];
}

export function removeFloorElevationFromItemPosition(
  position: [number, number, number],
  floorElevationMeters: number
): [number, number, number] {
  return [position[0], position[1] - floorElevationMeters, position[2]];
}
