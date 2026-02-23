/**
 * Wall snap logic for furniture alignment
 * Provides multiple snap modes: flush, centered, and clearance
 */

import { AABB } from "./snapGuides";

export type WallSnapMode = "flush" | "centered" | "breathing-room";

export interface WallSnapCandidate {
  axis: "x" | "z";
  coord: number; // Wall coordinate (X or Z)
  mode: WallSnapMode;
  distance: number; // Distance from furniture to snap point
  label: string; // Display label
  targetX?: number; // For X-axis snaps
  targetZ?: number; // For Z-axis snaps
}

const BREATHING_ROOM = 0.35; // ~35cm clearance from wall
const CENTERED_OFFSET = 0.6; // ~60cm from wall for centered mode

/**
 * Detect available wall snap modes for a furniture item near a wall
 */
export function detectWallSnapModes(
  selectedAABB: AABB,
  wallAxis: "x" | "z",
  wallCoord: number,
  distance: number,
  maxDistance: number = 0.5
): WallSnapCandidate[] {
  if (distance > maxDistance) return [];

  const candidates: WallSnapCandidate[] = [];
  const isLeftOrTopWall = wallCoord < 0;

  if (wallAxis === "x") {
    // Left/right wall (X-axis)
    const width = selectedAABB.width;

    // Flush to wall - furniture edge touches wall
    candidates.push({
      axis: "x",
      coord: wallCoord,
      mode: "flush",
      distance,
      label: "Flush to wall",
      targetX: wallCoord + (isLeftOrTopWall ? width / 2 : -width / 2),
    });

    // Breathing room - furniture has clearance from wall
    const breathingX = wallCoord + (isLeftOrTopWall ? BREATHING_ROOM : -BREATHING_ROOM);
    const breathingDist = Math.abs(selectedAABB.centerX - breathingX - width / 2);
    if (breathingDist < maxDistance) {
      candidates.push({
        axis: "x",
        coord: wallCoord,
        mode: "breathing-room",
        distance: breathingDist,
        label: "Breathing room",
        targetX: breathingX + (isLeftOrTopWall ? width / 2 : -width / 2),
      });
    }

    // Centered on wall (if wall is wide enough) - furniture sits ~60cm from wall
    const centeredX = wallCoord + (isLeftOrTopWall ? CENTERED_OFFSET : -CENTERED_OFFSET);
    const centeredDist = Math.abs(selectedAABB.centerX - centeredX);
    if (centeredDist < maxDistance) {
      candidates.push({
        axis: "x",
        coord: wallCoord,
        mode: "centered",
        distance: centeredDist,
        label: "Comfortable spacing",
        targetX: centeredX,
      });
    }
  } else {
    // Front/back wall (Z-axis)
    const depth = selectedAABB.depth;

    // Flush to wall
    candidates.push({
      axis: "z",
      coord: wallCoord,
      mode: "flush",
      distance,
      label: "Flush to wall",
      targetZ: wallCoord + (isLeftOrTopWall ? depth / 2 : -depth / 2),
    });

    // Breathing room
    const breathingZ = wallCoord + (isLeftOrTopWall ? BREATHING_ROOM : -BREATHING_ROOM);
    const breathingDist = Math.abs(selectedAABB.centerZ - breathingZ - depth / 2);
    if (breathingDist < maxDistance) {
      candidates.push({
        axis: "z",
        coord: wallCoord,
        mode: "breathing-room",
        distance: breathingDist,
        label: "Breathing room",
        targetZ: breathingZ + (isLeftOrTopWall ? depth / 2 : -depth / 2),
      });
    }

    // Centered on wall
    const centeredZ = wallCoord + (isLeftOrTopWall ? CENTERED_OFFSET : -CENTERED_OFFSET);
    const centeredDist = Math.abs(selectedAABB.centerZ - centeredZ);
    if (centeredDist < maxDistance) {
      candidates.push({
        axis: "z",
        coord: wallCoord,
        mode: "centered",
        distance: centeredDist,
        label: "Comfortable spacing",
        targetZ: centeredZ,
      });
    }
  }

  return candidates.sort((a, b) => a.distance - b.distance);
}

/**
 * Pick the best wall snap mode for the current furniture position
 */
export function pickBestWallSnap(
  candidates: WallSnapCandidate[],
  snapThreshold: number = 0.08 // 8cm
): WallSnapCandidate | null {
  if (!candidates.length) return null;

  // Prefer flush snap if within threshold
  const flushSnap = candidates.find((c) => c.mode === "flush" && c.distance <= snapThreshold);
  if (flushSnap) return flushSnap;

  // Otherwise prefer breathing room if within threshold
  const breathingSnap = candidates.find(
    (c) => c.mode === "breathing-room" && c.distance <= snapThreshold
  );
  if (breathingSnap) return breathingSnap;

  // Last resort: centered mode
  const centeredSnap = candidates.find(
    (c) => c.mode === "centered" && c.distance <= snapThreshold
  );
  if (centeredSnap) return centeredSnap;

  // If nothing within threshold, return closest candidate
  return candidates[0];
}

/**
 * Convert wall snap mode to human-readable description
 */
export function getModeDescription(mode: WallSnapMode): string {
  switch (mode) {
    case "flush":
      return "Flush against wall";
    case "breathing-room":
      return "With breathing room";
    case "centered":
      return "Comfortable distance";
    default:
      return "Wall snap";
  }
}
