import {
  pointInPolygon,
  type RegisteredPageEvidence,
  type SourcePointPx,
} from "./deterministic-evidence";
import type { RegisteredWallFootprintBand } from "./topology-evidence";

const DEFAULT_MAX_BANDS = 128;
const DEFAULT_MAX_POINTS_PER_BAND = 256;
const DEFAULT_MAX_ATOMIC_INTERVALS = 8_192;
const DEFAULT_MAX_CENTERLINES = 4_096;

export type RegisteredWallCenterlineEvidence = {
  id: string;
  pageNumber: number;
  pathId: string;
  orientation: "horizontal" | "vertical";
  start: SourcePointPx;
  end: SourcePointPx;
  thicknessPx: number;
  thicknessMm: number;
  confidence: number;
  boundarySegmentIds: string[];
};

export type WallCenterlineDiagnostics = {
  status: "complete" | "bounded_out";
  limitReason: string | null;
  inputBandCount: number;
  evaluatedBandCount: number;
  atomicIntervalCount: number;
  rejectedThicknessCount: number;
  junctionExtensionCount: number;
  centerlineCount: number;
};

export type RegisteredWallCenterlineResult = {
  centerlines: RegisteredWallCenterlineEvidence[];
  diagnostics: WallCenterlineDiagnostics;
};

type BoundaryEdge = {
  orientation: "horizontal" | "vertical";
  constant: number;
  from: number;
  to: number;
  segmentId: string;
};

type CenterlinePiece = Omit<RegisteredWallCenterlineEvidence, "id">;

function pointsNear(left: SourcePointPx, right: SourcePointPx, tolerancePx: number) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= tolerancePx;
}

function segmentIdForEdge(
  page: RegisteredPageEvidence,
  pathId: string,
  start: SourcePointPx,
  end: SourcePointPx,
  tolerancePx: number
) {
  const path = page.vectorPaths.find((entry) => entry.id === pathId);
  if (!path) return null;
  const segments = new Map(page.vectorSegments.map((entry) => [entry.id, entry]));
  for (const segmentId of path.segmentIds) {
    const segment = segments.get(segmentId);
    if (!segment) continue;
    if (
      (pointsNear(segment.start, start, tolerancePx) &&
        pointsNear(segment.end, end, tolerancePx)) ||
      (pointsNear(segment.start, end, tolerancePx) &&
        pointsNear(segment.end, start, tolerancePx))
    ) {
      return segmentId;
    }
  }
  return null;
}

function boundaryEdges(
  page: RegisteredPageEvidence,
  band: RegisteredWallFootprintBand,
  tolerancePx: number
) {
  const result: BoundaryEdge[] = [];
  for (let index = 0; index < band.sourcePoints.length; index += 1) {
    const start = band.sourcePoints[index];
    const end = band.sourcePoints[(index + 1) % band.sourcePoints.length];
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const segmentId = segmentIdForEdge(page, band.pathId, start, end, tolerancePx);
    if (!segmentId) return null;
    if (dy <= tolerancePx && dx > tolerancePx) {
      result.push({
        orientation: "horizontal",
        constant: (start.y + end.y) / 2,
        from: Math.min(start.x, end.x),
        to: Math.max(start.x, end.x),
        segmentId,
      });
    } else if (dx <= tolerancePx && dy > tolerancePx) {
      result.push({
        orientation: "vertical",
        constant: (start.x + end.x) / 2,
        from: Math.min(start.y, end.y),
        to: Math.max(start.y, end.y),
        segmentId,
      });
    } else {
      return null;
    }
  }
  return result;
}

function sortedUnique(values: number[], tolerancePx: number) {
  const result: number[] = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    const previous = result[result.length - 1];
    if (previous === undefined || Math.abs(value - previous) > tolerancePx) {
      result.push(value);
    }
  }
  return result;
}

function mergePieces(pieces: CenterlinePiece[], tolerancePx: number) {
  const sorted = [...pieces].sort((left, right) => {
    const leftConstant =
      left.orientation === "horizontal" ? left.start.y : left.start.x;
    const rightConstant =
      right.orientation === "horizontal" ? right.start.y : right.start.x;
    const leftAxis = left.orientation === "horizontal" ? left.start.x : left.start.y;
    const rightAxis = right.orientation === "horizontal" ? right.start.x : right.start.y;
    return (
      left.orientation.localeCompare(right.orientation) ||
      left.pathId.localeCompare(right.pathId) ||
      leftConstant - rightConstant ||
      left.thicknessMm - right.thicknessMm ||
      leftAxis - rightAxis
    );
  });
  const merged: CenterlinePiece[] = [];
  for (const piece of sorted) {
    const previous = merged[merged.length - 1];
    const sameLine =
      previous &&
      previous.orientation === piece.orientation &&
      previous.pathId === piece.pathId &&
      Math.abs(previous.thicknessMm - piece.thicknessMm) <= 1 &&
      (piece.orientation === "horizontal"
        ? Math.abs(previous.start.y - piece.start.y) <= tolerancePx &&
          Math.abs(previous.end.x - piece.start.x) <= tolerancePx
        : Math.abs(previous.start.x - piece.start.x) <= tolerancePx &&
          Math.abs(previous.end.y - piece.start.y) <= tolerancePx);
    if (!sameLine) {
      merged.push({ ...piece, boundarySegmentIds: [...piece.boundarySegmentIds] });
      continue;
    }
    previous.end = piece.end;
    previous.boundarySegmentIds = [
      ...new Set([...previous.boundarySegmentIds, ...piece.boundarySegmentIds]),
    ].sort();
    previous.confidence = Math.min(previous.confidence, piece.confidence);
  }
  return merged;
}

function extendToProvenJunctions(
  pieces: CenterlinePiece[],
  bands: RegisteredWallFootprintBand[],
  tolerancePx: number,
  diagnostics: WallCenterlineDiagnostics
) {
  const bandByPathId = new Map(bands.map((band) => [band.pathId, band]));
  for (let leftIndex = 0; leftIndex < pieces.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < pieces.length; rightIndex += 1) {
      const left = pieces[leftIndex];
      const right = pieces[rightIndex];
      if (left.pathId !== right.pathId || left.orientation === right.orientation) continue;
      const horizontal = left.orientation === "horizontal" ? left : right;
      const vertical = left.orientation === "vertical" ? left : right;
      const intersection = { x: vertical.start.x, y: horizontal.start.y };
      const horizontalGap =
        intersection.x < horizontal.start.x
          ? horizontal.start.x - intersection.x
          : intersection.x > horizontal.end.x
            ? intersection.x - horizontal.end.x
            : 0;
      const verticalGap =
        intersection.y < vertical.start.y
          ? vertical.start.y - intersection.y
          : intersection.y > vertical.end.y
            ? intersection.y - vertical.end.y
            : 0;
      const junctionReach =
        Math.max(horizontal.thicknessPx, vertical.thicknessPx) / 2 + tolerancePx;
      const band = bandByPathId.get(left.pathId);
      if (
        !band ||
        horizontalGap > junctionReach ||
        verticalGap > junctionReach ||
        !pointInPolygon(intersection, band.sourcePoints)
      ) {
        continue;
      }
      if (intersection.x < horizontal.start.x) horizontal.start = intersection;
      else if (intersection.x > horizontal.end.x) horizontal.end = intersection;
      if (intersection.y < vertical.start.y) vertical.start = intersection;
      else if (intersection.y > vertical.end.y) vertical.end = intersection;
      if (horizontalGap > tolerancePx || verticalGap > tolerancePx) {
        diagnostics.junctionExtensionCount += 1;
      }
    }
  }
  return pieces;
}

/**
 * Derives wall centerlines only where a closed source polygon has two explicit
 * parallel boundary edges and their midpoint is inside the wall footprint.
 * No skeleton extension, gap closing or bounding-box geometry is performed.
 */
export function deriveRegisteredWallCenterlines(
  page: RegisteredPageEvidence,
  bands: RegisteredWallFootprintBand[],
  millimetresPerPixel: number,
  options: {
    minThicknessMm?: number;
    maxThicknessMm?: number;
    maxBands?: number;
    maxPointsPerBand?: number;
    maxAtomicIntervals?: number;
    maxCenterlines?: number;
  } = {}
): RegisteredWallCenterlineResult {
  const maxBands = options.maxBands ?? DEFAULT_MAX_BANDS;
  const maxPointsPerBand =
    options.maxPointsPerBand ?? DEFAULT_MAX_POINTS_PER_BAND;
  const maxAtomicIntervals =
    options.maxAtomicIntervals ?? DEFAULT_MAX_ATOMIC_INTERVALS;
  const maxCenterlines = options.maxCenterlines ?? DEFAULT_MAX_CENTERLINES;
  const minThicknessMm = options.minThicknessMm ?? 60;
  const maxThicknessMm = options.maxThicknessMm ?? 600;
  const tolerancePx = Math.max(
    0.25,
    Math.hypot(page.widthPx, page.heightPx) * 0.00015
  );
  const diagnostics: WallCenterlineDiagnostics = {
    status: "complete",
    limitReason: null,
    inputBandCount: bands.length,
    evaluatedBandCount: 0,
    atomicIntervalCount: 0,
    rejectedThicknessCount: 0,
    junctionExtensionCount: 0,
    centerlineCount: 0,
  };
  const boundedOut = (reason: string): RegisteredWallCenterlineResult => ({
    centerlines: [],
    diagnostics: {
      ...diagnostics,
      status: "bounded_out",
      limitReason: reason,
      centerlineCount: 0,
    },
  });
  if (!Number.isFinite(millimetresPerPixel) || millimetresPerPixel <= 0) {
    return boundedOut("scale_unavailable");
  }
  if (bands.length > maxBands) return boundedOut("band_limit");

  const pieces: CenterlinePiece[] = [];
  for (const band of bands) {
    if (band.sourcePoints.length > maxPointsPerBand) {
      return boundedOut("band_point_limit");
    }
    const edges = boundaryEdges(page, band, tolerancePx);
    if (!edges) continue;
    diagnostics.evaluatedBandCount += 1;
    for (const orientation of ["horizontal", "vertical"] as const) {
      const oriented = edges.filter((edge) => edge.orientation === orientation);
      const coordinates = sortedUnique(
        oriented.flatMap((edge) => [edge.from, edge.to]),
        tolerancePx
      );
      for (let index = 0; index < coordinates.length - 1; index += 1) {
        diagnostics.atomicIntervalCount += 1;
        if (diagnostics.atomicIntervalCount > maxAtomicIntervals) {
          return boundedOut("atomic_interval_limit");
        }
        const from = coordinates[index];
        const to = coordinates[index + 1];
        if (to - from <= tolerancePx) continue;
        const axisMidpoint = (from + to) / 2;
        const covering = oriented
          .filter(
            (edge) =>
              edge.from <= axisMidpoint + tolerancePx &&
              edge.to >= axisMidpoint - tolerancePx
          )
          .sort((left, right) => left.constant - right.constant);
        for (let pair = 0; pair < covering.length - 1; pair += 1) {
          const first = covering[pair];
          const second = covering[pair + 1];
          const thicknessPx = second.constant - first.constant;
          if (thicknessPx <= tolerancePx) continue;
          const center = (first.constant + second.constant) / 2;
          const sample =
            orientation === "horizontal"
              ? { x: axisMidpoint, y: center }
              : { x: center, y: axisMidpoint };
          if (!pointInPolygon(sample, band.sourcePoints)) continue;
          const thicknessMm = Math.round(thicknessPx * millimetresPerPixel);
          if (thicknessMm < minThicknessMm || thicknessMm > maxThicknessMm) {
            diagnostics.rejectedThicknessCount += 1;
            continue;
          }
          pieces.push({
            pageNumber: page.pageNumber,
            pathId: band.pathId,
            orientation,
            start:
              orientation === "horizontal"
                ? { x: from, y: center }
                : { x: center, y: from },
            end:
              orientation === "horizontal"
                ? { x: to, y: center }
                : { x: center, y: to },
            thicknessPx,
            thicknessMm,
            confidence: 0.9,
            boundarySegmentIds: [first.segmentId, second.segmentId].sort(),
          });
          if (pieces.length > maxCenterlines * 2) {
            return boundedOut("centerline_piece_limit");
          }
        }
      }
    }
  }
  const merged = extendToProvenJunctions(
    mergePieces(pieces, tolerancePx),
    bands,
    tolerancePx,
    diagnostics
  );
  if (merged.length > maxCenterlines) return boundedOut("centerline_limit");
  const centerlines = merged.map((piece, index) => ({
    id: `wall-centerline-${page.pageNumber}-${index + 1}`,
    ...piece,
  }));
  diagnostics.centerlineCount = centerlines.length;
  return { centerlines, diagnostics };
}
