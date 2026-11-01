/**
 * Pure geometry helpers used by the design editor.
 *
 * These are stateless utilities that do not depend on React state or hooks.
 * Keeping them here lets PageContent stay lean and makes the logic testable in isolation.
 */

import { type AABB } from "@/lib/snapGuides";
import {
  getRotatedFootprint,
  snapRotationRadians,
} from "@/lib/design-page-utils";
import type { RoomPlanPolygonPoint, RoomPlanShape } from "@/lib/room-types";
import { EDITOR_GEOMETRY_TOLERANCES } from "@/lib/editor-geometry-tolerances";
import { clampToCustomPolygonRoom } from "@/lib/room-polygon-fit";
import type { FurnitureRoomContext } from "@/lib/furniture-room-fit";

export {
  isFootprintInsideRoomPolygon,
  isPlacedItemInsideRoomPolygon,
  isPointInsideRoomPolygon,
  isPointInsideRoomPolygonWithHoles,
  polygonIntersectsFootprint,
} from "@/lib/room-polygon-fit";

// Re-export AABB so callers don't need a separate snapGuides import for this type.
export type { AABB };

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const FURNITURE_WALL_CLEARANCE_METERS = 0.02;

export function getFurnitureWallInset(wallThickness: number): number {
  const wall = Number.isFinite(wallThickness) ? Math.max(0, wallThickness) : 0;
  return wall / 2 + FURNITURE_WALL_CLEARANCE_METERS;
}

export function isAabbWithinPadding(
  target: AABB,
  reference: AABB,
  padding: number
): boolean {
  return !(
    target.maxX < reference.minX - padding ||
    target.minX > reference.maxX + padding ||
    target.maxZ < reference.minZ - padding ||
    target.minZ > reference.maxZ + padding
  );
}

export function resolveAxisAlignedRoomItemBounds({
  roomOriginX,
  roomOriginZ,
  roomWidth,
  roomDepth,
  wallContactInset,
  itemWidth,
  itemDepth,
}: {
  roomOriginX: number;
  roomOriginZ: number;
  roomWidth: number;
  roomDepth: number;
  wallContactInset: number;
  itemWidth: number;
  itemDepth: number;
}): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: roomOriginX - roomWidth / 2 + wallContactInset + itemWidth / 2,
    maxX: roomOriginX + roomWidth / 2 - wallContactInset - itemWidth / 2,
    minZ: roomOriginZ - roomDepth / 2 + wallContactInset + itemDepth / 2,
    maxZ: roomOriginZ + roomDepth / 2 - wallContactInset - itemDepth / 2,
  };
}

export function resolvePointerRotationRadians({
  deltaX,
  deltaZ,
  snapToStep,
  snapEnabled,
  snapStepRadians,
}: {
  deltaX: number;
  deltaZ: number;
  snapToStep: boolean;
  snapEnabled: boolean;
  snapStepRadians: number;
}): number | null {
  if (
    Math.abs(deltaX) < EDITOR_GEOMETRY_TOLERANCES.rotationVectorMeters &&
    Math.abs(deltaZ) < EDITOR_GEOMETRY_TOLERANCES.rotationVectorMeters
  ) {
    return null;
  }
  const rotation = Math.atan2(deltaX, -deltaZ);
  return snapToStep && snapEnabled
    ? snapRotationRadians(rotation, snapStepRadians)
    : rotation;
}

/**
 * Clamps an item centre position so it sits fully inside the room walls. Furniture (`furniture`: what is known of the room
 * beyond its outline) in a drawn or imported room also keeps its real footprint 2 cm off the walls, panels and columns as the
 * 3D view draws them (lib/furniture-room-fit.ts); a built-in on furniture's rule passes none and keeps the line's clamp.
 */
export function clampToRoom(
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  roomW: number,
  roomD: number,
  wall: number,
  rotationY: number = 0,
  planShape: RoomPlanShape = "rectangle",
  planPolygon?: RoomPlanPolygonPoint[],
  planHoles: RoomPlanPolygonPoint[][] = [],
  furniture?: FurnitureRoomContext
): [number, number] {
  const [effW, effD] = getRotatedFootprint(itemWidth, itemDepth, rotationY);
  const minX = -roomW / 2 + wall + effW / 2;
  const maxX = roomW / 2 - wall - effW / 2;
  const minZ = -roomD / 2 + wall + effD / 2;
  const maxZ = roomD / 2 - wall - effD / 2;

  if (planShape === "custom_polygon" && planPolygon?.length) {
    return clampToCustomPolygonRoom(x, z, effW, effD, wall, planPolygon, planHoles, { minX, maxX, minZ, maxZ }, furniture &&
      { width: itemWidth, depth: itemDepth, rotationY, clearance: FURNITURE_WALL_CLEARANCE_METERS, context: furniture });
  }

  if (planShape === "l_shape") {
    const notchW = roomW * 0.42;
    const notchD = roomD * 0.42;
    const usableRects = [
      {
        minX,
        maxX,
        minZ,
        maxZ: roomD / 2 - notchD - wall - effD / 2,
      },
      {
        minX,
        maxX: roomW / 2 - notchW - wall - effW / 2,
        minZ,
        maxZ,
      },
    ].filter((rect) => rect.minX <= rect.maxX && rect.minZ <= rect.maxZ);

    if (usableRects.length) {
      let best: { x: number; z: number; distanceSq: number } | null = null;
      for (const rect of usableRects) {
        const candidateX = Math.max(rect.minX, Math.min(rect.maxX, x));
        const candidateZ = Math.max(rect.minZ, Math.min(rect.maxZ, z));
        const dx = candidateX - x;
        const dz = candidateZ - z;
        const distanceSq = dx * dx + dz * dz;
        if (!best || distanceSq < best.distanceSq) {
          best = { x: candidateX, z: candidateZ, distanceSq };
        }
      }
      if (best) return [best.x, best.z];
    }
  }

  const clampedX = clampValue(x, minX, maxX);
  const clampedZ = clampValue(z, minZ, maxZ);

  return [clampedX, clampedZ];
}

/** Returns true when two AABBs overlap on the XZ plane. */
export function aabbIntersects(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Approximate bounding-circle radius from item width/depth (metres). */
export function footprintRadius(w: number, d: number): number {
  return Math.sqrt((w / 2) ** 2 + (d / 2) ** 2);
}

/**
 * Pushes item A away from item B if their bounding circles overlap.
 * Returns the new [x, z] for item A.
 */
export function separateIfOverlapping(
  ax: number,
  az: number,
  ar: number,
  bx: number,
  bz: number,
  br: number,
  padding = 0.15
): [number, number] {
  const dx = ax - bx;
  const dz = az - bz;
  const dist =
    Math.sqrt(dx * dx + dz * dz) ||
    EDITOR_GEOMETRY_TOLERANCES.polygonMeters;
  const minDist = ar + br + padding;

  if (dist >= minDist) return [ax, az];

  const push = minDist - dist;
  const nx = dx / dist;
  const nz = dz / dist;

  return [ax + nx * push, az + nz * push];
}
