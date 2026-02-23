/**
 * Measurement utilities for real-time guidance during furniture placement
 */

import { AABB } from "@/lib/snapGuides";

export interface Measure {
  label: string;
  valueCm: number;
  severity?: "warn" | "ok" | "good";
  at: [number, number, number]; // HTML overlay position
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
  direction: "front" | "back" | "left" | "right" = "front"
): number {
  // Find minimum distance to obstacle in the given direction
  let minDist = Infinity;

  // Check walls
  if (direction === "front") {
    minDist = Math.min(minDist, Math.abs(wallBounds.maxZ - selected.maxZ));
  } else if (direction === "back") {
    minDist = Math.min(minDist, Math.abs(wallBounds.minZ - selected.minZ));
  } else if (direction === "left") {
    minDist = Math.min(minDist, Math.abs(wallBounds.minX - selected.minX));
  } else if (direction === "right") {
    minDist = Math.min(minDist, Math.abs(wallBounds.maxX - selected.maxX));
  }

  // Check neighbors
  for (const neighbor of neighbors) {
    let dist = Infinity;
    if (direction === "front") {
      dist = Math.abs(neighbor.minZ - selected.maxZ);
    } else if (direction === "back") {
      dist = Math.abs(neighbor.maxZ - selected.minZ);
    } else if (direction === "left") {
      dist = Math.abs(neighbor.maxX - selected.minX);
    } else if (direction === "right") {
      dist = Math.abs(neighbor.minX - selected.maxX);
    }
    minDist = Math.min(minDist, dist);
  }

  return minDist === Infinity ? 0 : minDist;
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

  // 2. Walkway clearance (check front direction as primary)
  const walkwayClear = computeWalkwayClearance(selected, neighbors.map((n) => n.aabb), wallBounds, "front");
  const walkwayCm = Math.round(walkwayClear * 100);

  if (walkwayCm < 150) {
    // Show if less than 1.5m
    let severity: "warn" | "ok" | "good" = "ok";
    if (walkwayCm < 70) {
      severity = "warn";
    } else if (walkwayCm >= 70 && walkwayCm <= 100) {
      severity = "good";
    }

    measures.push({
      label: `Walkway: ${walkwayCm}cm`,
      valueCm: walkwayCm,
      severity,
      at: [selected.centerX, 0.15, selected.maxZ + 0.2],
    });
  }

  return measures.slice(0, 2); // Cap at 2 measurements
}
