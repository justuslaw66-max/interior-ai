import {
  pointInPolygon,
  type RegisteredPageEvidence,
  type RegisteredRoomBoundary,
  type SourcePointPx,
} from "./deterministic-evidence";
import type { RegisteredWallFootprintBand } from "./topology-evidence";

export type RegisteredRoomTopologyCompleteness = {
  complete: boolean;
  blockers: string[];
};

type RegisteredRoomRegion = {
  sourcePoints: SourcePointPx[];
};

function uniqueBlockers(blockers: string[]): RegisteredRoomTopologyCompleteness {
  const unique = [...new Set(blockers)];
  return { complete: unique.length === 0, blockers: unique };
}

/**
 * Shared all-or-nothing geometry coverage gate for every automatic room path.
 * Labels are optional metadata: every detected label must map to one region,
 * while a trustworthy unlabeled region is promoted with a generic name.
 */
export function assessRegisteredRoomCoverage(
  page: RegisteredPageEvidence,
  regions: readonly RegisteredRoomRegion[]
): RegisteredRoomTopologyCompleteness {
  const blockers: string[] = [];
  if (!regions.length) blockers.push("no_closed_faces");
  const labels = page.semantics.roomLabels.filter(
    (label) => label.confidence >= 0.45
  );
  const labelCoverage = labels.map((label) => {
    const point = {
      x: label.centerXRatio * page.widthPx,
      y: label.centerYRatio * page.heightPx,
    };
    return regions.filter((region) => pointInPolygon(point, region.sourcePoints)).length;
  });
  // Several printed labels may describe functional areas inside one open-plan
  // architectural face. Every label still has to map to exactly one face, but
  // a face is no longer rejected merely because it contains several labels.
  if (labelCoverage.some((count) => count !== 1)) {
    blockers.push("unmapped_or_duplicate_room_labels");
  }
  return uniqueBlockers(blockers);
}

type BoundaryEdge = { start: SourcePointPx; end: SourcePointPx };

function boundaryEdges(points: readonly SourcePointPx[]): BoundaryEdge[] {
  return points.map((start, index) => ({
    start,
    end: points[(index + 1) % points.length],
  }));
}

function pointDistance(left: SourcePointPx, right: SourcePointPx) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function cross(start: SourcePointPx, end: SourcePointPx, point: SourcePointPx) {
  return (
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x)
  );
}

function pointOnEdge(point: SourcePointPx, edge: BoundaryEdge, tolerancePx: number) {
  const length = Math.max(1, pointDistance(edge.start, edge.end));
  if (Math.abs(cross(edge.start, edge.end, point)) > tolerancePx * length) {
    return false;
  }
  return (
    point.x >= Math.min(edge.start.x, edge.end.x) - tolerancePx &&
    point.x <= Math.max(edge.start.x, edge.end.x) + tolerancePx &&
    point.y >= Math.min(edge.start.y, edge.end.y) - tolerancePx &&
    point.y <= Math.max(edge.start.y, edge.end.y) + tolerancePx
  );
}

function pointsMatch(left: SourcePointPx, right: SourcePointPx, tolerancePx: number) {
  return pointDistance(left, right) <= tolerancePx;
}

function edgesMatch(left: BoundaryEdge, right: BoundaryEdge, tolerancePx: number) {
  return (
    (pointsMatch(left.start, right.start, tolerancePx) &&
      pointsMatch(left.end, right.end, tolerancePx)) ||
    (pointsMatch(left.start, right.end, tolerancePx) &&
      pointsMatch(left.end, right.start, tolerancePx))
  );
}

function collinearOverlap(
  left: BoundaryEdge,
  right: BoundaryEdge,
  tolerancePx: number
): "none" | "exact" | "partial" {
  const leftLength = Math.max(1, pointDistance(left.start, left.end));
  if (
    Math.abs(cross(left.start, left.end, right.start)) > tolerancePx * leftLength ||
    Math.abs(cross(left.start, left.end, right.end)) > tolerancePx * leftLength
  ) {
    return "none";
  }
  const useX = Math.abs(left.end.x - left.start.x) >= Math.abs(left.end.y - left.start.y);
  const coordinate = (point: SourcePointPx) => (useX ? point.x : point.y);
  const leftMin = Math.min(coordinate(left.start), coordinate(left.end));
  const leftMax = Math.max(coordinate(left.start), coordinate(left.end));
  const rightMin = Math.min(coordinate(right.start), coordinate(right.end));
  const rightMax = Math.max(coordinate(right.start), coordinate(right.end));
  const overlap = Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin);
  if (overlap <= tolerancePx) return "none";
  return edgesMatch(left, right, tolerancePx) ? "exact" : "partial";
}

function edgesCross(left: BoundaryEdge, right: BoundaryEdge, tolerancePx: number) {
  if (collinearOverlap(left, right, tolerancePx) !== "none") return false;
  const sharedEndpoint =
    pointsMatch(left.start, right.start, tolerancePx) ||
    pointsMatch(left.start, right.end, tolerancePx) ||
    pointsMatch(left.end, right.start, tolerancePx) ||
    pointsMatch(left.end, right.end, tolerancePx);
  if (sharedEndpoint) return false;
  return (
    (pointOnEdge(left.start, right, tolerancePx) ||
      pointOnEdge(left.end, right, tolerancePx) ||
      pointOnEdge(right.start, left, tolerancePx) ||
      pointOnEdge(right.end, left, tolerancePx)) ||
    (cross(left.start, left.end, right.start) > 0) !==
      (cross(left.start, left.end, right.end) > 0) &&
      (cross(right.start, right.end, left.start) > 0) !==
        (cross(right.start, right.end, left.end) > 0)
  );
}

function pointInsideRegion(
  point: SourcePointPx,
  region: RegisteredRoomRegion,
  tolerancePx: number
) {
  return (
    pointInPolygon(point, region.sourcePoints) &&
    !boundaryEdges(region.sourcePoints).some((edge) =>
      pointOnEdge(point, edge, tolerancePx)
    )
  );
}

/**
 * Direct closed paths may bypass wall-footprint assembly only when they cover
 * the complete labelled plan and compile into one unambiguous shared-wall graph.
 */
export function assessRegisteredDirectPathCompleteness(
  page: RegisteredPageEvidence,
  rooms: readonly RegisteredRoomBoundary[],
  wallFootprintBands: readonly RegisteredWallFootprintBand[]
): RegisteredRoomTopologyCompleteness {
  const blockers = [...assessRegisteredRoomCoverage(page, rooms).blockers];
  const sourcePaths = new Map(page.vectorPaths.map((path) => [path.id, path]));
  if (
    new Set(rooms.map((room) => room.pathId)).size !== rooms.length ||
    rooms.some((room) => {
      const path = sourcePaths.get(room.pathId);
      return room.registrationKind !== "closed_source_path" || !path?.closed;
    })
  ) {
    blockers.push("unaccounted_direct_room_paths");
  }
  if (wallFootprintBands.length > 0) blockers.push("unpaired_wall_bands");

  const tolerancePx = Math.max(
    0.25,
    Math.hypot(page.widthPx, page.heightPx) * 0.00015
  );
  for (let leftIndex = 0; leftIndex < rooms.length; leftIndex += 1) {
    const left = rooms[leftIndex];
    const leftEdges = boundaryEdges(left.sourcePoints);
    for (let rightIndex = leftIndex + 1; rightIndex < rooms.length; rightIndex += 1) {
      const right = rooms[rightIndex];
      const rightEdges = boundaryEdges(right.sourcePoints);
      for (const leftEdge of leftEdges) {
        for (const rightEdge of rightEdges) {
          if (collinearOverlap(leftEdge, rightEdge, tolerancePx) === "partial") {
            blockers.push("inconsistent_shared_room_edges");
          }
          if (edgesCross(leftEdge, rightEdge, tolerancePx)) {
            blockers.push("overlapping_room_boundaries");
          }
        }
      }
      if (
        left.sourcePoints.some((point) => pointInsideRegion(point, right, tolerancePx)) ||
        right.sourcePoints.some((point) => pointInsideRegion(point, left, tolerancePx))
      ) {
        blockers.push("overlapping_room_boundaries");
      }
    }
  }
  return uniqueBlockers(blockers);
}
