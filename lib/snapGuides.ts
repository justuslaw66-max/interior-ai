/**
 * SnapGuide types and utilities for visual alignment feedback during drag
 */

import { detectWallSnapModes, pickBestWallSnap } from "./wallSnap";
import type { AABB } from "./snap-types";

export type SnapGuideType = "CENTER_X" | "EDGE_X" | "CENTER_Z" | "EDGE_Z" | "SPACING" | "WALL";
export type SnapAxis = "x" | "z";
export type SnapKind = "center" | "edge";
export type TargetType = "wall" | "sofa" | "rug" | "item";

export interface SnapGuide {
  type: SnapGuideType;
  from: [number, number, number];
  to: [number, number, number];
  label?: string; // "Aligned", "45cm", "Wall", etc
  distance?: number; // Distance to snap threshold
}

/**
 * Enhanced guide type with scoring information for filtering and prioritization
 */
export interface Guide {
  axis: SnapAxis;
  kind: SnapKind;
  targetType: TargetType;
  targetId: string;
  delta: number; // abs distance to snap line in meters
  from: [number, number, number];
  to: [number, number, number];
  label: string;
  snapped: boolean; // true if delta <= snapThreshold
  showLine: boolean; // true if delta <= nearThreshold
  showLabel: boolean; // true if snapped
}

export type { AABB } from "./snap-types";

export interface DragContext {
  selectedAABB: AABB;
  nearestNeighbors: Array<{ aabb: AABB; item: string; type: string }>;
  nearestWalls: Array<{
    axis: "x" | "z";
    coord: number;
    distance: number;
    label: string;
  }>;
  snapCandidates: SnapGuide[];
  activeSnaps: SnapGuide[];
}

/**
 * Compute AABB for an item based on position and dimensions
 */
export function computeAABB(
  position: [number, number, number],
  width: number,
  depth: number
): AABB {
  const centerX = position[0];
  const centerZ = position[2];
  const minX = centerX - width / 2;
  const maxX = centerX + width / 2;
  const minZ = centerZ - depth / 2;
  const maxZ = centerZ + depth / 2;

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX,
    centerZ,
    width,
    depth,
  };
}

/**
 * Compute all snap candidates for an item
 */
export function computeSnapCandidates(
  selectedAABB: AABB,
  neighbors: Array<{ aabb: AABB; label: string }>,
  walls: Array<{ axis: "x" | "z"; coord: number; label: string }>,
  snapThreshold: number = 0.15
): SnapGuide[] {
  const guides: SnapGuide[] = [];

  // Align with neighbor centers
  for (const neighbor of neighbors) {
    // Center X alignment
    const centerXDist = Math.abs(selectedAABB.centerX - neighbor.aabb.centerX);
    if (centerXDist < snapThreshold) {
      guides.push({
        type: "CENTER_X",
        from: [selectedAABB.centerX, 0, selectedAABB.centerZ],
        to: [neighbor.aabb.centerX, 0, selectedAABB.centerZ],
        label: `${neighbor.label} (center)`,
        distance: centerXDist,
      });
    }

    // Center Z alignment
    const centerZDist = Math.abs(selectedAABB.centerZ - neighbor.aabb.centerZ);
    if (centerZDist < snapThreshold) {
      guides.push({
        type: "CENTER_Z",
        from: [selectedAABB.centerX, 0, selectedAABB.centerZ],
        to: [selectedAABB.centerX, 0, neighbor.aabb.centerZ],
        label: `${neighbor.label} (center)`,
        distance: centerZDist,
      });
    }

    // Edge alignment (X axis)
    const edgeXDistL = Math.abs(selectedAABB.minX - neighbor.aabb.maxX);
    if (edgeXDistL < snapThreshold) {
      guides.push({
        type: "EDGE_X",
        from: [selectedAABB.minX, 0, selectedAABB.centerZ],
        to: [neighbor.aabb.maxX, 0, selectedAABB.centerZ],
        label: `${neighbor.label} (edge)`,
        distance: edgeXDistL,
      });
    }

    const edgeXDistR = Math.abs(selectedAABB.maxX - neighbor.aabb.minX);
    if (edgeXDistR < snapThreshold) {
      guides.push({
        type: "EDGE_X",
        from: [selectedAABB.maxX, 0, selectedAABB.centerZ],
        to: [neighbor.aabb.minX, 0, selectedAABB.centerZ],
        label: `${neighbor.label} (edge)`,
        distance: edgeXDistR,
      });
    }

    // Edge alignment (Z axis)
    const edgeZDistF = Math.abs(selectedAABB.minZ - neighbor.aabb.maxZ);
    if (edgeZDistF < snapThreshold) {
      guides.push({
        type: "EDGE_Z",
        from: [selectedAABB.centerX, 0, selectedAABB.minZ],
        to: [selectedAABB.centerX, 0, neighbor.aabb.maxZ],
        label: `${neighbor.label} (edge)`,
        distance: edgeZDistF,
      });
    }

    const edgeZDistB = Math.abs(selectedAABB.maxZ - neighbor.aabb.minZ);
    if (edgeZDistB < snapThreshold) {
      guides.push({
        type: "EDGE_Z",
        from: [selectedAABB.centerX, 0, selectedAABB.maxZ],
        to: [selectedAABB.centerX, 0, neighbor.aabb.minZ],
        label: `${neighbor.label} (edge)`,
        distance: edgeZDistB,
      });
    }
  }

  // Wall alignment with multiple snap modes
  for (const wall of walls) {
    // Detect available wall snap modes
    const distance = wall.axis === "x"
      ? Math.min(Math.abs(selectedAABB.minX - wall.coord), Math.abs(selectedAABB.maxX - wall.coord))
      : Math.min(Math.abs(selectedAABB.minZ - wall.coord), Math.abs(selectedAABB.maxZ - wall.coord));
    
    if (distance < snapThreshold) {
      const wallSnaps = detectWallSnapModes(selectedAABB, wall.axis, wall.coord, distance, snapThreshold);
      
      if (wallSnaps.length > 0) {
        // Pick the best snap mode
        const bestSnap = pickBestWallSnap(wallSnaps, 0.02); // 2cm threshold for snapping
        
        if (bestSnap) {
          // Add guide with mode information in label
          const modeEmoji = bestSnap.mode === "flush" ? "📍" : bestSnap.mode === "breathing-room" ? "💨" : "🎯";
          guides.push({
            type: "WALL",
            from: [selectedAABB.centerX, 0, selectedAABB.centerZ],
            to: wall.axis === "x" ? [wall.coord, 0, selectedAABB.centerZ] : [selectedAABB.centerX, 0, wall.coord],
            label: `${wall.label} ${modeEmoji} ${bestSnap.label}`,
            distance: bestSnap.distance,
          });
        }
      } else {
        // Fallback to simple wall label if no modes detected
        guides.push({
          type: "WALL",
          from: [selectedAABB.centerX, 0, selectedAABB.centerZ],
          to: wall.axis === "x" ? [wall.coord, 0, selectedAABB.centerZ] : [selectedAABB.centerX, 0, wall.coord],
          label: wall.label,
          distance,
        });
      }
    }
  }

  // Sort by distance (closest first)
  guides.sort((a, b) => (a.distance || 0) - (b.distance || 0));

  return guides;
}

/**
 * Filter to active snaps (within threshold)
 */
export function getActiveSnaps(
  guides: SnapGuide[],
  threshold: number = 0.08
): SnapGuide[] {
  return guides.filter((g) => (g.distance ?? 0) < threshold);
}

/**
 * Priority weights for guide selection
 */
const TARGET_WEIGHT: Record<TargetType, number> = {
  wall: 0,
  sofa: 1,
  rug: 2,
  item: 3,
};

const KIND_WEIGHT: Record<SnapKind, number> = {
  center: 0,
  edge: 1,
};

/**
 * Pick the best guides per axis with priority-based filtering
 * - Keep only one guide per axis (X and Z)
 * - Prioritize by: smallest delta, then target type, then kind
 * - Cap at 2 guides total
 */
export function pickGuides(all: Guide[]): Guide[] {
  if (!all.length) return [];

  // Sort by delta first, then by priority
  const sorted = [...all].sort((a, b) => {
    if (a.delta !== b.delta) return a.delta - b.delta;
    if (TARGET_WEIGHT[a.targetType] !== TARGET_WEIGHT[b.targetType]) {
      return TARGET_WEIGHT[a.targetType] - TARGET_WEIGHT[b.targetType];
    }
    return KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind];
  });

  // Pick best per axis
  const bestX = sorted.find((g) => g.axis === "x");
  const bestZ = sorted.find((g) => g.axis === "z");

  return [bestX, bestZ].filter((g): g is Guide => !!g);
}

/**
 * Convert classic SnapGuide to enhanced Guide type
 */
export function snapGuideToGuide(
  guide: SnapGuide,
  selectedItemId: string,
  targetType: TargetType,
  targetId: string,
  snapThreshold: number = 0.02,
  nearThreshold: number = 0.06
): Guide {
  const axis: SnapAxis =
    guide.type === "CENTER_X" || guide.type === "EDGE_X" ? "x" : "z";
  const kind: SnapKind =
    guide.type === "CENTER_X" || guide.type === "CENTER_Z" ? "center" : "edge";

  const delta = guide.distance ?? 0;
  const snapped = delta <= snapThreshold;
  const showLine = delta <= nearThreshold;
  const showLabel = snapped;

  return {
    axis,
    kind,
    targetType,
    targetId,
    delta,
    from: guide.from,
    to: guide.to,
    label: guide.label || `Aligned`,
    snapped,
    showLine,
    showLabel,
  };
}
