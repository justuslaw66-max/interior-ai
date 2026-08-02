import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanPointMmV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import { buildFloorPlanSourceProjection } from "@/lib/floor-plan-imports/source-overlay-residuals";

export type ReviewSourcePoint = { x: number; y: number };

export type ReviewSourceSnapCandidate = ReviewSourcePoint & { id: string };

export type ReviewSourceSnapResult = {
  point: ReviewSourcePoint;
  kind: "none" | "corner" | "aligned_x" | "aligned_y";
  label: string | null;
  targetId?: string;
};

export type ReviewOverlayPath = {
  id: string;
  points: ReviewSourcePoint[];
};

export type ReviewOverlay = {
  calibrationId: string;
  walls: ReviewOverlayPath[];
  openings: ReviewOverlayPath[];
  structures: ReviewOverlayPath[];
  vertices: Array<ReviewSourcePoint & { id: string }>;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Snaps in display pixels so the interaction remains predictable at every
 * source resolution and browser zoom level.
 */
export function snapReviewSourcePoint(input: {
  point: ReviewSourcePoint;
  pageWidthPx: number;
  pageHeightPx: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  candidates?: ReviewSourceSnapCandidate[];
  previousPoint?: ReviewSourcePoint | null;
  thresholdPx?: number;
}): ReviewSourceSnapResult {
  const thresholdPx = Math.max(2, input.thresholdPx ?? 14);
  const pageWidthPx = Math.max(1, input.pageWidthPx);
  const pageHeightPx = Math.max(1, input.pageHeightPx);
  const viewportWidthPx = Math.max(1, input.viewportWidthPx);
  const viewportHeightPx = Math.max(1, input.viewportHeightPx);
  const displayDistance = (candidate: ReviewSourcePoint) =>
    Math.hypot(
      ((candidate.x - input.point.x) / pageWidthPx) * viewportWidthPx,
      ((candidate.y - input.point.y) / pageHeightPx) * viewportHeightPx
    );
  const corner = (input.candidates ?? [])
    .map((candidate) => ({ candidate, distance: displayDistance(candidate) }))
    .filter(({ distance }) => distance <= thresholdPx)
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
  if (corner) {
    return {
      point: { x: corner.x, y: corner.y },
      kind: "corner",
      label: "Snapped to saved corner",
      targetId: corner.id,
    };
  }

  if (input.previousPoint) {
    const xDistance =
      (Math.abs(input.previousPoint.x - input.point.x) / pageWidthPx) *
      viewportWidthPx;
    const yDistance =
      (Math.abs(input.previousPoint.y - input.point.y) / pageHeightPx) *
      viewportHeightPx;
    if (xDistance <= thresholdPx || yDistance <= thresholdPx) {
      if (xDistance <= yDistance) {
        return {
          point: { x: input.previousPoint.x, y: input.point.y },
          kind: "aligned_x",
          label: "Aligned vertically",
        };
      }
      return {
        point: { x: input.point.x, y: input.previousPoint.y },
        kind: "aligned_y",
        label: "Aligned horizontally",
      };
    }
  }

  return { point: input.point, kind: "none", label: null };
}

function vertices(floor: FloorPlanFloorV2) {
  return new Map(floor.vertices.map((item) => [item.id, item]));
}

function wallGeometry(wall: FloorPlanWallV2, floor: FloorPlanFloorV2) {
  const byId = vertices(floor);
  const start = byId.get(wall.path.startVertexId);
  const end = byId.get(wall.path.endVertexId);
  if (!start || !end) return null;
  if (wall.path.kind === "line") {
    const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
    return {
      length,
      point(distance: number): FloorPlanPointMmV2 {
        const ratio = clamp(distance / Math.max(length, 1e-9), 0, 1);
        return {
          xMm: start.xMm + (end.xMm - start.xMm) * ratio,
          zMm: start.zMm + (end.zMm - start.zMm) * ratio,
        };
      },
    };
  }
  const center = byId.get(wall.path.centerVertexId);
  if (!center) return null;
  const startAngle = Math.atan2(
    start.zMm - center.zMm,
    start.xMm - center.xMm
  );
  const endAngle = Math.atan2(end.zMm - center.zMm, end.xMm - center.xMm);
  let sweep = endAngle - startAngle;
  if (wall.path.clockwise) {
    while (sweep >= 0) sweep -= Math.PI * 2;
  } else {
    while (sweep <= 0) sweep += Math.PI * 2;
  }
  const radius = Math.hypot(start.xMm - center.xMm, start.zMm - center.zMm);
  const length = Math.abs(sweep) * radius;
  return {
    length,
    point(distance: number): FloorPlanPointMmV2 {
      const angle =
        startAngle + sweep * clamp(distance / Math.max(length, 1e-9), 0, 1);
      return {
        xMm: center.xMm + Math.cos(angle) * radius,
        zMm: center.zMm + Math.sin(angle) * radius,
      };
    },
  };
}

function wallPoints(wall: FloorPlanWallV2, floor: FloorPlanFloorV2) {
  const geometry = wallGeometry(wall, floor);
  if (!geometry) return [];
  const samples = wall.path.kind === "arc" ? 18 : 1;
  return Array.from({ length: samples + 1 }, (_, index) =>
    geometry.point((geometry.length * index) / samples)
  );
}

export function buildReviewOverlay(input: {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number;
}): ReviewOverlay | null {
  const floor = input.document.floors.find((item) => item.id === input.floorId);
  const calibration = floor?.calibrations.find(
    (item) =>
      item.sourceId === input.sourceId && item.pageNumber === input.pageNumber
  );
  if (!floor || !calibration) return null;
  const projection = buildFloorPlanSourceProjection(calibration);
  if (!projection) return null;
  const project = (point: FloorPlanPointMmV2): ReviewSourcePoint => {
    const result = projection.project(point);
    return { x: result.xPx, y: result.yPx };
  };
  const walls = floor.walls.map((wall) => ({
    id: wall.id,
    points: wallPoints(wall, floor).map(project),
  }));
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const openings = floor.openings.flatMap((opening) => {
    const wall = wallById.get(opening.wallId);
    const geometry = wall && wallGeometry(wall, floor);
    return geometry
      ? [
          {
            id: opening.id,
            points: [
              project(geometry.point(opening.offsetMm)),
              project(geometry.point(opening.offsetMm + opening.widthMm)),
            ],
          },
        ]
      : [];
  });
  const projectedVertices = floor.vertices.map((item) => ({
    id: item.id,
    ...project(item),
  }));
  const projectedById = new Map(
    projectedVertices.map((item) => [item.id, item])
  );
  const structures = floor.structures.flatMap((structure) => {
    const points = structure.vertexIds.flatMap((id) => {
      const point = projectedById.get(id);
      return point ? [{ x: point.x, y: point.y }] : [];
    });
    return points.length >= 3 ? [{ id: structure.id, points }] : [];
  });
  return {
    calibrationId: calibration.id,
    walls,
    openings,
    structures,
    vertices: projectedVertices,
  };
}

export function buildThumbnailPaths(
  document: FloorPlanDocumentV2,
  width = 120,
  height = 76
): ReviewSourcePoint[][] {
  const floor = document.floors[0];
  if (!floor) return [];
  const paths = floor.walls.map((wall) => wallPoints(wall, floor));
  const points = paths.flat();
  if (!points.length) return [];
  const minX = Math.min(...points.map((point) => point.xMm));
  const maxX = Math.max(...points.map((point) => point.xMm));
  const minZ = Math.min(...points.map((point) => point.zMm));
  const maxZ = Math.max(...points.map((point) => point.zMm));
  const padding = 6;
  const scale = Math.min(
    (width - padding * 2) / Math.max(1, maxX - minX),
    (height - padding * 2) / Math.max(1, maxZ - minZ)
  );
  const drawingWidth = (maxX - minX) * scale;
  const drawingHeight = (maxZ - minZ) * scale;
  const offsetX = (width - drawingWidth) / 2;
  const offsetY = (height - drawingHeight) / 2;
  return paths.map((path) =>
    path.map((point) => ({
      x: offsetX + (point.xMm - minX) * scale,
      y: offsetY + (point.zMm - minZ) * scale,
    }))
  );
}
