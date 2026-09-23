import * as THREE from "three";
import { MIN_OPENING_CORNER_CLEARANCE_METERS } from "@/lib/floor-plan-tracing";

/** Below this |wall normal . view ray| the wall plane is too oblique for a two-axis drag. */
export const WINDOW_WALL_PLANE_MIN_FACING = 0.4;

export type WindowDragPlane = {
  plane: THREE.Plane;
  origin: THREE.Vector3;
  /** False when the drag only slides along the wall and keeps the sill. */
  vertical: boolean;
};

/**
 * A wall that faces the camera drags in its own plane, so the window follows the pointer on both
 * axes. A wall seen at a grazing angle maps tiny pointer wobbles to metres along that plane, so it
 * drags on the floor plane instead (the projected physical tangent) and leaves the sill unchanged.
 */
export function createWindowDragPlane(
  ray: THREE.Ray, grabPoint: THREE.Vector3, wallNormal: THREE.Vector3, floorWorldY: number
): WindowDragPlane {
  const wall = { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(wallNormal, grabPoint),
    origin: grabPoint.clone(), vertical: true };
  if (Math.abs(wallNormal.dot(ray.direction)) >= WINDOW_WALL_PLANE_MIN_FACING) return wall;
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorWorldY);
  const origin = ray.intersectPlane(floor, new THREE.Vector3());
  return origin ? { plane: floor, origin, vertical: false } : wall;
}

export type WindowDragBounds = {
  offset: number;
  sourceOffset: number;
  sourceDirection: number;
  bottom: number;
  width: number;
  height: number;
  wallLength: number;
  wallHeight: number;
};

/** Keep the complete opening on the wall, without changing its size or grab point. */
export function getWindowDragPosition(
  start: WindowDragBounds, horizontalDelta: number, verticalDelta: number
) {
  const limit = Math.max(0, Math.floor(((start.wallLength - start.width) / 2 - MIN_OPENING_CORNER_CLEARANCE_METERS + 1e-9) * 1000) / 1000);
  const offset = Math.max(-limit, Math.min(limit, start.offset + horizontalDelta));
  const bottom = Math.max(0, Math.min(start.wallHeight - start.height, start.bottom + verticalDelta));
  return {
    offsetMeters: Math.round((start.sourceOffset + (offset - start.offset) * start.sourceDirection) * 1000) / 1000,
    bottomMeters: Math.round(bottom * 1000) / 1000,
  };
}
