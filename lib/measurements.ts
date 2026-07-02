/**
 * Measurement utilities for real-time guidance during furniture placement
 */

import { AABB } from "@/lib/snapGuides";

type WalkwayDirection = "front" | "back" | "left" | "right";

export interface Measure {
  label: string;
  valueCm: number;
  severity?: "warn" | "ok" | "good";
  at: [number, number, number]; // HTML overlay position
}

function rangesOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return !(maxA < minB || minA > maxB);
}

/**
 * Compute gap between two AABBs along an axis
 * Returns distance in meters (-1 if not applicable)
 */
export function computeGapBetween(
  from: AABB,
  to: AABB,
  axis: "x" | "z"
): number {
  if (axis === "x") {
    // If items are on X axis, compute gap
    const leftMax = Math.max(from.minX, to.minX);
    const rightMin = Math.min(from.maxX, to.maxX);
    
    if (rightMin > leftMax) {
      // Items overlap on X axis
      return -1;
    }
    
    // Gap = distance between closest edges
    if (from.centerX < to.centerX) {
      return to.minX - from.maxX; // gap from 'from' right edge to 'to' left edge
    } else {
      return from.minX - to.maxX; // gap from 'to' right edge to 'from' left edge
    }
  } else {
    // Z axis
    const frontMax = Math.max(from.minZ, to.minZ);
    const backMin = Math.min(from.maxZ, to.maxZ);
    
    if (backMin > frontMax) {
      // Items overlap on Z axis
      return -1;
    }
    
    // Gap along Z
    if (from.centerZ < to.centerZ) {
      return to.minZ - from.maxZ;
    } else {
      return from.minZ - to.maxZ;
    }
  }
}

/**
 * Compute walkway clearance to nearest obstacle
 * Returns distance in meters
 */
export function computeWalkwayClearance(
  selected: AABB,
  neighbors: AABB[],
  wallBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  direction: WalkwayDirection = "front"
): number {
  // Find minimum distance to obstacle in the given direction
  let minDist = Infinity;

  // Check walls
  if (direction === "front") {
    minDist = Math.min(minDist, wallBounds.maxZ - selected.maxZ);
  } else if (direction === "back") {
    minDist = Math.min(minDist, selected.minZ - wallBounds.minZ);
  } else if (direction === "left") {
    minDist = Math.min(minDist, selected.minX - wallBounds.minX);
  } else if (direction === "right") {
    minDist = Math.min(minDist, wallBounds.maxX - selected.maxX);
  }

  // Check neighbors
  for (const neighbor of neighbors) {
    let dist = Infinity;
    if (direction === "front") {
      if (!rangesOverlap(selected.minX, selected.maxX, neighbor.minX, neighbor.maxX)) {
        continue;
      }
      if (neighbor.minZ < selected.maxZ) {
        continue;
      }
      dist = neighbor.minZ - selected.maxZ;
    } else if (direction === "back") {
      if (!rangesOverlap(selected.minX, selected.maxX, neighbor.minX, neighbor.maxX)) {
        continue;
      }
      if (neighbor.maxZ > selected.minZ) {
        continue;
      }
      dist = selected.minZ - neighbor.maxZ;
    } else if (direction === "left") {
      if (!rangesOverlap(selected.minZ, selected.maxZ, neighbor.minZ, neighbor.maxZ)) {
        continue;
      }
      if (neighbor.maxX > selected.minX) {
        continue;
      }
      dist = selected.minX - neighbor.maxX;
    } else if (direction === "right") {
      if (!rangesOverlap(selected.minZ, selected.maxZ, neighbor.minZ, neighbor.maxZ)) {
        continue;
      }
      if (neighbor.minX < selected.maxX) {
        continue;
      }
      dist = neighbor.minX - selected.maxX;
    }
    minDist = Math.min(minDist, dist);
  }

  return minDist === Infinity ? 0 : minDist;
}

function getWalkwayLabelPosition(selected: AABB, direction: WalkwayDirection): [number, number, number] {
  if (direction === "front") {
    return [selected.centerX, 0.15, selected.maxZ + 0.2];
  }
  if (direction === "back") {
    return [selected.centerX, 0.15, selected.minZ - 0.2];
  }
  if (direction === "left") {
    return [selected.minX - 0.2, 0.15, selected.centerZ];
  }
  return [selected.maxX + 0.2, 0.15, selected.centerZ];
}

/**
 * Generate measurement overlays for a dragged item
 * max 2 measurements
 */
export function generateMeasurements(
  selected: AABB,
  selectedName: string,
  neighbors: Array<{ aabb: AABB; name: string }>,
  wallBounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): Measure[] {
  const measures: Measure[] = [];

  // 1. Find closest neighbor gap (prefer items directly aligned)
  let closestNeighbor: { aabb: AABB; name: string; gap: number; axis: "x" | "z" } | null = null;
  let closestGap = Infinity;

  for (const neighbor of neighbors) {
    // Check X-axis alignment (horizontal gap)
    const xOverlap =
      !(selected.maxZ < neighbor.aabb.minZ || selected.minZ > neighbor.aabb.maxZ);

    if (xOverlap) {
      const gap = computeGapBetween(selected, neighbor.aabb, "x");
      if (gap >= 0 && gap < closestGap) {
        closestGap = gap;
        closestNeighbor = { aabb: neighbor.aabb, name: neighbor.name, gap, axis: "x" };
      }
    }

    // Check Z-axis alignment (depth gap)
    const zOverlap =
      !(selected.maxX < neighbor.aabb.minX || selected.minX > neighbor.aabb.maxX);

    if (zOverlap) {
      const gap = computeGapBetween(selected, neighbor.aabb, "z");
      if (gap >= 0 && gap < closestGap) {
        closestGap = gap;
        closestNeighbor = { aabb: neighbor.aabb, name: neighbor.name, gap, axis: "z" };
      }
    }
  }

  // Add gap measurement if found
  if (closestNeighbor) {
    const gapCm = Math.round(closestNeighbor.gap * 100);
    let severity: "warn" | "ok" | "good" = "ok";

    // Special logic for coffee table gap (35-55cm optimal)
    if (
      closestNeighbor.name.toLowerCase().includes("coffee") ||
      selectedName.toLowerCase().includes("coffee")
    ) {
      if (gapCm < 30 || gapCm > 60) {
        severity = "warn";
      } else if (gapCm >= 35 && gapCm <= 55) {
        severity = "good";
      }
    }

    const midX =
      (selected.centerX + closestNeighbor.aabb.centerX) / 2;
    const midZ =
      (selected.centerZ + closestNeighbor.aabb.centerZ) / 2;

    measures.push({
      label: `Gap: ${gapCm}cm`,
      valueCm: gapCm,
      severity,
      at: [midX, 0.1, midZ],
    });
  }

  // 2. Walkway clearance (pick the nearest meaningful direction)
  const walkwayDirections: WalkwayDirection[] = ["front", "back", "left", "right"];
  const bestWalkway = walkwayDirections
    .map((direction) => ({
      direction,
      distance: computeWalkwayClearance(
        selected,
        neighbors.map((neighbor) => neighbor.aabb),
        wallBounds,
        direction
      ),
    }))
    .filter((entry) => entry.distance > 0)
    .sort((left, right) => left.distance - right.distance)[0];

  const walkwayCm = bestWalkway ? Math.round(bestWalkway.distance * 100) : 0;

  if (bestWalkway && walkwayCm < 150) {
    // Show if less than 1.5m
    let severity: "warn" | "ok" | "good" = "ok";
    if (walkwayCm < 70) {
      severity = "warn";
    } else if (walkwayCm >= 70 && walkwayCm <= 100) {
      severity = "good";
    }

    measures.push({
      label: `${bestWalkway.direction[0].toUpperCase()}${bestWalkway.direction.slice(1)} clearance: ${walkwayCm}cm`,
      valueCm: walkwayCm,
      severity,
      at: getWalkwayLabelPosition(selected, bestWalkway.direction),
    });
  }

  return measures.slice(0, 2); // Cap at 2 measurements
}
