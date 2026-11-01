import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { getOutlineInwardSign, insetPolygonEdges } from "@/lib/polygon-edge-inset";
import { findNearestBuiltInFit } from "@/lib/built-in-nearest-fit";
import type { BuiltInNeighbourWalls } from "@/lib/room-built-in-region";
import { getDrawnWallSolids, getImportedFloor } from "@/lib/furniture-faces-as-drawn";
import { isOutlineOf, type OutlineEdges } from "@/lib/room-outline-edges";

/**
 * Where furniture may stand in a drawn or imported room (1 Nov 2026; J: "proceed with what u will recommend is best for real
 * life appliciation"): its real, turned footprint in the room and `clearance` (2 cm) off every wall, panel and column as the
 * room's 3D view draws them (lib/furniture-faces-as-drawn.ts), at an outside corner, a thin spike's tip or along an arc as along
 * a straight wall. The 3D view is the reference: where the room's outline would be more careful (its mitre at a spike's tip,
 * its leaning face beside a step, its chords of an arc), furniture may stand as near as the 3D view allows.
 *
 * The room's walls are read from its own outline and edges, handed in with the furniture's context (FurnitureRoomContext,
 * lib/furniture-room-context.ts), with the walls of the rooms next door; the clamp's outline (the room's, or inside its panels,
 * lib/room-finished-outline.ts) is checked to be the room's. Without them (a built-in on furniture's rule, a room not known)
 * there are no faces here, and the line's box test stands. The nearest place that fits is found by the built-ins' exact search
 * (lib/built-in-nearest-fit.ts), reused as it is, on the same shapes the test keeps off.
 */

type Point = RoomPlanPolygonPoint;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Segment = Bounds & { a: Point; b: Point };

/** What a furniture clamp or containment knows of its room: its outline's edges, and the walls of the rooms next door. */
export type FurnitureRoomContext = { edges?: OutlineEdges; neighbours?: BuiltInNeighbourWalls };

export type FurnitureFaces = {
  /** The outline an item's corners must all be inside: a drawn room's centre line, an imported room's faces. */
  floor: Point[];
  /** Shapes its corners must all be out of: walls, panels and columns (a drawn room), columns and walls' square ends. */
  solids: Point[][];
  solidBounds: Bounds[];
  /** Every edge it keeps `clearance` off, and the same as shapes for the nearest-fit search (each convex, or a segment). */
  segments: Segment[];
  obstacles: Point[][];
  clearance: number;
  /** The walls leave no floor. */
  inverted: boolean;
};

/** Contact allowed within this (metres): a place this near the clearance counts as at it. */
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
const neighboursKey = (neighbours: BuiltInNeighbourWalls = []) =>
  neighbours.map(({ outline, thickness }) => `${thickness}:${outline.map(({ x, z }) => `${x},${z}`).join(";")}`).join("|");

// One set of faces per room's edges, holes, clearance and rooms next door: the clamp runs on every frame of a drag.
type KeptFaces = { clearance: number; holes: readonly (readonly Point[])[]; neighbours: unknown; key: string; faces: FurnitureFaces };
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
  // A drawn room's 3D view draws the rooms next door's walls; an imported plan's, its own walls as they are.
  const neighbours = edges.imported ? undefined : context.neighbours;
  const known = facesByEdges.get(edges) ?? [];
  const same = (entry: KeptFaces) => entry.clearance === clearance && isSameHoles(entry.holes, holes) &&
    (entry.neighbours === neighbours || entry.key === neighboursKey(neighbours));
  const kept = known.find(same);
  if (kept) return kept.faces;
  const faces = buildFurnitureFaces(edges, holes, clearance, neighbours);
  if (!faces) return null;
  facesByEdges.set(edges, [{ clearance, holes, neighbours, key: neighboursKey(neighbours), faces }, ...known].slice(0, 4));
  return faces;
}

function buildFurnitureFaces(
  edges: OutlineEdges, holes: readonly (readonly Point[])[], clearance: number, neighbours: BuiltInNeighbourWalls | undefined
): FurnitureFaces | null {
  const side = getOutlineInwardSign(edges.outline), columns = holes.filter((hole) => hole.length >= 3);
  if (!edges.imported) {
    // A drawn room: its centre line, and its walls' and panels', the rooms next door's and its columns' solids as drawn.
    const solids = [...getDrawnWallSolids(edges, neighbours), ...columns.map((hole) => [...hole])];
    return withShapes([...edges.outline], solids, [], clearance, false);
  }
  const floor = getImportedFloor(edges, side);
  if (!floor) return null;
  // An imported room's holes are walls round a void: they stand out of it by the room's half wall, as before.
  const halfWall = edges.wallThickness / 2;
  const grown = columns.map((hole) => insetPolygonEdges(hole, hole.map(() => halfWall), getOutlineInwardSign(hole) === 1 ? -1 : 1));
  const inverted = getOutlineInwardSign(floor.outline) !== side;
  return withShapes(floor.outline, [...grown, ...floor.wallEnds], floor.tips, clearance, inverted, true);
}

function withShapes(floor: Point[], solids: Point[][], tips: Point[][], clearance: number, inverted: boolean, floorIsFace = false): FurnitureFaces {
  const floorSegments = floorIsFace ? segmentsOf(floor) : [], tipSegments = tips.flatMap(pathOf);
  // The search grows each obstacle as a convex shape: a column that isn't convex goes in as its edges.
  const solidObstacles = solids.flatMap((solid) => (isConvex(solid) ? [solid] : segmentsOf(solid).map(({ a, b }) => [a, b])));
  return {
    floor, solids, solidBounds: solids.map(boundsOf), clearance, inverted,
    segments: [...floorSegments, ...solids.flatMap(segmentsOf), ...tipSegments],
    obstacles: [...[...floorSegments, ...tipSegments].map(({ a, b }) => [a, b]), ...solidObstacles],
  };
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

/**
 * True when the footprint `width` × `depth` at (x, z), turned `rotationY`, stands in the room and at least the clearance
 * (FURNITURE_FACE_TOLERANCE less) off every wall, panel and column the 3D view draws.
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

/** The least gap between an obstacle (a convex shape or a segment) and a convex footprint. */
function obstacleGap(obstacle: readonly Point[], footprint: readonly Point[]): number {
  if (obstacle.length === 2) return segmentGap(obstacle[0], obstacle[1], footprint);
  if (obstacle.some((point) => isInside(point, footprint)) || footprint.some((point) => isInside(point, obstacle))) return 0;
  return Math.min(...obstacle.map((a, index) => segmentGap(a, obstacle[(index + 1) % obstacle.length], footprint)));
}

/**
 * The nearest place to (x, z), within `reach` metres, where the footprint is clear (isFurnitureFootprintClear), or null: the
 * places that may be nearest are where the footprint grown by the clearance meets the same shapes the test keeps off. Only
 * shapes it could meet within the reach are taken (nearer the footprint than the reach and the clearance).
 */
export function findNearestFurnitureFit(
  faces: FurnitureFaces, x: number, z: number, width: number, depth: number, rotationY: number, reach: number
): [number, number] | null {
  if (faces.inverted) return null;
  const here = getTurnedFootprint(x, z, width, depth, rotationY), near = reach + faces.clearance + 1e-6;
  const bounds = boundsOf(here);
  const obstacles = faces.obstacles.filter((obstacle) => {
    const other = boundsOf(obstacle);
    return other.maxX >= bounds.minX - near && other.minX <= bounds.maxX + near && other.maxZ >= bounds.minZ - near &&
      other.minZ <= bounds.maxZ + near && obstacleGap(obstacle, here) <= near;
  });
  return findNearestBuiltInFit([{ footprint: grownFootprint(width, depth, rotationY, faces.clearance), obstacles }], { x, z }, reach,
    (atX, atZ) => isFurnitureFootprintClear(faces, atX, atZ, width, depth, rotationY), faces.floor);
}
