/**
 * Pure geometry helpers used by the design editor.
 *
 * These are stateless utilities that do not depend on React state or hooks.
 * Keeping them here lets PageContent stay lean and makes the logic testable in isolation.
 */

import { type AABB } from "@/lib/snapGuides";
import { getRotatedFootprint } from "@/lib/design-page-utils";

// Re-export AABB so callers don't need a separate snapGuides import for this type.
export type { AABB };

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
  rotationY: number = 0
): [number, number] {
  const [effW, effD] = getRotatedFootprint(itemWidth, itemDepth, rotationY);
  const minX = -roomW / 2 + wall + effW / 2;
  const maxX = roomW / 2 - wall - effW / 2;
  const minZ = -roomD / 2 + wall + effD / 2;
  const maxZ = roomD / 2 - wall - effD / 2;

  const clampedX = Math.max(minX, Math.min(maxX, x));
  const clampedZ = Math.max(minZ, Math.min(maxZ, z));

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

