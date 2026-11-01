/**
 * Adds a room found by one click (floor-plan-review-room-outline.ts) so that it shares the walls already there.
 *
 * A corner near a saved corner becomes that corner. A corner near the middle of a saved level or plumb wall lands on
 * that wall, which is split there. A saved corner lying on a new side joins the outline. The room tracer then reuses
 * the saved corners and the saved walls between them, so the new room and its neighbour share one wall instead of
 * standing two walls side by side, and a wall meeting the new room ends on a corner of it.
 */
import type { FloorPlanDocumentV2, FloorPlanFloorV2, FloorPlanPointMmV2 as Mm } from "@/lib/floor-plan-document-v2";
import { buildFloorPlanSourceProjection } from "@/lib/floor-plan-imports/source-overlay-residuals";
import {
  applyConsumerTopologyCorrection,
  nextOrdinalId,
  traceRoomFromSourcePolygon,
  type ReviewSourcePoint,
} from "@/lib/floor-plan-import-review-geometry";

/** A corner of the room being added: where it goes, the saved corner it is, or the saved wall it splits; `found` is
 * where the click found it. */
type Corner = { at: Mm; found: Mm; vertexId?: string; split?: { wallId: string; offsetMm: number } };
type Segment = { wallId: string; start: Mm; end: Mm; thicknessMm: number };

/** How near a saved corner or wall a found corner snaps, before the wall's half thickness: at least 100 mm or 4 px. */
const SNAP_MM = 100;
const SNAP_PX = 4;
/** A split stays this far from a wall's ends; nearer, the corner takes the end. */
const END_CLEARANCE_MM = 60;
/** A saved corner this near a new side joins the outline. */
const ON_SIDE_MM = 15;

/** The saved corners walls meet at (a dimension's own end points are not corners). */
function wallCorners(floor: FloorPlanFloorV2) {
  const used = new Set(floor.walls.flatMap((wall) => [wall.path.startVertexId, wall.path.endVertexId]));
  return floor.vertices.filter((vertex) => used.has(vertex.id));
}

function lineSegments(floor: FloorPlanFloorV2): Segment[] {
  const position = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  return floor.walls.flatMap((wall) => {
    if (wall.path.kind !== "line") return [];
    const start = position.get(wall.path.startVertexId), end = position.get(wall.path.endVertexId);
    return start && end ? [{ wallId: wall.id, start, end, thicknessMm: wall.thicknessMm }] : [];
  });
}

/** Where along a segment a point falls (mm from its start) and how far off it it lies. */
function along(point: Mm, segment: Segment) {
  const dx = segment.end.xMm - segment.start.xMm, dz = segment.end.zMm - segment.start.zMm;
  const length = Math.hypot(dx, dz) || 1;
  const s = ((point.xMm - segment.start.xMm) * dx + (point.zMm - segment.start.zMm) * dz) / length;
  const off = Math.abs((point.xMm - segment.start.xMm) * dz - (point.zMm - segment.start.zMm) * dx) / length;
  return { s, off, length };
}

/** The whole-millimetre offset nearest `s` at which splitting this level or plumb wall lands on whole millimetres. */
function exactSplit(segment: Segment, s: number): { offsetMm: number; at: Mm } | null {
  const { start, end } = segment;
  if (start.xMm !== end.xMm && start.zMm !== end.zMm) return null;
  const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  for (const step of [0, 1, -1, 2, -2, 3, -3]) {
    const offsetMm = Math.round(s) + step;
    if (offsetMm <= 0 || offsetMm >= length) continue;
    const ratio = offsetMm / length;
    const at = { xMm: start.xMm + (end.xMm - start.xMm) * ratio, zMm: start.zMm + (end.zMm - start.zMm) * ratio };
    if (Number.isSafeInteger(at.xMm) && Number.isSafeInteger(at.zMm)) return { offsetMm, at };
  }
  return null;
}

function snapToWall(at: Mm, segments: Segment[], tolerance: number): Corner | null {
  let best: { segment: Segment; s: number; off: number } | null = null;
  for (const segment of segments) {
    const { s, off, length } = along(at, segment);
    const reach = tolerance + segment.thicknessMm / 2;
    if (s < END_CLEARANCE_MM || s > length - END_CLEARANCE_MM || off > reach) continue;
    if (!best || off < best.off) best = { segment, s, off };
  }
  const split = best && exactSplit(best.segment, best.s);
  return best && split ? { at: split.at, found: at, split: { wallId: best.segment.wallId, offsetMm: split.offsetMm } } : null;
}

/** A found corner snapped to a saved corner, else onto a saved wall, else left where it was found. */
function snapCorner(floor: FloorPlanFloorV2, segments: Segment[], at: Mm, tolerance: number): Corner {
  let nearest: { id: string; at: Mm; distance: number } | null = null;
  for (const vertex of wallCorners(floor)) {
    const distance = Math.hypot(vertex.xMm - at.xMm, vertex.zMm - at.zMm);
    if (distance <= tolerance && (!nearest || distance < nearest.distance)) {
      nearest = { id: vertex.id, at: { xMm: vertex.xMm, zMm: vertex.zMm }, distance };
    }
  }
  if (nearest) return { at: nearest.at, found: at, vertexId: nearest.id };
  return snapToWall(at, segments, tolerance) ?? { at, found: at };
}

/** Saved corners lying on the side from a to b (not its ends), in order from a. */
function cornersOnSide(floor: FloorPlanFloorV2, a: Corner, b: Corner): Corner[] {
  const side: Segment = { wallId: "", start: a.at, end: b.at, thicknessMm: 0 };
  return wallCorners(floor)
    .filter((vertex) => vertex.id !== a.vertexId && vertex.id !== b.vertexId)
    .map((vertex) => ({ vertex, ...along(vertex, side) }))
    .filter(({ s, off, length }) => off <= ON_SIDE_MM && s > ON_SIDE_MM && s < length - ON_SIDE_MM)
    .sort((first, second) => first.s - second.s)
    .map(({ vertex }) => ({ at: { xMm: vertex.xMm, zMm: vertex.zMm }, found: { xMm: vertex.xMm, zMm: vertex.zMm }, vertexId: vertex.id }));
}

function withoutRepeats(corners: Corner[]): Corner[] {
  const same = (a: Corner, b: Corner) => (a.vertexId ?? a) === (b.vertexId ?? b);
  const kept = corners.filter((corner, i) => !same(corner, corners[(i + corners.length - 1) % corners.length]));
  return kept.length ? kept : corners.slice(0, 1);
}

/**
 * Splits the saved walls the corners landed on (each wall from its far end back, so earlier offsets still hold). A wall
 * the plan won't split there (a door across the point, say) stays whole, and that corner stays where it was found.
 */
function splitWalls(document: FloorPlanDocumentV2, floorId: string, corners: Corner[], at: string) {
  let next = document;
  const splits = corners.filter((corner) => corner.split).sort((a, b) => b.split!.offsetMm - a.split!.offsetMm);
  for (const corner of splits) {
    const newVertexId = nextOrdinalId(next, "vertex");
    const operation = { kind: "split_wall" as const, floorId, wallId: corner.split!.wallId, offsetMm: corner.split!.offsetMm,
      newVertexId, newWallId: nextOrdinalId(next, "wall") };
    try {
      next = applyConsumerTopologyCorrection({ document: next, operation, mutationId: `room-click-split-${newVertexId}`, at });
      corner.vertexId = newVertexId;
    } catch {
      corner.at = corner.found;
      delete corner.split;
    }
  }
  return next;
}

/** The found corners (page px) fitted to the saved walls, and the document with the walls they land on split. */
export function conformFoundRoom(input: {
  document: FloorPlanDocumentV2; floorId: string; sourceId: string; pageNumber: number; corners: ReviewSourcePoint[]; at?: string;
}) {
  const floor = input.document.floors.find((entry) => entry.id === input.floorId);
  const calibration = floor?.calibrations.find((entry) => entry.sourceId === input.sourceId && entry.pageNumber === input.pageNumber);
  const projection = calibration && buildFloorPlanSourceProjection(calibration);
  if (!floor || !projection) throw new Error("Set scale before adding rooms.");
  const origin = projection.project({ xMm: 0, zMm: 0 }), metre = projection.project({ xMm: 1000, zMm: 0 });
  const mmPerPx = 1000 / (Math.hypot(metre.xPx - origin.xPx, metre.yPx - origin.yPx) || 1);
  const tolerance = Math.max(SNAP_MM, SNAP_PX * mmPerPx);
  const segments = lineSegments(floor);
  const snapped = input.corners.map((point) => {
    const at = projection.unproject(point);
    if (!at) throw new Error("The source registration is invalid.");
    return snapCorner(floor, segments, at, tolerance);
  });
  const corners = withoutRepeats(snapped.flatMap((corner, i) => [corner, ...cornersOnSide(floor, corner, snapped[(i + 1) % snapped.length])]));
  const document = splitWalls(input.document, input.floorId, corners, input.at ?? new Date().toISOString());
  const points = corners.map(({ at }) => {
    const page = projection.project(at);
    return { x: page.xPx, y: page.yPx };
  });
  return { document, points };
}

/**
 * Adds a found room: fitted to the saved walls where it can be. If the plan refuses the fitted room, the room is tried
 * as found (its own walls); if that is refused too, the fitted room's reason is the error.
 */
export function addFoundRoom(input: {
  document: FloorPlanDocumentV2; floorId: string; sourceId: string; pageNumber: number; corners: ReviewSourcePoint[];
  roomName?: string; roomType?: string; wallThicknessMm?: number; at?: string;
}): FloorPlanDocumentV2 {
  const room = { floorId: input.floorId, sourceId: input.sourceId, pageNumber: input.pageNumber, roomName: input.roomName,
    roomType: input.roomType, wallThicknessMm: input.wallThicknessMm, at: input.at };
  try {
    const fitted = conformFoundRoom(input);
    return traceRoomFromSourcePolygon({ ...room, document: fitted.document, points: fitted.points });
  } catch (fitError) {
    try {
      return traceRoomFromSourcePolygon({ ...room, document: input.document, points: input.corners });
    } catch {
      throw fitError;
    }
  }
}
