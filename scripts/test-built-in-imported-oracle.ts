import assert from "node:assert/strict";

import { createCabinetPolygonWallSpaces, fitCabinetToSpace, getCabinetFitPlacement, mapCabinetCardinalOpeningsToPolygonWalls } from "../features/cabinetry/fitToSpace";
import { getCabinetOverallHeight } from "../features/cabinetry/layout";
import { createCabinetPreset } from "../features/cabinetry/presets";
import { buildCabinetryAvailableSpaces, getCabinetPlacement } from "../features/cabinetry/roomCabinetHosts";
import type { CabinetDefinition, CabinetHostSpace } from "../features/cabinetry/types";
import { getCanonicalRoomWallFinish } from "../components/editor/renderers/canonical-floor-plan/canonicalWallPanels";
import type { HousePlanRoom2D } from "../lib/design-page-house-plan";
import type { CanonicalFloorPlanRenderModel } from "../lib/floor-plan-render-model";
import {
  builtInFootprintFits, clampBuiltInToRoom, getBuiltInDragPlace, getBuiltInSnapTarget, getBuiltInStandOff, getRoomBuiltInFaces, usesFurnitureRuleForBuiltIns,
} from "../lib/room-built-in-faces";
import { getRoomOutlineInsideFinishes, getRoomPlanOutlinePoints } from "../lib/room-finished-outline";
import { createRoom, type RoomSnapshot } from "../lib/room-types";
import { getRoomWallFinishDepths } from "../lib/room-wall-finish-depths";
import { isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";
import {
  distanceToBox, edgesItMeets, EPS, exposedOnLine, inRegion, snapAlongNormal, snapGaps, toRun, toWorld, type LineFrame, type P, type Region, type Run, type Stretch,
} from "./built-in-faces-oracle-utils";
import { chainFaceBreaks, chainHost, collinearChains, type ChainHost, type EdgeFace } from "./built-in-collinear-oracle-utils";
import { checkMovesFromStuck, clearly, type StuckMoves } from "./built-in-stuck-oracle-utils";
import { IMPORTED_SHAPES, importedRegionOf, makeImportedCase, type ImportedCase, type ImportedRegion } from "./built-in-imported-oracle-utils";

/**
 * A seeded randomized oracle for built-ins in imported plans (lib/room-built-in-imported-region.ts; J, 1 Nov 2026: built-ins in
 * imported plans on the same rule as drawn rooms). Random canonical plans, built as an upload builds them
 * (scripts/built-in-imported-oracle-utils.ts) — a rectangle, two rooms with a partition thinner than their walls, a T (a room
 * along a through wall, two under it split by a stem), an L, four rooms about a cross junction, and a room with an angled wall
 * and a slight bend — axis-aligned, a quarter turn, 20° or any angle, mirrored half the time, with walls of 75–300 mm, doors
 * and windows, laminates on some walls and baseboards (up to 30 mm) in some rooms, are checked against each room as the
 * canonical 3D view draws it: every slice of every wall on its floor and the room's panels as drawn (each straight wall's on its
 * own lines; the plan rounds an opening's ends to whole millimetres, so a turned wall's slices stand up to 0.71 mm off it, and
 * every run is also checked against the slices exactly as drawn, within 0.75 mm).
 *
 * As the drawn rooms' oracle (scripts/test-built-in-faces-oracle.ts) checks them: every exposed face is offered as a host and
 * every host is one; on every host a base and a wall cabinet, fitted and placed, stand where Fit put them, clear of the walls
 * and panels, their back on a face (a base unit's on the baseboard), in front of no door or window (where the 3D view's slices
 * behind the run don't reach its height), 10 mm (and a floor run's baseboard) ±0.5 mm from what they meet along the face, a door
 * or where the face ends; nudges of 10 mm are kept or stopped at the face; turns, Snap to wall and Place as copy keep them in the
 * region, a refused turn fits nowhere within its reach (by brute force); Place of a run not fitted or fitted under the old rule
 * stands inside or is refused only where nothing fits; a refused Fit has no place on its host. CI runs 36 plans (about 15 s);
 * ORACLE_FULL=1 runs 480, ORACLE_PLANS any number, ORACLE_SEED another seed, ORACLE_ONLY one plan, ORACLE_TURNS=all every turn.
 */

const SEED = Number(process.env.ORACLE_SEED ?? 20261101);
const PLANS = Number(process.env.ORACLE_PLANS ?? (process.env.ORACLE_FULL ? 480 : 36));
const ALL_TURNS = process.env.ORACLE_TURNS === "all";
/**
 * A solid no further than this (metres) in front of a face is flush with it: the plan's 3D walls stand true to it (a turned T's
 * stem 0.006-0.02 mm proud of the through wall's face; review, 2 Nov 2026). It neither ends a face nor stands in a run's way.
 */
const PLAN_FLUSH = 0.00005;
/** How far a run may reach into a slice exactly as drawn: the plan's rounding of a turned wall's openings' ends (0.71 mm). */
const AS_DRAWN_TOLERANCE = 0.00075;

type Context = {
  room: RoomSnapshot; planRoom: HousePlanRoom2D; region: ImportedRegion; drawn: ImportedRegion; label: string;
  planRooms: Map<string, HousePlanRoom2D>; model: CanonicalFloorPlanRenderModel; faces: Array<{ a: P; b: P; n: P }>;
  /** The hosts over pieces all but collinear, and the faces the hosts are on, each with its normal (checkHostsOffered). */
  chainHosts: Map<CabinetHostSpace, ChainHost>; hostFaces: Array<{ a: P; b: P; n: P; borderline: boolean }>;
};
const failures: string[] = [];
const counts: Record<string, number> = { plans: 0, rooms: 0, furnitureRule: 0, faces: 0, hosts: 0, chains: 0, runs: 0, refused: 0, filling: 0, doorRuns: 0,
  nudges: 0, kept: 0, stopped: 0, turns: 0, turnsRefused: 0, snaps: 0, normalSnaps: 0, stuck: 0, stuckRefused: 0, stuckTurnsRefused: 0, tooLong: 0, tooLongRefused: 0, copies: 0, placements: 0, placementsRefused: 0 };
const kinds: Record<string, number> = {};
function check(condition: boolean, message: () => string) {
  if (!condition && failures.length < 40) failures.push(message());
}

/** The region's rings with their bounds, kept per region: a footprint's samples test only the rings around them. */
type Boxed = { ring: readonly P[]; minX: number; maxX: number; minZ: number; maxZ: number };
const boxedByRegion = new WeakMap<Region, Boxed[]>();
function boxedRings(region: Region): Boxed[] {
  const known = boxedByRegion.get(region);
  if (known) return known;
  const boxed = [...region.bands.map(({ outer }) => outer), ...region.others].map((ring) => {
    const xs = ring.map(({ x }) => x), zs = ring.map(({ z }) => z);
    return { ring, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  });
  boxedByRegion.set(region, boxed);
  return boxed;
}

/** inRegion (scripts/built-in-faces-oracle-utils.ts), testing only the rings (of `rings`) whose bounds hold the point. */
function inRegionNear(region: Region, point: P, rings = boxedRings(region)): boolean {
  if (!insideQuad(point, region.outline)) return false;
  return !rings.some((box) => point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ && insideQuad(point, box.ring));
}

/**
 * True when the footprint, `shrink` in from its sides, stands in the region: its outline every 5 mm, its middle every 50 mm,
 * and no corner of a solid or the outline inside it. A solid crossing it with no corner inside is at least a panel's 6 mm
 * board across, so the outline's samples meet it.
 */
function footprintInRegion(region: Region, run: Run, shrink: number): boolean {
  const halfWidth = run.width / 2 - shrink, halfDepth = run.depth / 2 - shrink, samples: P[] = [];
  for (const [from, to] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    const length = Math.hypot((to[0] - from[0]) * halfWidth, (to[1] - from[1]) * halfDepth), steps = Math.max(1, Math.ceil(length / 0.005));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      samples.push(toWorld(run, (from[0] + (to[0] - from[0]) * t) * halfWidth, (from[1] + (to[1] - from[1]) * t) * halfDepth));
    }
  }
  for (let a = -halfWidth; a <= halfWidth; a += 0.05) for (let b = -halfDepth; b <= halfDepth; b += 0.05) samples.push(toWorld(run, a, b));
  // Only the rings whose bounds meet the samples' can hold one.
  const [xs, zs] = [samples.map(({ x }) => x), samples.map(({ z }) => z)], [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const rings = boxedRings(region).filter((box) => box.minX <= maxX && box.maxX >= minX && box.minZ <= maxZ && box.maxZ >= minZ);
  if (!samples.every((sample) => inRegionNear(region, sample, rings))) return false;
  return !region.vertices.some((point) => {
    const [a, b] = toRun(run, 0, point);
    return Math.abs(a) < halfWidth - EPS && Math.abs(b - run.depth / 2) < halfDepth - EPS;
  });
}

/** In the region (0.6 mm in from its sides), and in the 3D view's slices exactly as drawn within 0.75 mm. */
function standsIn(context: Context, run: Run): boolean {
  return footprintInRegion(context.region, run, 0.0006) && footprintInRegion(context.drawn, run, AS_DRAWN_TOLERANCE);
}

/** True when the run, `shrink` in, less `depth` at its front, keeps `depth` off every exposed face (where a baseboard stands). */
function clearOfBaseboards(context: Context, run: Run, depth: number, shrink: number): boolean {
  if (!(depth > 0)) return true;
  const half = run.width / 2 - shrink, from = -run.depth / 2 + shrink, to = run.depth / 2 - Math.min(depth, run.depth) - shrink;
  const box = [[-half, from], [half, from], [half, to], [-half, to]].map(([along, across]) => toWorld(run, along, across));
  const apart = (first: P[], second: P[]) => [first, second].some((shape) => shape.some((point, index) => {
    const next = shape[(index + 1) % shape.length], [ax, az] = [-(next.z - point.z), next.x - point.x];
    const project = (points: P[]) => points.map((value) => value.x * ax + value.z * az);
    return Math.max(...project(first)) <= Math.min(...project(second)) || Math.max(...project(second)) <= Math.min(...project(first));
  }));
  return context.faces.every(({ a, b, n }) => apart(box, [a, b, { x: b.x + n.x * depth, z: b.z + n.z * depth }, { x: a.x + n.x * depth, z: a.z + n.z * depth }]));
}

const fitsAt = (context: Context, at: Run, standOff: number, shrink = 0.0006) =>
  standsIn(context, at) && footprintInRegion(context.region, at, shrink) && clearOfBaseboards(context, at, standOff, shrink);

/**
 * Where the 3D view leaves a gap behind the run's back for its height (a door, a window over a wall cabinet, an opening to the
 * wall's top): the slices the line straight back from its back through the wall first meets (and those within 2 mm of that,
 * up to 0.45 m back) don't reach from `bottomMm` to `topMm`, or there are none. Tried every 5 mm from 0.3 m before the run to 0.3 m past it, each change found to 0.01 mm;
 * as stretches along the run.
 */
function gapsBehind(context: Context, run: Run, back: number, bottomMm: number, topMm: number): Array<[number, number]> {
  const out = { x: Math.sin(run.rotationY), z: Math.cos(run.rotationY) };
  const near = context.drawn.slices.filter(({ quad }) => {
    const points = quad.map((point) => toRun(run, back, point)), [alongs, acrosses] = [points.map(([along]) => along), points.map(([, across]) => across)];
    return Math.min(...alongs) < run.width / 2 + 0.8 && Math.max(...alongs) > -run.width / 2 - 0.8 && Math.min(...acrosses) < 0.1 && Math.max(...acrosses) > -0.8;
  });
  const gapAt = (along: number) => {
    const origin = toWorld(run, along, -run.depth / 2 - back);
    const hits = near.flatMap((slice) => {
      const into = rayEntry(origin, { x: -out.x, z: -out.z }, slice.quad);
      return into !== null && into <= 0.45 ? [{ slice, into }] : [];
    });
    const first = Math.min(...hits.map(({ into }) => into));
    const spans = hits.filter(({ into }) => into <= first + 0.002).map(({ slice }) => [slice.bottomMm, slice.topMm] as const).sort((a, b) => a[0] - b[0]);
    let reach = bottomMm;
    for (const [low, high] of spans) if (low <= reach + 0.5) reach = Math.max(reach, high);
    // No slice at all: an opening to the wall's top (or past the face's end, where only a run's end can be near it).
    return hits.length === 0 || reach < topMm - 0.5;
  };
  const refine = (from: number, to: number) => {
    const opens = gapAt(to);
    for (let step = 0; step < 10; step += 1) {
      const middle = (from + to) / 2;
      if (gapAt(middle) === opens) to = middle; else from = middle;
    }
    return (from + to) / 2;
  };
  const gaps: Array<[number, number]> = [];
  let open: number | null = null, previous = -run.width / 2 - 0.3, was = gapAt(previous);
  if (was) open = previous;
  for (let along = previous + 0.005; along <= run.width / 2 + 0.3; along += 0.005) {
    const is = gapAt(along);
    if (is && !was) open = refine(previous, along);
    if (!is && was && open !== null) { gaps.push([open, refine(previous, along)]); open = null; }
    [previous, was] = [along, is];
  }
  if (open !== null) gaps.push([open, run.width / 2 + 0.3]);
  return gaps;
}

/** How far along `direction` from `origin` the ray enters the quad (0 inside it), or null where it misses. */
function rayEntry(origin: P, direction: P, quad: readonly P[]): number | null {
  if (insideQuad(origin, quad)) return 0;
  let entry: number | null = null;
  quad.forEach((a, index) => {
    const b = quad[(index + 1) % quad.length], [ex, ez] = [b.x - a.x, b.z - a.z];
    const denominator = direction.x * ez - direction.z * ex;
    if (Math.abs(denominator) < 1e-15) return;
    const t = ((a.x - origin.x) * ez - (a.z - origin.z) * ex) / denominator, u = ((a.x - origin.x) * direction.z - (a.z - origin.z) * direction.x) / denominator;
    if (t >= 0 && u >= 0 && u <= 1 && (entry === null || t < entry)) entry = t;
  });
  return entry;
}

function insideQuad(point: P, quad: readonly P[]): boolean {
  let inside = false;
  quad.forEach((current, index) => {
    const previous = quad[(index + quad.length - 1) % quad.length];
    if (current.z > point.z !== previous.z > point.z && point.x < ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x) inside = !inside;
  });
  return inside;
}

/** The run's face line's frame: [along the run from its middle, out from its face]. */
const runFrame = (run: Run, back: number): LineFrame => ({
  frame: (point) => toRun(run, back, point), at: (along, across) => toWorld(run, along, -run.depth / 2 - back + across),
});

function faceBreaks(region: Region, run: Run, back: number, from: number, to: number, chain?: ChainHost): boolean {
  if (chain) return chainFaceBreaks(chain, run, back, from, to);
  // Looked at a millimetre either side: a stretch under 1 mm isn't a face, so a narrower look finds none.
  const [low, high] = [Math.min(from, to), Math.max(from, to)];
  return !exposedOnLine(region, runFrame(run, back), low - 0.001, high + 0.001, PLAN_FLUSH).some((stretch) => stretch.from <= low && stretch.to >= high);
}

/**
 * How far the run's box [a0, a1] × [y0, y1] (its frame) stands from the edges it meets (distanceToBox), but along the face for an
 * edge all but parallel to it (under 0.06°): a turned plan's vertices are whole millimetres, so two walls in line (a T-junction's
 * through wall) meet at a bend of a thousandth of a degree or less, and the next one's face, rising in front of the run's back
 * over metres, is a few ten-thousandths of a mm from the run's corner wherever it ends. Where along it such a face comes in
 * front of the run is then known only between where it rises past the back (`flush`) and where it stands a thousandth of a mm
 * in front, where Fit meets it (`met`, lib/built-in-free-span.ts): the run keeps its allowance from somewhere between. Each the
 * nearest; none from what stands no further in front than that.
 */
function meetDistances(edges: ReturnType<typeof edgesItMeets>, [a0, a1, y0, y1]: [number, number, number, number]): { met: number; flush: number } {
  const along = ([p, q]: (typeof edges)[number], from: number) => {
    const at = (y: number) => p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]);
    const xs = [p, q].filter(([, y]) => y >= from).map(([x]) => x);
    if (Math.min(p[1], q[1]) < from) xs.push(at(from));
    return Math.max(0, Math.min(...xs) - a1, a0 - Math.max(...xs));
  };
  const each = edges.map((edge) => {
    const [p, q] = edge;
    if (Math.abs(q[1] - p[1]) >= 0.001 * Math.abs(q[0] - p[0])) return { met: distanceToBox([edge], [a0, a1, y0, y1]), flush: distanceToBox([edge], [a0, a1, y0, y1]) };
    if (Math.max(p[1], q[1]) <= y0 + 0.000001 || Math.min(p[1], q[1]) >= y1) return { met: Number.POSITIVE_INFINITY, flush: Number.POSITIVE_INFINITY };
    return { met: along(edge, y0 + 0.000001), flush: along(edge, y0) };
  });
  return { met: Math.min(Number.POSITIVE_INFINITY, ...each.map(({ met }) => met)), flush: Math.min(Number.POSITIVE_INFINITY, ...each.map(({ flush }) => flush)) };
}

/** Does the run end `gap` (±`tolerance`) from what its end meets, where its face ends, or at a door's edge, and nearer to none? */
function endsRight(
  region: Region, edges: ReturnType<typeof edgesItMeets>, run: Run, back: number, gap: number, side: -1 | 1, atOpening: boolean, tolerance: number, chain?: ChainHost
): boolean {
  const end = (side * run.width) / 2, box: [number, number, number, number] = [end, end, back, back + run.depth];
  const nearest = meetDistances(edges, box);
  const faceEndsBy = (reach: number) => faceBreaks(region, run, back, end, end + side * reach, chain);
  // Where the wall ending the face is all but parallel to it, the face's end is known only to its slack (exposedOnLine).
  const slack = chain ? 0 : faceEndSlack(region, run, back, end, side, gap + tolerance + 0.006);
  // At an opening it may stand up to it, and at one to the wall's top its face ends there. Within its slack of the face's end
  // (a wall all but parallel ending it), where that end is isn't known nearer.
  const near = gap - tolerance - slack;
  if (nearest.met < gap - tolerance || (!atOpening && near > 0 && faceEndsBy(near))) return false;
  return atOpening || nearest.flush <= gap + tolerance || faceEndsBy(gap + tolerance + slack) || meetDistances(edgesItMeets(region, run, back, true, back, PLAN_FLUSH), box).flush <= gap + tolerance;
}

/** How well the end of the face the run's `side` end stands on is known (its slack), looking `reach` past the run's end. */
function faceEndSlack(region: Region, run: Run, back: number, end: number, side: -1 | 1, reach: number): number {
  const [low, high] = [Math.min(end, end + side * reach), Math.max(end, end + side * reach)];
  const on = exposedOnLine(region, runFrame(run, back), low - 0.00002, high + 0.00002, PLAN_FLUSH).find((stretch) => stretch.from <= end + 1e-9 && stretch.to >= end - 1e-9);
  return on ? (side > 0 ? on.slackTo : on.slackFrom) : 0;
}

function fitRun(space: CabinetHostSpace, preset: "base" | "wall"): CabinetDefinition | null {
  const fitted = fitCabinetToSpace(createCabinetPreset(preset, `imported-${space.id}`), preset === "wall" ? { ...space, mountingHeightMm: 1450 } : space, { mode: "fit_width" });
  return fitted.ok ? fitted.definition : null;
}

const contained = (context: Context, at: Run, bottom: number) => isPlacementContainedInRoom({
  room: context.room, position: [at.x, bottom, at.z], rotationY: at.rotationY, dimensions: { w: at.width * 1000, d: at.depth * 1000, h: 870 },
  builtIn: true, planRooms: context.planRooms, canonicalModel: context.model,
});

function checkRun(context: Context, space: CabinetHostSpace, preset: "base" | "wall") {
  const definition = fitRun(space, preset);
  if (!definition) return checkRefusal(context, space, preset);
  counts.runs += 1;
  const { room } = context;
  const at = getCabinetFitPlacement(definition, room.geometry.width, room.geometry.depth);
  const placed = getCabinetPlacement(definition, room, false, context.planRooms, context.model);
  if (!at) return check(false, () => `${context.label}: no placement`);
  const run: Run = { x: placed.position[0], z: placed.position[2], width: definition.totalWidth / 1000, depth: definition.depth / 1000, rotationY: placed.rotationY };
  const what = () => `${context.label} ${space.wallId} ${preset} (${run.width.toFixed(3)} × ${run.depth.toFixed(3)})`;
  check(Math.hypot(run.x - at.position[0], run.z - at.position[2]) < 1e-5, () => `${what()}: moved from where Fit put it`);
  check(footprintInRegion(context.region, run, 0.0006), () => `${what()}: the 3D view's walls or panels cut into it`);
  check(footprintInRegion(context.drawn, run, AS_DRAWN_TOLERANCE), () => `${what()}: the slices as drawn cut more than 0.75 mm into it`);
  const floor = preset === "base", back = floor ? Math.max(0, space.baseboardOffsetMm ?? 0) / 1000 : 0;
  const gap = (10 + (floor ? Math.max(0, space.wallSegment?.startBaseboardClearanceMm ?? 0) : 0)) / 1000;
  // On a face, or over pieces all but collinear as far in front of them as the face bows behind its host's line.
  const chain = context.chainHosts.get(space), backs = Array.from({ length: 21 }, (_, index) => -run.width / 2 + 0.002 + ((run.width - 0.004) * index) / 20);
  check(backs.every((along) => !inRegion(context.region, toWorld(run, along, -run.depth / 2 - back - 0.0003 - (chain?.bow ?? 0)))), () => `${what()}: its back isn't on a face`);
  check(contained(context, run, floor ? 0 : 1.45), () => `${what()}: not contained`);
  const edges = edgesItMeets(context.region, run, back, false, back, PLAN_FLUSH);
  const clearance = meetDistances(edges, [-run.width / 2, run.width / 2, back, back + run.depth]).met;
  const slopes = edges.filter(([p, q]) => Math.min(Math.abs(p[0]), Math.abs(q[0])) < run.width / 2 + 0.03)
    .map(([p, q]) => Math.abs(q[1] - p[1]) / Math.max(1e-12, Math.abs(q[0] - p[0])));
  const tolerance = 0.0005 + Math.min(0.005, Math.max(0, ...slopes.map((slope) => 0.000002 / Math.max(1e-9, slope) - 0.0005)));
  check(clearance >= gap - tolerance, () => `${what()}: ${(clearance * 1000).toFixed(3)} mm from a wall it meets along its face, under ${((gap - tolerance) * 1000).toFixed(2)} mm`);
  const bottomMm = floor ? 0 : 1450, gaps = gapsBehind(context, run, back, bottomMm, bottomMm + getCabinetOverallHeight(definition));
  // At one: a gap behind it, or within 3 mm of an end (past a face's end there is no slice behind either).
  if (gaps.some(([from, to]) => to > -run.width / 2 - 0.003 && from < run.width / 2 + 0.003)) counts.doorRuns += 1;
  check(gaps.every(([from, to]) => to <= -run.width / 2 + 0.001 || from >= run.width / 2 - 0.001), () => `${what()}: it stands in front of a door or window (${gaps.map(([from, to]) => `${(from * 1000).toFixed(0)}..${(to * 1000).toFixed(0)}`).join(", ")} mm)`);
  const segment = definition.fitState?.segment;
  if (segment && Math.abs(segment.widthMm - definition.totalWidth) <= 1) {
    counts.filling += 1;
    for (const side of [-1, 1] as const) {
      const end = (side * run.width) / 2, atDoor = gaps.some(([from, to]) => Math.abs(from - end) < 0.003 || Math.abs(to - end) < 0.003);
      check(endsRight(context.region, edges, run, back, gap, side, atDoor, tolerance, chain), () => `${what()}: its ${side < 0 ? "start" : "end"} is more than ${((gap + tolerance) * 1000).toFixed(2)} mm from what it meets`);
    }
  }
  checkNudges(context, run, preset, what);
  checkMoves(context, run, definition, preset, what);
}

/** Every refused Fit: a run as narrow as Fit makes, slid along the host 5 mm at a time, mustn't stand anywhere on it. */
const narrowest = new Map<"base" | "wall", { width: number; depth: number; heightMm: number }>();
function narrowestRun(preset: "base" | "wall") {
  const known = narrowest.get(preset);
  if (known) return known;
  let found = { width: Number.POSITIVE_INFINITY, depth: 0, heightMm: 0 };
  for (let widthMm = 1500; widthMm >= 100; widthMm -= 5) {
    const room = createRoom("narrowest", "Narrowest", "kitchen", { width: widthMm / 1000, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 });
    const [north] = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
    const fitted = fitRun(north, preset);
    if (!fitted) break;
    found = { width: fitted.totalWidth / 1000, depth: fitted.depth / 1000, heightMm: getCabinetOverallHeight(fitted) };
  }
  narrowest.set(preset, found);
  return found;
}

function checkRefusal(context: Context, space: CabinetHostSpace, preset: "base" | "wall") {
  counts.refused += 1;
  const segment = space.wallSegment, smallest = narrowestRun(preset);
  if (!segment || !Number.isFinite(smallest.width)) return;
  const [ax, az, bx, bz] = [segment.startXmm, segment.startZmm, segment.endXmm, segment.endZmm].map((value) => value / 1000);
  const length = Math.hypot(bx - ax, bz - az), normal = Math.hypot(segment.inwardNormalX, segment.inwardNormalZ) || 1;
  const [nx, nz] = [segment.inwardNormalX / normal, segment.inwardNormalZ / normal], [ux, uz] = [(bx - ax) / (length || 1), (bz - az) / (length || 1)];
  const floor = preset === "base", back = floor ? Math.max(0, space.baseboardOffsetMm ?? 0) / 1000 : 0;
  const gap = (10 + (floor ? Math.max(0, segment.startBaseboardClearanceMm ?? 0) : 0)) / 1000 + 0.0005;
  const bottomMm = floor ? 0 : 1450, width = smallest.width + 0.0005, depth = smallest.depth;
  for (let along = width / 2; along <= length - width / 2 + 1e-9; along += 0.005) {
    const run: Run = { x: ax + ux * along + nx * (back + depth / 2), z: az + uz * along + nz * (back + depth / 2), width, depth, rotationY: Math.atan2(nx, nz) };
    if (meetDistances(edgesItMeets(context.region, run, back, false, back, PLAN_FLUSH), [-width / 2, width / 2, back, back + depth]).flush < gap) continue;
    if (faceBreaks(context.region, run, back, -width / 2 - gap, width / 2 + gap, context.chainHosts.get(space)) || !standsIn(context, run)) continue;
    if (gapsBehind(context, run, back, bottomMm, bottomMm + smallest.heightMm).some(([from, to]) => to > -width / 2 && from < width / 2)) continue;
    return check(false, () => `${context.label} ${space.wallId} ${preset}: Fit refuses it, but a ${(width * 1000).toFixed(1)} mm run stands ${(along * 1000).toFixed(0)} mm along it`);
  }
}

/** Nudges of 10 mm along the run's wall both ways, into it and out: kept where it fits, else stopped at the face, and contained. */
function checkNudges(context: Context, run: Run, preset: "base" | "wall", what: () => string) {
  const along = { x: Math.cos(run.rotationY), z: -Math.sin(run.rotationY) }, out = { x: Math.sin(run.rotationY), z: Math.cos(run.rotationY) };
  const bottom = preset === "wall" ? 1.45 : 0, standOff = preset === "wall" ? 0 : Math.round((context.room.geometry.baseboardDepth ?? 0) * 1000) / 1000;
  const fits = (at: Run, shrink: number) => footprintInRegion(context.region, at, shrink) && clearOfBaseboards(context, at, standOff, shrink);
  for (const [name, dx, dz] of [["along", along.x, along.z], ["back along", -along.x, -along.z], ["into the wall", -out.x, -out.z], ["out", out.x, out.z]] as const) {
    counts.nudges += 1;
    const target = { ...run, x: run.x + dx * 0.01, z: run.z + dz * 0.01 };
    const [x, z] = clampBuiltInToRoom(context.room, target.x, target.z, run.width, run.depth, run.rotationY, { from: [run.x, run.z], planRooms: context.planRooms, canonical: context.model, bottom });
    check(clearOfBaseboards(context, { ...run, x, z }, standOff, 0.00006), () => `${what()}: a nudge ${name} put it within the baseboard's ${(standOff * 1000).toFixed(0)} mm of a face`);
    const moved = (x - run.x) * dx + (z - run.z) * dz, sideways = Math.abs((x - run.x) * dz - (z - run.z) * dx);
    const keeps = fits(target, 0.00004);
    if (!keeps && fits(target, 0.00006)) continue;
    if (keeps) {
      counts.kept += 1;
      check(Math.abs(x - target.x) < 1e-9 && Math.abs(z - target.z) < 1e-9, () => `${what()}: a 10 mm nudge ${name} is refused or cut short (moved ${(moved * 1000).toFixed(3)} mm)`);
      continue;
    }
    counts.stopped += 1;
    check(moved >= -1e-9 && moved <= 0.01 + 1e-9 && sideways < 1e-9, () => `${what()}: a nudge ${name} went off its line`);
    check(!fits({ ...run, x: x + dx * 0.0002, z: z + dz * 0.0002 }, 0.00004), () => `${what()}: a nudge ${name} stopped ${(moved * 1000).toFixed(3)} mm, short of the face`);
    check(contained(context, { ...run, x, z }, bottom), () => `${what()}: a nudge ${name} stopped where it isn't contained`);
    check(footprintInRegion(context.drawn, { ...run, x, z }, AS_DRAWN_TOLERANCE), () => `${what()}: a nudge ${name} stopped where the slices as drawn cut more than 0.75 mm into it`);
  }
  // Containment takes a built-in only where it stands in the region, off the baseboards: a run moved 1 to 25 mm into its wall
  // (into a baseboard, where furniture of its size may stand) is accepted only where it fits.
  for (const into of [0.001, 0.003, 0.006, 0.01, 0.015, 0.025]) {
    const moved = { ...run, x: run.x - out.x * into, z: run.z - out.z * into };
    if (contained(context, moved, bottom)) check(fits(moved, 0.0006), () => `${what()}: contained ${(into * 1000).toFixed(0)} mm into its wall, where it doesn't fit (a ${(standOff * 1000).toFixed(0)} mm baseboard)`);
  }
}

/** The turns tried, as the drawn oracle's: every eighth run in CI (its 600 mm unit −15° and 45°, the run 90° and 180°). */
const TURNS = ALL_TURNS ? { unit: [5, -5, 15, -15, 45, 90, 180], run: [5, -5, 15, -15, 45, 90, 180] } : { unit: [-15, 45], run: [90, 180] };

/** Turns, Snap to wall and Place as copy, as the inspector makes them (the drawn oracle's checkMoves). */
function checkMoves(context: Context, run: Run, definition: CabinetDefinition, preset: "base" | "wall", what: () => string) {
  const { room } = context, bottom = preset === "wall" ? 1.45 : 0, standOff = getBuiltInStandOff(room, bottom);
  const unitWidth = Math.min(0.6, run.width), along = { x: Math.cos(run.rotationY), z: -Math.sin(run.rotationY) };
  const unit: Run = { ...run, width: unitWidth, x: run.x - (along.x * (run.width - unitWidth)) / 2, z: run.z - (along.z * (run.width - unitWidth)) / 2 };
  const turning = ALL_TURNS || counts.runs % 8 === 0;
  for (const [name, piece, turns] of [["unit", unit, TURNS.unit], ["run", run, TURNS.run]] as const) {
    for (const degrees of turning ? turns : []) {
      counts.turns += 1;
      const rotationY = piece.rotationY + (degrees * Math.PI) / 180;
      const [x, z] = clampBuiltInToRoom(room, piece.x, piece.z, piece.width, piece.depth, rotationY, { planRooms: context.planRooms, canonical: context.model, bottom, turnedFrom: piece.rotationY });
      const turned: Run = { ...piece, x, z, rotationY }, inPlace: Run = { ...piece, rotationY }, moved = Math.hypot(x - piece.x, z - piece.z);
      const reach = Math.max(0.6, Math.hypot(piece.width, piece.depth) * Math.sin(Math.abs(degrees * Math.PI / 180) / 2));
      if (!contained(context, turned, bottom)) {
        counts.turnsRefused += 1;
        check(!fitsAt(context, inPlace, standOff, -0.001), () => `${what()} ${name}: a ${degrees}° turn is refused, though it fits where it stands`);
        const nearest = bruteNearestFit(context, inPlace, bottom, reach, (place) => fitsAt(context, place, standOff));
        check(nearest === null, () => `${what()} ${name}: a ${degrees}° turn is refused, though it fits ${((nearest ?? 0) * 1000).toFixed(0)} mm away (within ${(reach * 1000).toFixed(0)} mm)`);
        continue;
      }
      check(fitsAt(context, turned, standOff), () => `${what()} ${name}: a ${degrees}° turn put it where the 3D view's walls cut it or on a baseboard (moved ${(moved * 1000).toFixed(0)} mm)`);
      check(moved <= reach + 0.001, () => `${what()} ${name}: a ${degrees}° turn threw it ${(moved * 1000).toFixed(0)} mm (within ${(reach * 1000).toFixed(0)} mm)`);
      if (fitsAt(context, inPlace, standOff, -0.001)) check(moved < 1e-6, () => `${what()} ${name}: a ${degrees}° turn moved it ${(moved * 1000).toFixed(1)} mm, though it fits where it stands`);
    }
    if (name === "run" && !ALL_TURNS) continue;
    counts.snaps += 1;
    const [toX, toZ] = getBuiltInSnapTarget(room, [piece.x, bottom, piece.z], piece.width, piece.depth, piece.rotationY, context.planRooms, context.model);
    const [x, z] = clampBuiltInToRoom(room, toX, toZ, piece.width, piece.depth, piece.rotationY, { from: [piece.x, piece.z], planRooms: context.planRooms, canonical: context.model, bottom });
    check(contained(context, { ...piece, x, z }, bottom), () => `${what()} ${name}: Snap to wall is refused`);
    check(fitsAt(context, { ...piece, x, z }, standOff), () => `${what()} ${name}: Snap to wall put it where the 3D view's walls cut it or on a baseboard`);
    checkSnapAlongNormal(context, piece, bottom, () => `${what()} ${name}`);
  }
  if (turning) checkStuck(context, run, definition, preset, what);
  counts.copies += 1;
  const copy = getCabinetPlacement(definition, room, true, context.planRooms, context.model);
  check(fitsAt(context, { ...run, x: copy.position[0], z: copy.position[2], rotationY: copy.rotationY }, standOff), () => `${what()}: Place as copy put it where the 3D view's walls cut it or on a baseboard`);
}

/**
 * In a room with a face off x and z, Snap to wall from 0.3 m out from where it stands goes straight back to the nearest face
 * along that face's normal (snapAlongNormal, over the faces the hosts are on), and from there stands where it fits.
 */
function checkSnapAlongNormal(context: Context, piece: Run, bottom: number, what: () => string) {
  if (!context.hostFaces.some(({ n }) => Math.abs(n.x) > 1e-9 && Math.abs(n.z) > 1e-9)) return;
  counts.normalSnaps += 1;
  const standOff = getBuiltInStandOff(context.room, bottom), out: Run = { ...piece, x: piece.x + Math.sin(piece.rotationY) * 0.3, z: piece.z + Math.cos(piece.rotationY) * 0.3 };
  const [toX, toZ] = getBuiltInSnapTarget(context.room, [out.x, bottom, out.z], out.width, out.depth, out.rotationY, context.planRooms, context.model);
  // As the faces give it, or as they give it without the borderline ones.
  const expected = [...snapAlongNormal(context.hostFaces, out, standOff), ...snapAlongNormal(context.hostFaces.filter(({ borderline }) => !borderline), out, standOff)];
  // Or straight back to another face the 3D view exposes (a short one on an arc, at one end of its edge), no further than those.
  const nearest = Math.min(Number.POSITIVE_INFINITY, ...snapGaps(context.hostFaces, out, standOff).map(({ gap }) => Math.abs(gap)));
  const another = snapGaps(context.faces, out, standOff).some(({ gap, n }) => Math.abs(gap) <= nearest + 1e-6 && Math.hypot(out.x - n.x * gap - toX, out.z - n.z * gap - toZ) < 1e-6);
  check(another || expected.some(([x, z]) => Math.hypot(x - toX, z - toZ) < 1e-6), () => `${what()}: Snap to wall from 0.3 m out went to (${toX.toFixed(4)}, ${toZ.toFixed(4)}), not straight back to the nearest face (${expected.map(([x, z]) => `${x.toFixed(4)}, ${z.toFixed(4)}`).join("; ")})`);
  const [x, z] = clampBuiltInToRoom(context.room, toX, toZ, out.width, out.depth, out.rotationY, { from: [out.x, out.z], planRooms: context.planRooms, canonical: context.model, bottom });
  if (contained(context, { ...out, x, z }, bottom)) check(fitsAt(context, { ...out, x, z }, standOff), () => `${what()}: Snap to wall from 0.3 m out put it where it doesn't fit`);
}

/**
 * Moves from a place where a run doesn't fit (scripts/built-in-stuck-oracle-utils.ts): pushed 30 mm into its wall (as one
 * saved before its room's rule stands), it comes free along its face; made 30 mm longer than its face (as a panel added on an
 * end wall leaves one fitted before), nothing along its face fits, and its moves are refused, never thrown off its wall. A 5°
 * turn of the pushed one ends where it fits, or is refused only where nothing fits within 0.6 m (by brute force).
 */
function checkStuck(context: Context, run: Run, definition: CabinetDefinition, preset: "base" | "wall", what: () => string) {
  const { room } = context, bottom = preset === "wall" ? 1.45 : 0, standOff = getBuiltInStandOff(room, bottom);
  const out = { x: Math.sin(run.rotationY), z: Math.cos(run.rotationY) }, options = { planRooms: context.planRooms, canonical: context.model, bottom };
  const moves: StuckMoves = {
    contained: (at) => contained(context, at, bottom), fits: (at) => fitsAt(context, at, standOff),
    clearlyFits: (at) => fitsAt(context, clearly(at), standOff, 0.000001),
    move: (piece, x, z) => clampBuiltInToRoom(room, x, z, piece.width, piece.depth, piece.rotationY, { ...options, from: [piece.x, piece.z] }),
    drag: (piece, x, z) => getBuiltInDragPlace(room, [piece.x, piece.z], x, z, piece.width, piece.depth, piece.rotationY, options),
    snapAim: (piece) => getBuiltInSnapTarget(room, [piece.x, bottom, piece.z], piece.width, piece.depth, piece.rotationY, context.planRooms, context.model),
  };
  const stuck: Run = { ...run, x: run.x - out.x * 0.03, z: run.z - out.z * 0.03 };
  if (!fitsAt(context, stuck, standOff, -0.001)) {
    counts.stuck += 1;
    counts.stuckRefused += checkMovesFromStuck(run, stuck, moves, check, () => `${what()} (30 mm into its wall)`);
    const rotationY = run.rotationY + (5 * Math.PI) / 180;
    const turned = clampBuiltInToRoom(room, stuck.x, stuck.z, run.width, run.depth, rotationY, { ...options, turnedFrom: run.rotationY });
    if (contained(context, { ...stuck, x: turned[0], z: turned[1], rotationY }, bottom)) {
      check(fitsAt(context, { ...stuck, x: turned[0], z: turned[1], rotationY }, standOff), () => `${what()}: stuck, a 5° turn left it where it doesn't fit`);
    } else {
      counts.stuckTurnsRefused += 1;
      const nearest = bruteNearestFit(context, { ...stuck, rotationY }, bottom, 0.6, (place) => fitsAt(context, place, standOff));
      check(nearest === null, () => `${what()}: stuck, a 5° turn is refused, though it fits ${((nearest ?? 0) * 1000).toFixed(0)} mm away`);
    }
  }
  const longer: Run = { ...run, width: (definition.fitState?.host.availableWidthMm ?? 0) / 1000 + 0.03 };
  if (longer.width > run.width && !fitsAt(context, longer, standOff, -0.001)) {
    counts.tooLong += 1;
    counts.tooLongRefused += checkMovesFromStuck(run, longer, moves, check, () => `${what()} (made longer than its face)`);
  }
}

/** The distance to the nearest place within `reach` (a 10 mm grid, or reach/60) where it fits by the region's test and `fits`. */
function bruteNearestFit(context: Context, piece: Run, bottom: number, reach: number, fits: (at: Run) => boolean): number | null {
  const faces = getRoomBuiltInFaces(context.room, undefined, context.planRooms, context.model), standOff = getBuiltInStandOff(context.room, bottom);
  const step = Math.max(0.01, reach / 60), offsets: Array<[number, number, number]> = [];
  for (let dx = -reach; dx <= reach + 1e-9; dx += step) for (let dz = -reach; dz <= reach + 1e-9; dz += step) {
    const distance = Math.hypot(dx, dz);
    if (distance <= reach) offsets.push([dx, dz, distance]);
  }
  offsets.sort((first, second) => first[2] - second[2]);
  for (const [dx, dz, distance] of offsets) {
    const at: Run = { ...piece, x: piece.x + dx, z: piece.z + dz };
    if (builtInFootprintFits(faces, at.x, at.z, at.width, at.depth, at.rotationY, 0.00005, standOff) && fits(at)) return distance;
  }
  return null;
}

/**
 * Fit's hosts for an imported room before this rule (5a366d16's buildLineHosts for furniture's rule, restated): its outline moved
 * in by each edge's signed depth, a whole average wall plus 10 mm off each end.
 */
function oldHostsOf(room: RoomSnapshot): CabinetHostSpace[] {
  const polygon = getRoomPlanOutlinePoints(getRoomOutlineInsideFinishes({ shape: "custom_polygon", polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth }, getRoomWallFinishDepths(room)));
  return createCabinetPolygonWallSpaces({
    roomId: room.id, roomName: room.name, roomType: room.roomType === "balcony" ? "custom" : room.roomType, heightMm: Math.round((room.geometry.height ?? 2.6) * 1000),
    baseboardOffsetMm: Math.max(0, Math.round((room.geometry.baseboardDepth ?? 0) * 1000)), polygon,
    openings: mapCabinetCardinalOpeningsToPolygonWalls({ polygon, openings: [] }), installationClearanceSideMm: Math.round((room.geometry.wallThickness ?? 0.12) * 1000) + 10,
  });
}

/** Place and Save as copy of a run not fitted, and of one fitted under the old rule: inside, or refused only where nothing fits. */
function checkPlacements(context: Context) {
  const { room } = context;
  const oldHost = oldHostsOf(room).find((host) => host.availableWidthMm >= 700);
  const oldFit = oldHost ? fitCabinetToSpace(createCabinetPreset("base", `old-${room.id}`), oldHost, { mode: "fit_width" }) : null;
  const unfitted = { ...createCabinetPreset("base", `unfitted-${room.id}`), fitState: undefined } as CabinetDefinition;
  const cases: Array<[string, CabinetDefinition]> = [["a run not fitted", unfitted], ...(oldFit?.ok ? [["a run fitted under the old rule", oldFit.definition] as [string, CabinetDefinition]] : [])];
  for (const [name, definition] of cases) for (const asCopy of [false, true]) {
    counts.placements += 1;
    const placed = getCabinetPlacement(definition, room, asCopy, context.planRooms, context.model);
    const at: Run = { x: placed.position[0], z: placed.position[2], width: definition.totalWidth / 1000, depth: definition.depth / 1000, rotationY: placed.rotationY };
    const standOff = getBuiltInStandOff(room, placed.position[1]), what = `${context.label}: ${asCopy ? "Save as copy" : "Place"} of ${name} (${definition.totalWidth} mm)`;
    if (contained(context, at, placed.position[1])) {
      check(fitsAt(context, at, standOff), () => `${what}: placed at (${at.x.toFixed(3)}, ${at.z.toFixed(3)}), where the 3D view's walls cut it or on a baseboard`);
      continue;
    }
    counts.placementsRefused += 1;
    const nearest = bruteNearestFit(context, { ...at, x: 0, z: 0 }, placed.position[1], Math.hypot(room.geometry.width, room.geometry.depth), (place) => fitsAt(context, place, standOff));
    check(nearest === null, () => `${what}: refused, though it fits ${((nearest ?? 0) * 1000).toFixed(0)} mm from the room's middle`);
  }
}

/**
 * Every face the 3D view draws exposed is offered, and every host is one: for each outline edge, the face line half its own
 * wall and its panel in from it (the wall it names, as the 3D view draws it), or where a slice running along it stands its far
 * side in front of that, whichever is exposed along more of the edge; its stretches 21 mm or more each within a host on that
 * line, and each host on the line starting and ending where an exposed stretch does (±0.5 mm). Edges whose pieces are all but
 * collinear and whose faces meet (a T-junction's through wall a turned plan bends by rounding) are one host over them all
 * (scripts/built-in-collinear-oracle-utils.ts), and no other host is on their lines. No two hosts the same.
 */
function checkHostsOffered(context: Context, spaces: CabinetHostSpace[], case_: ImportedCase) {
  const { region, room, planRoom, label } = context, outline = region.outline;
  const sign = outline.reduce((sum, point, index) => sum + point.x * outline[(index + 1) % outline.length].z - outline[(index + 1) % outline.length].x * point.z, 0) >= 0 ? 1 : -1;
  const keys = spaces.map((space) => JSON.stringify(space.wallSegment && [space.wallSegment.startXmm, space.wallSegment.startZmm, space.wallSegment.endXmm, space.wallSegment.endZmm]));
  check(new Set(keys).size === keys.length, () => `${label}: a host is listed twice`);
  const reach = room.geometry.width + room.geometry.depth;
  const edges = outline.map((start, index) => {
    const end = outline[(index + 1) % outline.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    const wall = case_.floor.walls.find(({ id }) => id === room.planEdgeWallIds?.[index]);
    if (!(length > 1e-9) || !wall) return check(Boolean(wall), () => `${label} edge ${index}: no wall`), null;
    const [dx, dz] = [(end.x - start.x) / length, (end.z - start.z) / length], [nx, nz] = [-dz * sign, dx * sign];
    const lineAt = (face: number) => {
      const origin = { x: start.x + nx * face, z: start.z + nz * face };
      const line: LineFrame = {
        frame: (point) => [(point.x - origin.x) * dx + (point.z - origin.z) * dz, (point.x - origin.x) * nx + (point.z - origin.z) * nz],
        at: (along, across) => ({ x: origin.x + dx * along + nx * across, z: origin.z + dz * along + nz * across }),
      };
      const exposed = exposedOnLine(region, line, -reach, length + reach, PLAN_FLUSH);
      const own = exposed.filter((stretch) => Math.min(stretch.to, length) - Math.max(stretch.from, 0) >= 0.02 + 0.001 + stretch.slackFrom + stretch.slackTo);
      return { line, exposed, own, along: own.reduce((sum, stretch) => sum + Math.min(stretch.to, length) - Math.max(stretch.from, 0), 0) };
    };
    const ownFace = wall.thicknessMm / 2000 + getCanonicalRoomWallFinish(planRoom, wall.id).depthMm / 1000;
    const depths = [ownFace, ...region.slices.flatMap(({ quad }) => {
      const first = quad[0], second = quad[1], span = Math.hypot(second.x - first.x, second.z - first.z);
      if (!(span > 0) || Math.abs(((second.x - first.x) * dz - (second.z - first.z) * dx) / span) >= 0.00001) return [];
      const across = quad.map((point) => (point.x - start.x) * nx + (point.z - start.z) * nz), along = quad.map((point) => (point.x - start.x) * dx + (point.z - start.z) * dz);
      return Math.min(...across) < ownFace && Math.max(...across) > ownFace + 0.000005 && Math.max(...along) > 0 && Math.min(...along) < length ? [Math.max(...across)] : [];
    })];
    const faces = depths.map(lineAt), most = Math.max(...faces.map((face) => face.along));
    const hostsOn = ({ line }: (typeof faces)[number]) => spaces.flatMap((space) => {
      const segment = space.wallSegment;
      if (!segment) return [];
      const [a, b] = [line.frame({ x: segment.startXmm / 1000, z: segment.startZmm / 1000 }), line.frame({ x: segment.endXmm / 1000, z: segment.endZmm / 1000 })];
      const along = Math.abs(b[0] - a[0]) >= 0.001 ? Math.abs(b[1] - a[1]) / Math.abs(b[0] - a[0]) < 1e-6 : space.wallId === `wall-${index}`;
      return along && Math.abs(a[1]) < 0.00001 && Math.abs(b[1]) < 0.00001 ? [{ space, from: Math.min(a[0], b[0]), to: Math.max(a[0], b[0]) }] : [];
    });
    const best = faces.filter((face) => face.along >= most - 0.001);
    const chosen = best.find((face) => hostsOn(face).length) ?? best[0], { own } = chosen;
    faces.forEach((face) => face.exposed.filter((stretch) => stretch.to - stretch.from >= 0.02)
      .forEach((stretch) => context.faces.push({ a: face.line.at(stretch.from, 0), b: face.line.at(stretch.to, 0), n: { x: nx, z: nz } })));
    // Stretches apart only where something stands in front of the face are one face, in one host.
    const backedBetween = (from: number, to: number) => Array.from({ length: 9 }, (_, step) => from + ((to - from) * (step + 1)) / 10)
      .every((along) => !inRegion(region, chosen.line.at(along, -0.000005)));
    const groups = own.reduce<Array<typeof own>>((all, stretch) => {
      const group = all[all.length - 1];
      if (group && backedBetween(group[group.length - 1].to, stretch.from)) group.push(stretch);
      else all.push([stretch]);
      return all;
    }, []);
    // The face Snap to wall measures from: the stretches 20 mm or more on the chosen line that reach the edge, from the first to
    // the last, a host's or not. Its host spans them all: an opening to the wall's top between two leaves nothing behind there.
    const snapFace = chosen.exposed.filter((stretch) => stretch.to > 0 && stretch.from < length && stretch.to - stretch.from >= 0.02);
    // One reaching its edge by under a millimetre, or within a millimetre of 20 mm long, may be a face or not (borderline).
    const [first, last] = [snapFace[0], snapFace[snapFace.length - 1]];
    if (first && last) context.hostFaces.push({ a: chosen.line.at(first.from, 0), b: chosen.line.at(last.to, 0), n: { x: nx, z: nz },
      borderline: last.to < 0.001 || first.from > length - 0.001 || Math.min(...snapFace.map((stretch) => stretch.to - stretch.from)) < 0.021 });
    return { index, what: `${label} edge ${index} (${wall.id})`, chosen, onLine: hostsOn(chosen), groups, face: { dx, dz, nx, nz, line: chosen.line, groups, backed: backedBetween } };
  });
  checkEdgeHosts(context, spaces, edges);
}

type EdgeHosts = {
  index: number; what: string; chosen: { exposed: Stretch[] }; onLine: Array<{ space: CabinetHostSpace; from: number; to: number }>; groups: Stretch[][]; face: EdgeFace;
};

/** Each edge's face groups within a host on its line, and each host there where a stretch starts and ends; a chain's, its host. */
function checkEdgeHosts(context: Context, spaces: CabinetHostSpace[], edges: Array<EdgeHosts | null>) {
  const faces = edges.map((edge) => edge?.face ?? null), chains = collinearChains(faces), chained = new Set(chains.flatMap(({ edges: of }) => of));
  chains.forEach((chain) => {
    const host = chainHost(chain, faces, spaces), what = `${context.label} edges ${chain.edges.join(", ")}`;
    counts.chains += 1;
    check(host !== null, () => `${what}: all but collinear, their faces meet, but no host runs over them all (${spaces.map((space) => space.wallId).join(", ")})`);
    if (!host) return;
    counts.hosts += 1;
    context.chainHosts.set(host.space, host);
    chain.edges.forEach((index) => check(edges[index]?.onLine.every(({ space }) => space === host.space) ?? true, () => `${what}: another host on edge ${index}'s line`));
  });
  edges.forEach((edge) => {
    if (!edge) return;
    const { what, onLine, groups, chosen: { exposed } } = edge;
    if (groups.length) counts.faces += 1;
    if (chained.has(edge.index)) return;
    counts.hosts += onLine.filter((host) => host.space.wallId === `wall-${edge.index}`).length;
    groups.forEach((group) => {
      const first = group[0], last = group[group.length - 1];
      check(onLine.some((host) => host.from <= first.from + 0.0005 + first.slackFrom && host.to >= last.to - 0.0005 - last.slackTo),
        () => `${what}: its face, exposed ${group.map((stretch) => `${(stretch.from * 1000).toFixed(1)}..${(stretch.to * 1000).toFixed(1)}`).join(", ")} mm along it, isn't within a host (${onLine.map((host) => `${(host.from * 1000).toFixed(1)}..${(host.to * 1000).toFixed(1)}`).join(", ") || "none"})`);
    });
    onLine.forEach((host) => check(exposed.some((stretch) => Math.abs(stretch.from - host.from) <= 0.0005 + stretch.slackFrom) &&
      exposed.some((stretch) => Math.abs(stretch.to - host.to) <= 0.0005 + stretch.slackTo),
      () => `${what}: host ${host.space.wallId} ${(host.from * 1000).toFixed(1)}..${(host.to * 1000).toFixed(1)} mm isn't where an exposed face starts and ends (${exposed.map((stretch) => `${(stretch.from * 1000).toFixed(1)}..${(stretch.to * 1000).toFixed(1)}`).join(", ") || "none"})`));
  });
}

const started = Date.now();
for (let index = 0; index < PLANS; index += 1) {
  if (process.env.ORACLE_ONLY && Number(process.env.ORACLE_ONLY) !== index) continue;
  const case_ = makeImportedCase(index, SEED);
  counts.plans += 1;
  kinds[case_.kind] = (kinds[case_.kind] ?? 0) + 1;
  for (const room of case_.rooms) {
    const planRoom = case_.planRooms.get(room.id);
    if (!planRoom) continue;
    counts.rooms += 1;
    const label = `plan ${index} (${case_.kind}, ${case_.placement.turnDeg.toFixed(1)}°${case_.placement.mirror ? " mirrored" : ""}, seed ${SEED}) room ${room.id}`;
    if (process.env.ORACLE_ONLY) console.log(label, JSON.stringify({ edges: room.planEdgeWallThicknessesMm, baseboard: room.geometry.baseboardDepth, faces: room.surfaces?.walls?.faces }));
    if (usesFurnitureRuleForBuiltIns(room, undefined, case_.planRooms, case_.model)) {
      counts.furnitureRule += 1;
      check(false, () => `${label}: on furniture's rule, though its plan holds it`);
      continue;
    }
    const context: Context = {
      room, planRoom, label, planRooms: case_.planRooms, model: case_.model, faces: [], chainHosts: new Map(), hostFaces: [],
      region: importedRegionOf(room, planRoom, case_.floor), drawn: importedRegionOf(room, planRoom, case_.floor, true),
    };
    const spaces = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: case_.rooms.length, planOpenings: [], planRooms: case_.planRooms, canonicalModel: case_.model });
    checkHostsOffered(context, spaces, case_);
    spaces.forEach((space) => (["base", "wall"] as const).forEach((preset) => checkRun(context, space, preset)));
    if (ALL_TURNS || process.env.ORACLE_FULL || counts.rooms % 3 === 0) checkPlacements(context);
  }
}

console.log(`Built-in imported oracle: ${counts.plans} plans (${IMPORTED_SHAPES.map((kind) => `${kind} ${kinds[kind] ?? 0}`).join(", ")}), ${counts.rooms} rooms,`,
  `${counts.furnitureRule} on furniture's rule; ${counts.faces} exposed faces, ${counts.hosts} hosts (${counts.chains} over pieces all but collinear); ${counts.runs} runs (${counts.filling} filling their stretch, ${counts.doorRuns} at a door or window), ${counts.refused} refused,`,
  `${counts.nudges} nudges (${counts.kept} kept, ${counts.stopped} stopped at the face), ${counts.turns} turns (${counts.turnsRefused} refused), ${counts.snaps} snaps (${counts.normalSnaps} along a face's normal), ${counts.copies} copies,`,
  `${counts.stuck} runs stuck in their wall moved (${counts.stuckRefused} moves and ${counts.stuckTurnsRefused} turns refused), ${counts.tooLong} made longer than their face moved (${counts.tooLongRefused} of ${counts.tooLong * 3} moves refused),`,
  `${counts.placements} placements of runs not fitted or fitted under the old rule (${counts.placementsRefused} refused); seed ${SEED}, ${((Date.now() - started) / 1000).toFixed(1)} s.`);
assert.deepEqual(failures, [], `the oracle found ${failures.length}${failures.length >= 40 ? "+" : ""} failures`);
console.log("Built-in imported oracle tests passed.");
