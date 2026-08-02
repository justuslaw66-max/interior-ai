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

function isPointOnSegment(
  point: RoomPlanPolygonPoint,
  first: RoomPlanPolygonPoint,
  second: RoomPlanPolygonPoint,
  epsilon = EDITOR_GEOMETRY_TOLERANCES.polygonMeters
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

export function isPointInsideRoomPolygonWithHoles(
  point: RoomPlanPolygonPoint,
  polygon: RoomPlanPolygonPoint[],
  holes: RoomPlanPolygonPoint[][] = []
): boolean {
  return (
    isPointInsideRoomPolygon(point, polygon) &&
    !holes.some(
      (hole) => hole.length >= 3 && isPointInsideRoomPolygon(point, hole)
    )
  );
}

function lineSegmentsIntersect(
  firstStart: RoomPlanPolygonPoint,
  firstEnd: RoomPlanPolygonPoint,
  secondStart: RoomPlanPolygonPoint,
  secondEnd: RoomPlanPolygonPoint
): boolean {
  const cross = (
    origin: RoomPlanPolygonPoint,
    first: RoomPlanPolygonPoint,
    second: RoomPlanPolygonPoint
  ) =>
    (first.x - origin.x) * (second.z - origin.z) -
    (first.z - origin.z) * (second.x - origin.x);
  const firstSideA = cross(firstStart, firstEnd, secondStart);
  const firstSideB = cross(firstStart, firstEnd, secondEnd);
  const secondSideA = cross(secondStart, secondEnd, firstStart);
  const secondSideB = cross(secondStart, secondEnd, firstEnd);
  const epsilon = EDITOR_GEOMETRY_TOLERANCES.polygonMeters;

  if (
    Math.abs(firstSideA) <= epsilon &&
    isPointOnSegment(secondStart, firstStart, firstEnd, epsilon)
  ) return true;
  if (
    Math.abs(firstSideB) <= epsilon &&
    isPointOnSegment(secondEnd, firstStart, firstEnd, epsilon)
  ) return true;
  if (
    Math.abs(secondSideA) <= epsilon &&
    isPointOnSegment(firstStart, secondStart, secondEnd, epsilon)
  ) return true;
  if (
    Math.abs(secondSideB) <= epsilon &&
    isPointOnSegment(firstEnd, secondStart, secondEnd, epsilon)
  ) return true;

  return (
    firstSideA * firstSideB < -epsilon &&
    secondSideA * secondSideB < -epsilon
  );
}

function polygonIntersectsFootprint(
  polygon: RoomPlanPolygonPoint[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): boolean {
  const footprint = [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ },
  ];
  if (
    polygon.some(
      (point) =>
        point.x >= minX &&
        point.x <= maxX &&
        point.z >= minZ &&
        point.z <= maxZ
    )
  ) return true;

  return polygon.some((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return footprint.some((corner, edgeIndex) =>
      lineSegmentsIntersect(
        point,
        next,
        corner,
        footprint[(edgeIndex + 1) % footprint.length]
      )
    );
  });
}

export function isFootprintInsideRoomPolygon(
  x: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
  polygon: RoomPlanPolygonPoint[],
  holes: RoomPlanPolygonPoint[][] = []
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

  if (
    !samplePoints.every((samplePoint) =>
      isPointInsideRoomPolygonWithHoles(samplePoint, polygon, holes)
    )
  ) return false;

  return !holes.some(
    (hole) =>
      hole.length >= 3 &&
      polygonIntersectsFootprint(
        hole,
        x - halfWidth,
        x + halfWidth,
        z - halfDepth,
        z + halfDepth
      )
  );
}

function clampToCustomPolygonRoom(
  x: number,
  z: number,
  effectiveWidth: number,
  effectiveDepth: number,
  wall: number,
  polygon: RoomPlanPolygonPoint[],
  holes: RoomPlanPolygonPoint[][],
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
      polygon,
      holes
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
  const holeClearanceX =
    clearanceHalfWidth + EDITOR_GEOMETRY_TOLERANCES.clearanceMeters;
  const holeClearanceZ =
    clearanceHalfDepth + EDITOR_GEOMETRY_TOLERANCES.clearanceMeters;
  for (const point of holes.flat()) {
    xCandidates.add(clampValue(point.x - holeClearanceX, minX, maxX));
    xCandidates.add(clampValue(point.x + holeClearanceX, minX, maxX));
    zCandidates.add(clampValue(point.z - holeClearanceZ, minZ, maxZ));
    zCandidates.add(clampValue(point.z + holeClearanceZ, minZ, maxZ));
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
          polygon,
          holes
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
  planPolygon?: RoomPlanPolygonPoint[],
  planHoles: RoomPlanPolygonPoint[][] = []
): [number, number] {
  const [effW, effD] = getRotatedFootprint(itemWidth, itemDepth, rotationY);
  const minX = -roomW / 2 + wall + effW / 2;
  const maxX = roomW / 2 - wall - effW / 2;
  const minZ = -roomD / 2 + wall + effD / 2;
  const maxZ = roomD / 2 - wall - effD / 2;

  if (planShape === "custom_polygon" && planPolygon?.length) {
    return clampToCustomPolygonRoom(x, z, effW, effD, wall, planPolygon, planHoles, {
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
