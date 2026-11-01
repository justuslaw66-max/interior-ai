import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { getOutlineInwardSign, insetPolygonEdges } from "@/lib/polygon-edge-inset";
import { findNearestBuiltInFit, type BuiltInFitObstacles } from "@/lib/built-in-nearest-fit";
import { getDrawnWallSolids, getImportedArcFaces, getImportedLaminateTips } from "@/lib/furniture-faces-as-drawn";
import { readMovedOutline, readOutlineEdges, type MovedOutline, type OutlineEdges } from "@/lib/room-outline-edges";

/**
 * Where furniture may stand in a drawn or imported room, exactly: its real (turned) footprint inside the room's finished
 * faces and `clearance` (2 cm) off every one of them, at an outside corner, a thin spike or a column's corner as along a
 * straight wall (1 Nov 2026; J: "proceed with what u will recommend is best for real life appliciation").
 *
 * The clamp's outline (lib/design-page-geometry.ts) is the room's outline inside its panels (lib/room-finished-outline.ts),
 * and furniture keeps `wallInset` (half the wall plus 2 cm, getFurnitureWallInset) off it. The faces here are that outline
 * moved in by the wall's part of the inset, mitred as the 3D view's walls meet: so a straight
 * wall keeps the same distance as before, and at an outside corner the item keeps 2 cm off the corner the walls draw, where
 * the clamp's nine sample points of its bounding box could miss it. Where the room's 3D view draws a wall or panel past those
 * faces (a drawn room's wall run on past an outside corner, an imported laminate's tip past paint, an imported arc's true
 * curve: lib/furniture-faces-as-drawn.ts), the item keeps 2 cm off that too. The nearest place that fits is found by the
 * built-ins' exact search (lib/built-in-nearest-fit.ts), reused as it is.
 */

type Point = RoomPlanPolygonPoint;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Segment = Bounds & { a: Point; b: Point };

export type FurnitureFaces = {
  /** The finished faces' outline: the outline moved in by the wall's part of the inset. */
  outer: Point[];
  /** Outlines an item's corners must all be inside: `outer`, and the faces along an arc's true curve. */
  outers: Point[][];
  /** Walls and panels the 3D view draws past the faces, which its corners must all be out of. */
  solids: Point[][];
  solidBounds: Bounds[];
  /** Every edge it keeps `clearance` off. */
  segments: Segment[];
  /** The same as convex shapes for the nearest-fit search: each face a segment, each solid and laminate tip whole. */
  obstacles: Point[][];
  /** How far an item keeps off a face. */
  clearance: number;
  /** The walls leave no floor: the outline turned inside out when moved in. */
  inverted: boolean;
};

/** Contact allowed within this (metres): the clamp's own polygon test counts a point this near an edge as on it. */
export const FURNITURE_FACE_TOLERANCE = 0.0001;
/** The dilated footprint's corners are rounded by a circumscribed polygon of this many sides (at most 1.6 mm off a circle). */
const ROUND_SIDES = 8;

const segment = (a: Point, b: Point): Segment =>
  ({ a, b, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) });
const segmentsOf = (loop: readonly Point[]): Segment[] => loop.map((a, index) => segment(a, loop[(index + 1) % loop.length]));
const pathOf = (path: readonly Point[]): Segment[] => path.slice(1).map((b, index) => segment(path[index], b));
const boundsOf = (points: readonly Point[]): Bounds => points.reduce((bounds, { x, z }) => ({
  minX: Math.min(bounds.minX, x), maxX: Math.max(bounds.maxX, x), minZ: Math.min(bounds.minZ, z), maxZ: Math.max(bounds.maxZ, z),
}), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

// One set of faces per outline, inset and edges: the clamp runs on every frame of a drag with the same outline.
type KeptFaces = { wallInset: number; clearance: number; from: unknown; edges: unknown; faces: FurnitureFaces };
const facesByPolygon = new WeakMap<readonly Point[], KeptFaces[]>();

/**
 * The faces furniture keeps `clearance` off, for an outline it keeps `wallInset` off along a straight wall. A room's columns
 * aren't among them: the clamp's box test (isFootprintInsideRoomPolygon) keeps the item's whole box, grown by the inset, off a
 * column's outline already, so its real footprint stands at least that far off.
 */
export function getFurnitureFaces(polygon: readonly Point[], wallInset: number, clearance: number): FurnitureFaces {
  const moved = readMovedOutline(polygon), edges = readOutlineEdges(moved.from);
  const known = facesByPolygon.get(polygon) ?? [];
  const kept = known.find((entry) => entry.wallInset === wallInset && entry.clearance === clearance && entry.from === moved.from &&
    entry.edges === edges);
  if (kept) return kept.faces;
  const faces = buildFurnitureFaces(polygon, wallInset, clearance, moved, edges);
  facesByPolygon.set(polygon, [{ wallInset, clearance, from: moved.from, edges, faces }, ...known].slice(0, 4));
  return faces;
}

function buildFurnitureFaces(
  polygon: readonly Point[], wallInset: number, clearance: number, moved: MovedOutline, edges: OutlineEdges | undefined
): FurnitureFaces {
  const keep = Math.max(0, Math.min(clearance, wallInset)), faceInset = Math.max(0, wallInset - keep);
  const roomSide = getOutlineInwardSign(polygon);
  const outer = insetPolygonEdges(polygon, polygon.map(() => faceInset), roomSide);
  // What the 3D view draws past the faces, read through the outline the polygon was moved in from (one of as many edges).
  const drawn = edges && moved.from.length === polygon.length && edges.panels.length === polygon.length ? edges : undefined;
  const arcFaces = drawn?.imported ? getImportedArcFaces(moved, drawn, faceInset, roomSide) : null;
  const tips = drawn?.imported ? getImportedLaminateTips(moved, drawn, faceInset, roomSide) : [];
  const outers = arcFaces ? [outer, arcFaces] : [outer];
  const faceSegments = outers.flatMap(segmentsOf);
  const solids = (drawn && !drawn.imported && faceInset > 0 ? getDrawnWallSolids(moved, drawn, faceInset) : [])
    .filter((solid) => reachesInto(solid, outer, faceSegments));
  return {
    outer, outers, solids, solidBounds: solids.map(boundsOf), clearance: keep,
    segments: [...faceSegments, ...solids.flatMap(segmentsOf), ...tips.flatMap(pathOf)],
    obstacles: [...faceSegments.map(({ a, b }) => [a, b]), ...solids, ...tips],
    inverted: polygon.length < 3 || getOutlineInwardSign(outer) !== roomSide,
  };
}

/**
 * True when a wall's or panel's solid reaches inside the faces (past a corner): one wholly behind them is kept off by keeping
 * off the faces, so only these are kept, a few in a room of hundreds of walls.
 */
function reachesInto(solid: readonly Point[], outer: readonly Point[], faces: readonly Segment[]): boolean {
  const onFace = (point: Point) => faces.some((face) => distanceToSegment(point, face.a, face.b) <= 1e-6);
  return solid.some((point) => isInside(point, outer) && !onFace(point)) ||
    solid.some((a, index) => faces.some((face) => segmentsCross(a, solid[(index + 1) % solid.length], face.a, face.b)));
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
  const inSolid = (corner: Point) => faces.solids.some((solid, index) => {
    const bounds = faces.solidBounds[index];
    return corner.x >= bounds.minX && corner.x <= bounds.maxX && corner.z >= bounds.minZ && corner.z <= bounds.maxZ && isInside(corner, solid);
  });
  if (!footprint.every((corner) => faces.outers.every((outer) => isInside(corner, outer)) && !inSolid(corner))) return false;
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
    { footprint: grownFootprint(width, depth, rotationY, faces.clearance), obstacles: faces.obstacles },
    { footprint: getTurnedFootprint(0, 0, boxWidth, boxDepth, 0), obstacles: [polygon, ...holes].flatMap(segmentsOf).map(({ a, b }) => [a, b]) },
  ];
  return findNearestBuiltInFit(families, { x, z }, reach, (atX, atZ) =>
    fits(atX, atZ) && isFurnitureFootprintClear(faces, atX, atZ, width, depth, rotationY), faces.outer);
}
