import { clipToStrip, getObstacleFreeSpans, type FacePoint } from "@/lib/built-in-free-span";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * A drawn room's finished region (J, 29 Oct 2026: "Face, back flush"), where its built-ins stand: inside its outline (the
 * walls' centre line), outside its columns, and outside its walls as the 3D view draws them
 * (components/editor/renderers/house-plan-3d/geometry.ts): each wall's core, its thickness wide along its edge and run on half
 * its thickness past each end (legacyWallPartRegion), and each laminate panel, from the wall's face its finish depth into the
 * room, ended where the 3D view joins it to the next wall (legacyWallSurfaceMiterOffset). A wall's face is half the wall and
 * its panel in from its edge; where it is exposed, a run can stand with its back against it, keeping clear of every solid it
 * would meet along the face.
 */

type Point = RoomPlanPolygonPoint;

/**
 * A wall as the 3D view draws it, room-local metres: its start, direction (east for an edge with no length, as the 3D view's
 * is), normal towards its room, length, panel depth, how deep its face stands, and its face id (which orders its panel joins).
 */
export type RegionWall = {
  start: Point; dx: number; dz: number; nx: number; nz: number; length: number; panel: number; face: number; faceId: string;
};

/**
 * The walls of the rooms around a room, as the 3D view draws them with its own (the union of every room's walls on its floor,
 * each at its own thickness): each room's outline, room-local metres, and its walls' thickness.
 */
export type BuiltInNeighbourWalls = ReadonlyArray<{ outline: readonly Point[]; thickness: number }>;

/** A wall's exposed face. */
export type BuiltInFaceHost = {
  /** Its ends, room-local metres, in its wall's direction. */
  start: Point;
  end: Point;
  /**
   * How far it stands in from its wall's outline edge, metres: half the wall and its panel, or deeper where a thicker wall of
   * the room next door stands in front of that (the face is then that wall's).
   */
  inset: number;
  /**
   * What a run against it keeps clear of: the walls' solids and the room's columns, cut to the room's side of the face, and
   * its two ends, as convex outlines of [along the face, into the room] mm about the face's middle.
   */
  obstacles: Array<Array<[number, number]>>;
};

export type BuiltInRegion = {
  outline: Point[];
  holes: Point[][];
  walls: RegionWall[];
  /** The walls' cores and panels, and the cores of the walls around the room, convex outlines, room-local metres. */
  solids: Point[][];
  /** The cores of the walls of the rooms around it (also in `solids`); an imported plan's room's, its floor's wall slices. */
  neighbourCores: Point[][];
  /** Each wall's exposed face, or null where none is (a wall inside another, or with no length). */
  exposed: Array<BuiltInFaceHost | null>;
  /**
   * Every face the region exposes along its walls' lines (20 mm or more of clear face, at each depth a face may stand: also
   * those no host takes, past a wall's own edge or where a wall next door covers part of it): where a baseboard stands.
   */
  faces: Array<{ start: Point; end: Point; nx: number; nz: number }>;
  /**
   * How far (mm) a solid may stand in front of a face and be flush with it, an imported plan's (PLAN_FLUSH_MM): neither ending
   * nor splitting the face, nor an obstacle on it. A drawn room's face ends where a solid stands FACE_PROBE_MM in front, and
   * anything at all in front is an obstacle.
   */
  flush?: number;
};

/** How near two wall ends meet to join, as the 3D view joins them (LEGACY_WALL_JOIN_TOLERANCE_METERS). */
const JOIN_TOLERANCE = 0.002;
/** Two walls this near parallel (the cross of their directions) join square, as the 3D view joins them (intersectOffsetLines). */
const PARALLEL_CROSS = 0.00001;
/** Solids are cut this far (mm) in front of a face: one flush with it (the next stretch of a straight wall) stays behind it. */
const FACE_EDGE_MM = 0.0001;
/**
 * A face is exposed where a solid stands this far (mm) behind it and none this far in front, as the oracle tells the 3D view's
 * faces (scripts/built-in-faces-oracle-utils.ts): it draws its walls to a thousandth of a mm, and their union leaves corners a
 * few thousandths off. A solid that comes nearer the face without reaching this far in front (a panel's end, a few thousandths
 * proud at a bend of a few hundredths of a degree) doesn't end it: a run keeps clear of it all the same (its obstacles).
 */
const FACE_PROBE_MM = 0.005;
/**
 * An imported plan's 3D walls stand true to this (mm): at a T-junction in a turned plan the stem, joined through the wall it
 * meets to that wall's far face, stands 0.006-0.02 mm proud of the room's face (the review's turned T's), a sliver no one can
 * see that split the through wall's host and stopped every run at the stem. It is the 0.05 mm a move may already stand into a
 * face (a tenth of the contact tolerance, lib/room-built-in-faces.ts), so a run on the face fits where its host says.
 */
export const PLAN_FLUSH_MM = 0.05;
/** A clear stretch of face shorter than this (mm) is none: it holds nothing (the allowance at each end takes it). */
const FACE_SLIVER_MM = 20;
/** How far into the room (mm) a face keeps its obstacles: deeper than any run. */
const FACE_REACH_MM = 3000;

/** True when the point is inside the ring, by crossings (no tolerance: a point on an edge may fall either way). */
export function isInsideRing(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  ring.forEach((current, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    if (current.z > point.z !== previous.z > point.z &&
      point.x < ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x) inside = !inside;
  });
  return inside;
}

export function signedArea(points: readonly Point[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

/**
 * Every edge of the outline as a wall, the room on the side its winding puts it (getWallSegments, getOutlineInteriorSide):
 * `thickness` thick, or each its own (an imported plan's, by edge).
 */
function buildWalls(
  outline: readonly Point[], faceIds: readonly string[], panels: readonly number[], thickness: number | readonly number[]
): RegionWall[] {
  const sign = signedArea(outline) >= 0 ? 1 : -1;
  return outline.map((start, index) => {
    const next = outline[(index + 1) % outline.length];
    const length = Math.hypot(next.x - start.x, next.z - start.z);
    const [dx, dz] = length > 0 ? [(next.x - start.x) / length, (next.z - start.z) / length] : [1, 0];
    const panel = panels[index] ?? 0, wall = typeof thickness === "number" ? thickness : thickness[index] ?? 0;
    return { start, dx, dz, nx: -dz * sign, nz: dx * sign, length, panel, face: wall / 2 + panel, faceId: faceIds[index] ?? "" };
  });
}

const at = (wall: RegionWall, along: number, across: number): Point =>
  ({ x: wall.start.x + wall.dx * along + wall.nx * across, z: wall.start.z + wall.dz * along + wall.nz * across });

/**
 * Where a wall's panel ends at one end (`end` 0 its start, 1 its end), along the wall from its start: where its face meets the
 * next wall's face, or that wall's panel when this wall's id sorts later; within a wall's thickness of the corner
 * (legacyWallSurfaceMiterOffset).
 */
function panelEndAlong(walls: readonly RegionWall[], index: number, end: 0 | 1, thickness: number): number {
  const wall = walls[index], endpoint = end * wall.length, target = at(wall, endpoint, 0);
  const near = (point: Point) => Math.hypot(point.x - target.x, point.z - target.z) <= JOIN_TOLERANCE;
  const adjacent = walls.find((other, otherIndex) => otherIndex !== index && (near(other.start) || near(at(other, other.length, 0))));
  if (!adjacent) return endpoint;
  const cross = wall.dx * adjacent.dz - wall.dz * adjacent.dx;
  if (Math.abs(cross) < PARALLEL_CROSS) return endpoint;
  const adjacentFace = thickness / 2 + (wall.faceId > adjacent.faceId ? adjacent.panel : 0);
  const first = at(wall, 0, thickness / 2), second = at(adjacent, 0, adjacentFace);
  const along = ((second.x - first.x) * adjacent.dz - (second.z - first.z) * adjacent.dx) / cross;
  return Math.min(endpoint + thickness, Math.max(endpoint - thickness, along));
}

/**
 * The walls' cores (run on half the wall past each end) and their panels' boxes, as the 3D view draws them: a wall no longer
 * than the join tolerance has neither (getWallSolidSpans).
 */
function buildSolids(walls: readonly RegionWall[], thickness: number): Point[][] {
  const half = thickness / 2, drawn = (wall: RegionWall) => wall.length > JOIN_TOLERANCE;
  const cores = walls.filter(drawn).map((wall) => [at(wall, -half, -half), at(wall, wall.length + half, -half), at(wall, wall.length + half, half), at(wall, -half, half)]);
  const panels = walls.flatMap((wall, index) => {
    if (!(wall.panel > 0) || !drawn(wall)) return [];
    const from = panelEndAlong(walls, index, 0, thickness), to = from + Math.max(0.001, panelEndAlong(walls, index, 1, thickness) - from);
    return [[at(wall, from, half), at(wall, to, half), at(wall, to, wall.face), at(wall, from, wall.face)]];
  });
  return [...cores, ...panels];
}

/** The stretches along a face where a solid stands the probe's depth behind it, merged where they meet (to a ten-thousandth of a mm). */
function getCoveredBehind(solids: readonly FacePoint[][]): Array<[number, number]> {
  const spans = solids.map((points) => clipToStrip(points, -FACE_PROBE_MM, -FACE_PROBE_MM).map(([along]) => along))
    .filter((values) => values.length >= 2).map((values): [number, number] => [Math.min(...values), Math.max(...values)])
    .sort((left, right) => left[0] - right[0]);
  return spans.reduce<Array<[number, number]>>((merged, span) => {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + FACE_EDGE_MM) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
    return merged;
  }, []);
}

/**
 * A wall's face frame, mm: [along the face from its edge's start, into the room], its face `face` metres in from its edge; and
 * what stands at its face line.
 */
function getFaceFrame(region: Omit<BuiltInRegion, "exposed" | "faces">, wall: RegionWall, face = wall.face) {
  const origin = { x: wall.start.x + wall.nx * face, z: wall.start.z + wall.nz * face };
  const toFrame = (point: Point): FacePoint => {
    const x = (point.x - origin.x) * 1000, z = (point.z - origin.z) * 1000;
    return [x * wall.dx + z * wall.dz, x * wall.nx + z * wall.nz];
  };
  const fromFrame = (along: number, into: number): Point => ({
    x: origin.x + (wall.dx * along + wall.nx * into) / 1000, z: origin.z + (wall.dz * along + wall.nz * into) / 1000,
  });
  // Only what stands at the face line can end it: in a room of many edges, every other solid is far from most faces.
  const nearLine = (points: readonly Point[]) => {
    let low = Number.POSITIVE_INFINITY, high = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      const across = ((point.x - origin.x) * wall.nx + (point.z - origin.z) * wall.nz) * 1000;
      low = Math.min(low, across);
      high = Math.max(high, across);
    }
    return low < Math.max(FACE_PROBE_MM, region.flush ?? 0) && high > -FACE_PROBE_MM;
  };
  const solids = region.solids.filter(nearLine).map((points) => points.map(toFrame));
  const standing = [...solids, ...region.holes.filter(nearLine).map((hole) => hole.map(toFrame))]
    .map((points) => clipToStrip(points, region.flush ?? FACE_EDGE_MM, FACE_REACH_MM))
    .filter((points) => points.length >= 2);
  /** The stretches of [from, to] with nothing standing the probe's depth (or `flush`) in front of the face (a panel's corner past a bend). */
  const probe = region.flush ?? FACE_PROBE_MM, clearOf = (from: number, to: number) =>
    getObstacleFreeSpans(standing, probe, probe, 0, from, to).filter(([start, stop]) => stop - start >= FACE_SLIVER_MM);
  return { toFrame, fromFrame, solids, clearOf };
}

/**
 * The depths (metres in from its edge) wall `index`'s face may stand at: half the wall and its panel; and, where a thicker wall
 * of the room next door runs along it (parallel, over its edge) and stands in front of that, that wall's face.
 */
function getFaceDepths(region: Omit<BuiltInRegion, "exposed" | "faces">, wall: RegionWall): number[] {
  const depths = [wall.face];
  for (const core of region.neighbourCores) {
    const [first, second] = core, length = Math.hypot(second.x - first.x, second.z - first.z);
    if (!(length > 0) || Math.abs(((second.x - first.x) * wall.dz - (second.z - first.z) * wall.dx) / length) >= PARALLEL_CROSS) continue;
    const across = core.map((point) => (point.x - wall.start.x) * wall.nx + (point.z - wall.start.z) * wall.nz);
    const along = core.map((point) => (point.x - wall.start.x) * wall.dx + (point.z - wall.start.z) * wall.dz);
    const [near, far] = [Math.min(...across), Math.max(...across)];
    if (near < wall.face && far > wall.face + FACE_PROBE_MM / 1000 && Math.max(...along) > 0 && Math.min(...along) < wall.length &&
      !depths.some((depth) => Math.abs(depth - far) < 1e-9)) depths.push(far);
  }
  return depths;
}

/**
 * Wall `index`'s exposed face: where its face line has a solid just behind it and nothing just in front, inside the room,
 * over the stretches that meet its own edge. A face runs on over the next wall's where they stand flush (a straight wall
 * drawn in two pieces), and ends where a solid stands in front of it or none behind (a corner, a deeper or shallower panel).
 * Its host spans its clear stretches of one stretch of face behind them (an imported plan's, of every one along its edge: an
 * opening to the wall's top leaves none behind); what stands between them stops a run (below). Where
 * a thicker wall next door stands in front of its own face, its face is at whichever depth meets more of its edge.
 */
function buildFaceHost(region: Omit<BuiltInRegion, "exposed" | "faces">, index: number, faces: BuiltInRegion["faces"]): BuiltInFaceHost | null {
  const wall = region.walls[index];
  if (!(wall.length > 1e-9)) return null;
  const inRoom = (point: Point) =>
    isInsideRing(point, region.outline) && !region.holes.some((hole) => isInsideRing(point, hole));
  const lengthMm = wall.length * 1000;
  const alongEdge = (stretch: ReadonlyArray<readonly [number, number]>) =>
    stretch.reduce((sum, [from, to]) => sum + Math.max(0, Math.min(to, lengthMm) - Math.max(from, 0)), 0);
  let best: { inset: number; frame: ReturnType<typeof getFaceFrame>; exposed: Array<[number, number]> } | null = null;
  for (const inset of getFaceDepths(region, wall)) {
    const frame = getFaceFrame(region, wall, inset);
    // Each clear stretch, by the stretch of face behind them, of which the one most along the wall's own edge is its face.
    const all = getCoveredBehind(frame.solids).map(([coverFrom, coverTo]) => frame.clearOf(coverFrom, coverTo)
      .filter(([from, to]) => inRoom(frame.fromFrame((from + to) / 2, FACE_PROBE_MM / 2))));
    all.flat().forEach(([from, to]) => faces.push({ start: frame.fromFrame(from, 0), end: frame.fromFrame(to, 0), nx: wall.nx, nz: wall.nz }));
    const pieces = all.map((stretches) => stretches.filter(([from, to]) => to > 0 && from < lengthMm));
    // An imported plan's wall may have an opening to its top, behind which nothing stands: the host spans both sides of it.
    const exposed = region.flush ? pieces.flat().sort((first, second) => first[0] - second[0])
      : pieces.reduce((most, stretch) => (alongEdge(stretch) > alongEdge(most) ? stretch : most), pieces[0] ?? []);
    if (exposed.length && (!best || alongEdge(exposed) > alongEdge(best.exposed))) best = { inset, frame, exposed };
  }
  return best && faceHostOf(region, best.frame, best.exposed, best.inset);
}

/** A face's host from its clear stretches (`exposed`, mm along `frame`), its obstacles found when first read (by Fit's hosts). */
function faceHostOf(
  region: Omit<BuiltInRegion, "exposed" | "faces">, { toFrame, fromFrame }: ReturnType<typeof getFaceFrame>, exposed: ReadonlyArray<readonly [number, number]>, inset: number
): BuiltInFaceHost {
  const [from, to] = [exposed[0][0], exposed[exposed.length - 1][1]];
  let found: Array<Array<[number, number]>> | undefined;
  return { start: fromFrame(from, 0), end: fromFrame(to, 0), inset, get obstacles() { return (found ??= getFaceObstacles(region, toFrame, exposed, (from + to) / 2)); } };
}

/** A face on any line (`line`'s frame, its face on the line) from `from` to `to` metres along it, as an exposed face's host is. */
export function getBuiltInFaceOnLine(region: BuiltInRegion, line: RegionWall, from: number, to: number, inset: number): BuiltInFaceHost | null {
  const frame = getFaceFrame(region, line, 0), exposed = frame.clearOf(from * 1000, to * 1000);
  return exposed.length ? faceHostOf(region, frame, exposed, inset) : null;
}

/**
 * What a run on a face's clear stretches keeps clear of: every solid and column standing in front of the face along them (and
 * 100 mm past their ends), cut to the room's side of it; each stretch's ends, as lines across them (the face less 10 mm each
 * end, whatever ends it: a corner, a deeper panel, a panel's corner past a bend too low to meet a raised back); and what lies
 * between two stretches, where something stands on the face (however low: a wall next door a few mm proud of it, under a run
 * raised on a baseboard), so a run doesn't stand there either. In the face's frame, about the host's `middle`, to a hundredth
 * of a mm.
 */
function getFaceObstacles(
  region: Omit<BuiltInRegion, "exposed" | "faces">, toFrame: (point: Point) => FacePoint, stretches: ReadonlyArray<readonly [number, number]>, middle: number
): Array<Array<[number, number]>> {
  const from = stretches[0][0], to = stretches[stretches.length - 1][1];
  const edge = region.flush ?? FACE_EDGE_MM;
  const inReach = (points: readonly FacePoint[]) => points.some(([along]) => along > from - 100) && points.some(([along]) => along < to + 100) &&
    points.some(([, into]) => into > edge) && points.some(([, into]) => into < FACE_REACH_MM);
  const solids = [...region.solids, ...region.holes].map((points) => points.map(toFrame)).filter(inReach)
    .map((points) => clipToStrip(points, edge, FACE_REACH_MM)).filter((points) => points.length >= 2 && inReach(points));
  const ends = stretches.flat().map((along): FacePoint[] => [[along, 0], [along, FACE_REACH_MM]]);
  const between = stretches.slice(1).map(([next], index): FacePoint[] =>
    [[stretches[index][1], 0], [next, 0], [next, FACE_REACH_MM], [stretches[index][1], FACE_REACH_MM]]);
  const round = (value: number) => Math.round(value * 100) / 100;
  return [...solids, ...ends, ...between].map((points) => points.map(([along, into]): [number, number] => [round(along - middle), round(into)]));
}

/**
 * What a run on wall `index`'s face between `start` and `end` (room-local metres, on its face line) keeps clear of, as an
 * exposed face's obstacles are given (about the stretch's middle): for a host the face's closed form gives.
 */
export function getBuiltInFaceObstaclesAlong(region: BuiltInRegion, index: number, start: Point, end: Point): Array<Array<[number, number]>> {
  const { toFrame, clearOf } = getFaceFrame(region, region.walls[index], region.exposed[index]?.inset);
  const [from, to] = [toFrame(start)[0], toFrame(end)[0]].sort((a, b) => a - b);
  const clear = clearOf(from, to);
  return getFaceObstacles(region, toFrame, clear.length ? clear : [[from, to]], (from + to) / 2);
}

/**
 * The region of a room's `outline` (room-local metres) with its walls `thickness` thick and each edge's face id and panel depth;
 * the exposed faces in the outline's edge order, null for an edge with none.
 */
export function buildBuiltInRegion(
  outline: Point[], faceIds: readonly string[], panels: readonly number[], thickness: number, holes: Point[][],
  neighbours: BuiltInNeighbourWalls = []
): BuiltInRegion {
  const walls = buildWalls(outline, faceIds, panels, thickness);
  const neighbourCores = buildNeighbourCores(outline, neighbours);
  return withExposedFaces({
    outline, holes: holes.filter((hole) => hole.length >= 3), walls, solids: [...buildSolids(walls, thickness), ...neighbourCores], neighbourCores,
  });
}

/**
 * An imported plan's room's region (lib/room-built-in-imported-region.ts): each edge's own wall `thicknesses`, the solids its 3D
 * view draws (convex), and the walls' slices (`cores`), whose far sides may stand a face deeper than its own wall's.
 */
export function buildBuiltInRegionFromSolids(
  outline: Point[], faceIds: readonly string[], panels: readonly number[], thicknesses: readonly number[], holes: Point[][],
  solids: Point[][], cores: Point[][]
): BuiltInRegion {
  const walls = buildWalls(outline, faceIds, panels, thicknesses);
  return withExposedFaces({ outline, holes: holes.filter((hole) => hole.length >= 3), walls, solids, neighbourCores: cores, flush: PLAN_FLUSH_MM });
}

function withExposedFaces(base: Omit<BuiltInRegion, "exposed" | "faces">): BuiltInRegion {
  const faces: BuiltInRegion["faces"] = [];
  return { ...base, exposed: base.walls.map((_, index) => buildFaceHost(base, index, faces)), faces };
}

/** The cores of the walls around the room (each room's at its own thickness) that reach over its outline's bounds. */
function buildNeighbourCores(outline: readonly Point[], neighbours: BuiltInNeighbourWalls): Point[][] {
  if (!outline.length) return [];
  const room = boundsOf(outline);
  return neighbours.flatMap(({ outline: around, thickness }) => buildSolids(buildWalls(around, [], [], thickness), thickness))
    .filter((core) => {
      const bounds = boundsOf(core);
      return bounds.maxX > room.minX && bounds.minX < room.maxX && bounds.maxZ > room.minZ && bounds.minZ < room.maxZ;
    });
}

function boundsOf(points: readonly Point[]) {
  const xs = points.map((point) => point.x), zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
