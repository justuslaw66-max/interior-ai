/**
 * Pure geometry helpers used by the design editor.
 *
 * These are stateless utilities that do not depend on React state or hooks.
 * Keeping them here lets PageContent stay lean and makes the logic testable in isolation.
 */

import { type AABB } from "@/lib/snapGuides";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { RoomPlanPolygonPoint, RoomPlanShape } from "@/lib/room-types";

// Re-export AABB so callers don't need a separate snapGuides import for this type.
export type { AABB };

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getFurnitureWallInset(wallThickness: number): number {
  const wall = Number.isFinite(wallThickness) ? Math.max(0, wallThickness) : 0;
  return Math.max(0.08, wall + 0.04);
}

function isPointOnSegment(
  point: RoomPlanPolygonPoint,
  first: RoomPlanPolygonPoint,
  second: RoomPlanPolygonPoint,
  epsilon = 0.0001
): boolean {
  const cross =
    (point.z - first.z) * (second.x - first.x) -
    (point.x - first.x) * (second.z - first.z);
  if (Math.abs(cross) > epsilon) return false;

  return (
    point.x >= Math.min(first.x, second.x) - epsilon &&
    point.x <= Math.max(first.x, second.x) + epsilon &&
    point.z >= Math.min(first.z, second.z) - epsilon &&
    point.z <= Math.max(first.z, second.z) + epsilon
  );
}

export function isPointInsideRoomPolygon(
  point: RoomPlanPolygonPoint,
  polygon: RoomPlanPolygonPoint[]
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];

    if (isPointOnSegment(point, previous, current)) {
      return true;
    }

    const intersects =
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) /
          (previous.z - current.z) +
          current.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

export function isFootprintInsideRoomPolygon(
  x: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
  polygon: RoomPlanPolygonPoint[]
): boolean {
  const samplePoints: RoomPlanPolygonPoint[] = [
    { x: x - halfWidth, z: z - halfDepth },
    { x, z: z - halfDepth },
    { x: x + halfWidth, z: z - halfDepth },
    { x: x - halfWidth, z },
    { x, z },
    { x: x + halfWidth, z },
    { x: x - halfWidth, z: z + halfDepth },
    { x, z: z + halfDepth },
    { x: x + halfWidth, z: z + halfDepth },
  ];

  return samplePoints.every((samplePoint) =>
    isPointInsideRoomPolygon(samplePoint, polygon)
  );
}

function clampToCustomPolygonRoom(
  x: number,
  z: number,
  effectiveWidth: number,
  effectiveDepth: number,
  wall: number,
  polygon: RoomPlanPolygonPoint[],
  fallbackBounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): [number, number] {
  if (polygon.length < 3) {
    return [
      clampValue(x, fallbackBounds.minX, fallbackBounds.maxX),
      clampValue(z, fallbackBounds.minZ, fallbackBounds.maxZ),
    ];
  }

  const clearanceHalfWidth = effectiveWidth / 2 + wall;
  const clearanceHalfDepth = effectiveDepth / 2 + wall;
  const minX = Math.min(...polygon.map((point) => point.x)) + clearanceHalfWidth;
  const maxX = Math.max(...polygon.map((point) => point.x)) - clearanceHalfWidth;
  const minZ = Math.min(...polygon.map((point) => point.z)) + clearanceHalfDepth;
  const maxZ = Math.max(...polygon.map((point) => point.z)) - clearanceHalfDepth;

  if (minX > maxX || minZ > maxZ) {
    return [
      clampValue(x, fallbackBounds.minX, fallbackBounds.maxX),
      clampValue(z, fallbackBounds.minZ, fallbackBounds.maxZ),
    ];
  }

  const clampedX = clampValue(x, minX, maxX);
  const clampedZ = clampValue(z, minZ, maxZ);

  if (
    isFootprintInsideRoomPolygon(
      clampedX,
      clampedZ,
      clearanceHalfWidth,
      clearanceHalfDepth,
      polygon
    )
  ) {
    return [clampedX, clampedZ];
  }

  const xCandidates = new Set<number>([clampedX, minX, maxX]);
  const zCandidates = new Set<number>([clampedZ, minZ, maxZ]);

  for (const point of polygon) {
    xCandidates.add(clampValue(point.x - clearanceHalfWidth, minX, maxX));
    xCandidates.add(clampValue(point.x + clearanceHalfWidth, minX, maxX));
    zCandidates.add(clampValue(point.z - clearanceHalfDepth, minZ, maxZ));
    zCandidates.add(clampValue(point.z + clearanceHalfDepth, minZ, maxZ));
  }

  let best: { x: number; z: number; distanceSq: number } | null = null;
  for (const candidateX of xCandidates) {
    for (const candidateZ of zCandidates) {
      if (
        !isFootprintInsideRoomPolygon(
          candidateX,
          candidateZ,
          clearanceHalfWidth,
          clearanceHalfDepth,
          polygon
        )
      ) {
        continue;
      }

      const distanceSq = (candidateX - x) ** 2 + (candidateZ - z) ** 2;
      if (!best || distanceSq < best.distanceSq) {
        best = { x: candidateX, z: candidateZ, distanceSq };
      }
    }
  }

  return best
    ? [best.x, best.z]
    : [
        clampValue(x, fallbackBounds.minX, fallbackBounds.maxX),
        clampValue(z, fallbackBounds.minZ, fallbackBounds.maxZ),
      ];
}

/**
 * Clamps an item centre position so it sits fully inside the room walls.
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
  planPolygon?: RoomPlanPolygonPoint[]
): [number, number] {
  const [effW, effD] = getRotatedFootprint(itemWidth, itemDepth, rotationY);
  const minX = -roomW / 2 + wall + effW / 2;
  const maxX = roomW / 2 - wall - effW / 2;
  const minZ = -roomD / 2 + wall + effD / 2;
  const maxZ = roomD / 2 - wall - effD / 2;

  if (planShape === "custom_polygon" && planPolygon?.length) {
    return clampToCustomPolygonRoom(x, z, effW, effD, wall, planPolygon, {
      minX,
      maxX,
      minZ,
      maxZ,
    });
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
  const dist = Math.sqrt(dx * dx + dz * dz) || 0.0001;
  const minDist = ar + br + padding;

  if (dist >= minDist) return [ax, az];

  const push = minDist - dist;
  const nx = dx / dist;
  const nz = dz / dist;

  return [ax + nx * push, az + nz * push];
}
