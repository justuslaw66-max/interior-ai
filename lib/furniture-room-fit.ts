import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { getOutlineInwardSign, insetPolygonEdges } from "@/lib/polygon-edge-inset";
import { findNearestBuiltInFit, type BuiltInFitObstacles } from "@/lib/built-in-nearest-fit";

/**
 * Where furniture may stand in a drawn or imported room, exactly: its real (turned) footprint inside the room's finished
 * faces and `clearance` (2 cm) off every one of them, at an outside corner, a thin spike or a column's corner as along a
 * straight wall (1 Nov 2026; J: "proceed with what u will recommend is best for real life appliciation").
 *
 * The clamp's outline (lib/design-page-geometry.ts) is the room's outline inside its panels (lib/room-finished-outline.ts),
 * and furniture keeps `wallInset` (half the wall plus 2 cm, getFurnitureWallInset) off it. The faces here are that outline
 * moved in by the wall's part of the inset, mitred as the 3D view's walls meet, and each hole grown out by it: so a straight
 * wall keeps the same distance as before, and at an outside corner the item keeps 2 cm off the corner the walls draw, where
 * the clamp's nine sample points of its bounding box could miss it. The nearest place that fits is found by the built-ins'
 * exact search (lib/built-in-nearest-fit.ts), reused as it is.
 */

type Point = RoomPlanPolygonPoint;
type Segment = { a: Point; b: Point; minX: number; maxX: number; minZ: number; maxZ: number };

export type FurnitureFaces = {
  /** The finished faces' outline, and each hole's: the outline moved in (a hole grown out) by the wall's part of the inset. */
  outer: Point[];
  holes: Point[][];
  segments: Segment[];
  /** How far an item keeps off a face. */
  clearance: number;
  /** The walls leave no floor: the outline turned inside out when moved in. */
  inverted: boolean;
};

/** Contact allowed within this (metres): the clamp's own polygon test counts a point this near an edge as on it. */
export const FURNITURE_FACE_TOLERANCE = 0.0001;
/** The dilated footprint's corners are rounded by a circumscribed polygon of this many sides (at most 1.6 mm off a circle). */
const ROUND_SIDES = 8;

const segmentsOf = (loop: readonly Point[]): Segment[] => loop.map((a, index) => {
  const b = loop[(index + 1) % loop.length];
  return { a, b, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
});

// One set of faces per outline, holes and inset: the clamp runs on every frame of a drag with the same outline.
const facesByPolygon = new WeakMap<readonly Point[], { holes: unknown; wallInset: number; clearance: number; faces: FurnitureFaces }[]>();

/** The faces furniture keeps `clearance` off, for an outline (and holes) it keeps `wallInset` off along a straight wall. */
export function getFurnitureFaces(
  polygon: readonly Point[], holes: readonly (readonly Point[])[], wallInset: number, clearance: number
): FurnitureFaces {
  const known = facesByPolygon.get(polygon) ?? [];
  const kept = known.find((entry) => entry.holes === holes && entry.wallInset === wallInset && entry.clearance === clearance);
  if (kept) return kept.faces;
  const keep = Math.max(0, Math.min(clearance, wallInset)), faceInset = Math.max(0, wallInset - keep);
  const roomSide = getOutlineInwardSign(polygon);
  const outer = insetPolygonEdges(polygon, polygon.map(() => faceInset), roomSide);
  const grown = holes.filter((hole) => hole.length >= 3)
    .map((hole) => insetPolygonEdges(hole, hole.map(() => faceInset), getOutlineInwardSign(hole) === 1 ? -1 : 1));
  const faces: FurnitureFaces = {
    outer, holes: grown, segments: [outer, ...grown].flatMap(segmentsOf), clearance: keep,
    inverted: polygon.length < 3 || getOutlineInwardSign(outer) !== roomSide,
  };
  facesByPolygon.set(polygon, [{ holes, wallInset, clearance, faces }, ...known].slice(0, 4));
  return faces;
}

/** The corners of a footprint `width` × `depth` centred at (x, z) and turned `rotationY`, as the 3D view turns an item. */
export function getTurnedFootprint(x: number, z: number, width: number, depth: number, rotationY: number): Point[] {
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY), halfWidth = width / 2, halfDepth = depth / 2;
  return [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]]
    .map(([along, across]) => ({ x: x + along * cos + across * sin, z: z - along * sin + across * cos }));
}

function isInside(point: Point, loop: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index, index += 1) {
    const [a, b] = [loop[index], loop[previous]];
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length)) : 0;
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** How near a face segment comes to a convex footprint: none where it reaches into it or across it. */
function segmentGap(segment: Segment, footprint: readonly Point[]): number {
  if (isInside(segment.a, footprint) || isInside(segment.b, footprint)) return 0;
  let gap = Infinity;
  footprint.forEach((corner, index) => {
    const next = footprint[(index + 1) % footprint.length];
    if (segmentsCross(segment.a, segment.b, corner, next)) gap = 0;
    gap = Math.min(gap, distanceToSegment(corner, segment.a, segment.b), distanceToSegment(segment.a, corner, next),
      distanceToSegment(segment.b, corner, next));
  });
  return gap;
}

/**
 * True when the footprint `width` × `depth` at (x, z), turned `rotationY`, stands inside the faces and at least their clearance
 * off every one (FURNITURE_FACE_TOLERANCE less): every corner inside the outline and out of every hole, and no face nearer.
 */
export function isFurnitureFootprintClear(
  faces: FurnitureFaces, x: number, z: number, width: number, depth: number, rotationY: number
): boolean {
  if (faces.inverted) return false;
  const footprint = getTurnedFootprint(x, z, width, depth, rotationY);
  if (!footprint.every((corner) => isInside(corner, faces.outer) && !faces.holes.some((hole) => isInside(corner, hole)))) return false;
  const reach = faces.clearance;
  const xs = footprint.map((corner) => corner.x), zs = footprint.map((corner) => corner.z);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach];
  return faces.segments.every((segment) => segment.maxX < minX || segment.minX > maxX || segment.maxZ < minZ || segment.minZ > maxZ ||
    segmentGap(segment, footprint) >= reach - FURNITURE_FACE_TOLERANCE);
}

/** The footprint about its centre grown by `by`, its corners rounded by a circumscribed polygon (convex; any order). */
function grownFootprint(width: number, depth: number, rotationY: number, by: number): Point[] {
  const corners = getTurnedFootprint(0, 0, width, depth, rotationY);
  if (!(by > 0)) return corners;
  const radius = by / Math.cos(Math.PI / ROUND_SIDES);
  return corners.flatMap((corner) => Array.from({ length: ROUND_SIDES }, (_, step) => {
    const angle = (2 * Math.PI * (step + 0.5)) / ROUND_SIDES;
    return { x: corner.x + radius * Math.cos(angle), z: corner.z + radius * Math.sin(angle) };
  }));
}

/**
 * The nearest place to (x, z) where the footprint stands clear of the faces (isFurnitureFootprintClear) and `fits` (the
 * clamp's own test of its bounding box, grown by `wallInset`, inside `polygon`) accepts it, within `reach` metres, or null.
 * Two families of obstacles give the places that may be nearest: the faces against the footprint grown by their clearance,
 * and the outline's edges against the bounding box grown by the inset.
 */
export function findNearestFurnitureFit(
  faces: FurnitureFaces, polygon: readonly Point[], holes: readonly (readonly Point[])[], wallInset: number,
  x: number, z: number, width: number, depth: number, rotationY: number, reach: number, fits: (atX: number, atZ: number) => boolean
): [number, number] | null {
  if (faces.inverted) return null;
  const cos = Math.abs(Math.cos(rotationY)), sin = Math.abs(Math.sin(rotationY));
  const boxWidth = width * cos + depth * sin + 2 * wallInset, boxDepth = width * sin + depth * cos + 2 * wallInset;
  const families: BuiltInFitObstacles[] = [
    { footprint: grownFootprint(width, depth, rotationY, faces.clearance), obstacles: faces.segments.map(({ a, b }) => [a, b]) },
    { footprint: getTurnedFootprint(0, 0, boxWidth, boxDepth, 0), obstacles: [polygon, ...holes].flatMap(segmentsOf).map(({ a, b }) => [a, b]) },
  ];
  return findNearestBuiltInFit(families, { x, z }, reach, (atX, atZ) =>
    fits(atX, atZ) && isFurnitureFootprintClear(faces, atX, atZ, width, depth, rotationY), faces.outer);
}
