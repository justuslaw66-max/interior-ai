import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { findNearestClearPlace, prepareClearSearch, type ClearSearch } from "@/lib/furniture-nearest-fit";
import { buildBuiltInRegion, type BuiltInNeighbourWalls } from "@/lib/room-built-in-region";
import type { CanonicalRoomWalls } from "@/lib/furniture-canonical-walls";
import { isOutlineOf, type OutlineEdges } from "@/lib/room-outline-edges";

/**
 * Where furniture may stand in a drawn or imported room (1 Nov 2026; J: "proceed with what u will recommend is best for real
 * life appliciation"): its real, turned footprint in the room and `clearance` (2 cm) off every wall, panel and column as the
 * room's 3D view draws them, at an outside corner, a thin spike's tip or along an arc as along a straight wall. The 3D view is the
 * reference: where the room's outline would be more careful (its mitre at a spike's tip, its leaning face beside a step, its
 * chords of an arc), furniture may stand as near as the 3D view allows.
 *
 * - A drawn room (components/editor/renderers/house-plan-3d/geometry.ts): its centre line, each wall's core, its thickness
 *   wide and run on half of it past each end, each panel a box ended where the 3D view joins it to the next wall, and the
 *   cores of the rooms next door: #245's region's solids (lib/room-built-in-region.ts), reused as they are.
 * - An imported plan's room: its centre line, and the footprints of the plan's walls and the room's laminate strips as its 3D
 *   view draws them (lib/furniture-canonical-walls.ts), read from the compiled plan.
 *
 * The room's walls are read from its own outline and edges, handed in with the furniture's context (FurnitureRoomContext,
 * lib/furniture-room-context.ts), with the walls of the rooms next door; the clamp's outline (the room's, or inside its panels,
 * lib/room-finished-outline.ts) is checked to be the room's. Without them (a built-in on furniture's rule, a room not known)
 * there are no faces here, and the line's box test stands. The nearest place that fits is found exactly, as #245's search finds
 * a built-in's (lib/furniture-nearest-fit.ts), on the same shapes the test keeps off.
 */

type Point = RoomPlanPolygonPoint;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Segment = Bounds & { a: Point; b: Point };

/**
 * What a furniture clamp or containment knows of its room: its outline's edges; a drawn room's, the walls of the rooms next
 * door; an imported plan's, its walls and laminates as its 3D view draws them (lib/furniture-canonical-walls.ts).
 */
export type FurnitureRoomContext = { edges?: OutlineEdges; neighbours?: BuiltInNeighbourWalls; canonical?: CanonicalRoomWalls | null };

export type FurnitureFaces = {
  /** The outline an item's corners must all be inside: the room's centre line. */
  floor: Point[];
  /** Shapes its corners must all be out of, and keeps the clearance off: walls, panels and columns as drawn. */
  solids: Point[][];
  solidBounds: Bounds[];
  /** The shapes' edges, and the shapes for the nearest-fit search (each convex, or a segment). */
  segments: Segment[];
  obstacles: Point[][];
  clearance: number;
};

/** Contact allowed within this (metres): a place this near the clearance counts as at it. */
export const FURNITURE_FACE_TOLERANCE = 0.0001;
/** The dilated footprint's corners are rounded by a circumscribed polygon of this many sides (at most 0.4 mm off a circle). */
const ROUND_SIDES = 16;

const segment = (a: Point, b: Point): Segment =>
  ({ a, b, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) });
const segmentsOf = (loop: readonly Point[]): Segment[] => loop.map((a, index) => segment(a, loop[(index + 1) % loop.length]));
const boundsOf = (points: readonly Point[]): Bounds => points.reduce((bounds, { x, z }) => ({
  minX: Math.min(bounds.minX, x), maxX: Math.max(bounds.maxX, x), minZ: Math.min(bounds.minZ, z), maxZ: Math.max(bounds.maxZ, z),
}), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
const neighboursKey = (neighbours: BuiltInNeighbourWalls = []) =>
  neighbours.map(({ outline, thickness }) => `${thickness}:${outline.map(({ x, z }) => `${x},${z}`).join(";")}`).join("|");

// One set of faces per room's edges, holes, clearance and walls drawn round it: the clamp runs on every frame of a drag.
type KeptFaces = { clearance: number; holes: readonly (readonly Point[])[]; walls: unknown; key: string; faces: FurnitureFaces };
const facesByEdges = new WeakMap<OutlineEdges, KeptFaces[]>();
const isSameHoles = (a: readonly (readonly Point[])[], b: readonly (readonly Point[])[]) =>
  a === b || (a.length === b.length && a.every((hole, index) => hole === b[index]));

/**
 * The walls, panels and columns furniture keeps `clearance` off in its room (`context`), for the clamp's outline `polygon` (the
 * room's, or inside its panels) and holes: null where the room isn't known or the outline isn't its (the line's box test).
 */
export function getFurnitureFaces(
  polygon: readonly Point[], holes: readonly (readonly Point[])[], clearance: number, context: FurnitureRoomContext
): FurnitureFaces | null {
  const edges = context.edges;
  if (!edges || edges.outline.length < 3 || !isOutlineOf(polygon, edges)) return null;
  // A drawn room's 3D view draws the rooms next door's walls; an imported plan's, the plan's walls as compiled.
  const walls = edges.imported ? context.canonical : context.neighbours;
  if (edges.imported && !walls) return null;
  const known = facesByEdges.get(edges) ?? [];
  const key = edges.imported ? "" : neighboursKey(context.neighbours);
  const kept = known.find((entry) => entry.clearance === clearance && isSameHoles(entry.holes, holes) &&
    (entry.walls === walls || (!edges.imported && entry.key === key)));
  if (kept) return kept.faces;
  const columns = holes.filter((hole) => hole.length >= 3).map((hole) => [...hole]);
  const solids = edges.imported
    ? [...context.canonical!.walls, ...context.canonical!.panels, ...columns]
    // A drawn room: its walls' and panels', the rooms next door's and its columns' solids as drawn.
    : [...drawnWallSolids(edges, context.neighbours), ...columns];
  const faces = withShapes([...edges.outline], solids, clearance);
  facesByEdges.set(edges, [{ clearance, holes, walls, key, faces }, ...known].slice(0, 4));
  return faces;
}

/** A drawn room's walls' cores and panels' boxes, and the cores of the rooms next door, as its 3D view draws them (#245). */
function drawnWallSolids(edges: OutlineEdges, neighbours: BuiltInNeighbourWalls = []): Point[][] {
  const outline = [...edges.outline];
  return buildBuiltInRegion(outline, outline.map((_, index) => `wall-${index}`), edges.panels, edges.wallThickness, [], neighbours).solids;
}

function withShapes(floor: Point[], solids: Point[][], clearance: number): FurnitureFaces {
  // The search grows each obstacle as a convex shape: one that isn't convex goes in as its edges.
  const obstacles = solids.flatMap((solid) => (isConvex(solid) ? [solid] : segmentsOf(solid).map(({ a, b }) => [a, b])));
  return { floor, solids, solidBounds: solids.map(boundsOf), segments: solids.flatMap(segmentsOf), obstacles, clearance };
}

function isConvex(points: readonly Point[]): boolean {
  const turns = points.map((a, index) => {
    const b = points[(index + 1) % points.length], c = points[(index + 2) % points.length];
    return (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
  });
  return turns.every((turn) => turn >= -1e-12) || turns.every((turn) => turn <= 1e-12);
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

/** How near a segment comes to a convex footprint: none where it reaches into it or across it. */
function segmentGap(a: Point, b: Point, footprint: readonly Point[]): number {
  if (isInside(a, footprint) || isInside(b, footprint)) return 0;
  let gap = Infinity;
  footprint.forEach((corner, index) => {
    const next = footprint[(index + 1) % footprint.length];
    if (segmentsCross(a, b, corner, next)) gap = 0;
    gap = Math.min(gap, distanceToSegment(corner, a, b), distanceToSegment(a, corner, next), distanceToSegment(b, corner, next));
  });
  return gap;
}

/** True when two outlines overlap: a corner of either inside the other, or an edge of each crossing. */
export function doShapesMeet(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.some((point) => isInside(point, b)) || b.some((point) => isInside(point, a))) return true;
  return a.some((from, i) => b.some((to, j) => segmentsCross(from, a[(i + 1) % a.length], to, b[(j + 1) % b.length])));
}

/**
 * True when the footprint `width` × `depth` at (x, z), turned `rotationY`, stands in the room and at least the clearance
 * (FURNITURE_FACE_TOLERANCE less) off every wall, panel and column the 3D view draws.
 */
export function isFurnitureFootprintClear(
  faces: FurnitureFaces, x: number, z: number, width: number, depth: number, rotationY: number
): boolean {
  const footprint = getTurnedFootprint(x, z, width, depth, rotationY);
  const inSolid = (corner: Point) => faces.solids.some((solid, index) => {
    const bounds = faces.solidBounds[index];
    return corner.x >= bounds.minX && corner.x <= bounds.maxX && corner.z >= bounds.minZ && corner.z <= bounds.maxZ && isInside(corner, solid);
  });
  if (!footprint.every((corner) => isInside(corner, faces.floor) && !inSolid(corner))) return false;
  const reach = faces.clearance;
  const xs = footprint.map((corner) => corner.x), zs = footprint.map((corner) => corner.z);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach];
  return faces.segments.every((one) => one.maxX < minX || one.minX > maxX || one.maxZ < minZ || one.minZ > maxZ ||
    segmentGap(one.a, one.b, footprint) >= reach - FURNITURE_FACE_TOLERANCE);
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


// Each room's searches by footprint (size and turn): a drag's frames keep them, a few per room.
const searches = new WeakMap<FurnitureFaces, Map<string, ClearSearch>>();

function searchFor(faces: FurnitureFaces, width: number, depth: number, rotationY: number): ClearSearch {
  const key = `${width}:${depth}:${rotationY}`, known = searches.get(faces) ?? new Map<string, ClearSearch>();
  searches.set(faces, known);
  const kept = known.get(key) ?? prepareClearSearch(grownFootprint(width, depth, rotationY, faces.clearance), faces.obstacles);
  known.delete(key);
  known.set(key, kept);
  if (known.size > 8) known.delete(known.keys().next().value!);
  return kept;
}

/**
 * The nearest place to (x, z), within `reach` metres, where the footprint is clear (isFurnitureFootprintClear), or null: the
 * places that may be nearest are where the footprint grown by the clearance meets the same shapes the test keeps off.
 */
export function findNearestFurnitureFit(
  faces: FurnitureFaces, x: number, z: number, width: number, depth: number, rotationY: number, reach: number
): [number, number] | null {
  return findNearestClearPlace(searchFor(faces, width, depth, rotationY), { x, z }, reach,
    (atX, atZ) => isFurnitureFootprintClear(faces, atX, atZ, width, depth, rotationY), faces.floor);
}
