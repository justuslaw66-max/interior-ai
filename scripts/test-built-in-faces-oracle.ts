import assert from "node:assert/strict";

import {
  createCabinetPolygonWallSpaces,
  createCabinetRoomWallSpaces,
  fitCabinetToSpace,
  getCabinetFitPlacement,
  mapCabinetCardinalOpeningsToPolygonWalls,
} from "../features/cabinetry/fitToSpace";
import { getCabinetOverallDepth, getCabinetOverallWidth } from "../features/cabinetry/layout";
import { createCabinetPreset } from "../features/cabinetry/presets";
import { buildCabinetryAvailableSpaces, getCabinetPlacement } from "../features/cabinetry/roomCabinetHosts";
import type { CabinetDefinition, CabinetHostSpace } from "../features/cabinetry/types";
import type { RoomOpening2D } from "../lib/editorScene";
import { clampBuiltInToRoom, getBuiltInSnapTarget, usesFurnitureRuleForBuiltIns } from "../lib/room-built-in-faces";
import { getRoomOutlineInsideFinishes, getRoomPlanOutlinePoints } from "../lib/room-finished-outline";
import { createRoom, type RoomSnapshot } from "../lib/room-types";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "../lib/room-wall-finish-depths";
import { clampToPlacementRoom, isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";
import {
  distanceToBox, edgesItMeets, EPS, inRegion, insideRing, regionOf, toRun, toWorld, type P, type Region, type Run,
} from "./built-in-faces-oracle-utils";

/**
 * A seeded randomized oracle for where built-ins stand (lib/room-built-in-region.ts; J, 29 Oct 2026: "Face, back flush").
 * Random drawn rooms — rectangles, L's, bends 0–20° both ways, 32-segment arcs with a panelled segment, overshoots and double
 * overshoots, spikes and stubs in and out, thin wedges, tiny chamfers and jogs, straight walls drawn in two pieces with a door,
 * rooms their walls fill, both windings — with random walls, panels, baseboards, doors, and columns free, against a wall or in a
 * corner, are checked against the room as the 3D view draws it (scripts/built-in-faces-oracle-utils.ts): its own wall bands
 * and panel boxes. Each fitted, placed run must stand clear of them with its back on a face, clear of every door on its wall,
 * end 10 mm (and a floor run's baseboard) ±0.5 mm from what it meets along its face, a door or the face's end (more along a
 * wall all but parallel to its face), and keep nudges of 10 mm along and into its wall or stop them at the face. A room with no
 * exposed face must behave exactly as on the line (furniture's rule). CI runs 500 rooms (about 13 s); ORACLE_FULL=1 runs 2,400
 * (about 2 min), ORACLE_ROOMS any number, ORACLE_SEED another seed, ORACLE_ONLY one room.
 */

const SEED = Number(process.env.ORACLE_SEED ?? 20261031);
const ROOMS = Number(process.env.ORACLE_ROOMS ?? (process.env.ORACLE_FULL ? 2400 : 500));
let state = SEED >>> 0;
function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state ^ (state >>> 15), 1 | state);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
const between = (low: number, high: number) => low + (high - low) * random();
const chance = (probability: number) => random() < probability;
const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];

// --- Rooms -------------------------------------------------------------------------------------------------------------------
type Shape = { family: string; planShape: "rectangle" | "l_shape" | "custom_polygon"; points?: P[]; w: number; d: number };
const box = (w: number, d: number): P[] => [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }, { x: w / 2, z: d / 2 }, { x: -w / 2, z: d / 2 }];
const polygon = (family: string, points: P[]): Shape => ({ family, planShape: "custom_polygon", points, w: 0, d: 0 });
/** A box whose north wall (from its north-west corner) runs through `middle` before its north-east corner. */
function northThrough(w: number, d: number, middle: (north: number) => P[], east?: P): P[] {
  const [northWest, northEast, southEast, southWest] = box(w, d);
  return [northWest, ...middle(northWest.z), east ?? northEast, southEast, southWest];
}
const SHAPES: Record<string, (w: number, d: number) => Shape> = {
  rectangle: (w, d) => ({ family: "rectangle", planShape: "rectangle", w, d }),
  "drawn rectangle": (w, d) => polygon("drawn rectangle", box(w, d)),
  "built-in L": (w, d) => ({ family: "built-in L", planShape: "l_shape", w, d }),
  "drawn L": (w, d) => {
    const [cutW, cutD] = [between(0.2, 0.7) * w, between(0.2, 0.7) * d];
    return polygon("drawn L", [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }, { x: w / 2, z: d / 2 - cutD }, { x: w / 2 - cutW, z: d / 2 - cutD }, { x: w / 2 - cutW, z: d / 2 }, { x: -w / 2, z: d / 2 }]);
  },
  bend: (w, d) => {
    const at = between(-0.3, 0.3) * w, half = (between(0, 10) * Math.PI) / 180, sign = chance(0.5) ? 1 : -1;
    return polygon("bend", northThrough(w, d, (north) => [{ x: at, z: north + sign * Math.tan(half) * Math.min(at + w / 2, w / 2 - at) }]));
  },
  arc: (w, d) => {
    const sagitta = between(0.1, 0.8) * (chance(0.5) ? 1 : -1), radius = (sagitta * sagitta + (w / 2) ** 2) / (2 * Math.abs(sagitta));
    return polygon("arc", northThrough(w, d, (north) => Array.from({ length: 31 }, (_, index) => {
      const x = -w / 2 + (w * (index + 1)) / 32, rise = Math.sqrt(radius * radius - x * x) - (radius - Math.abs(sagitta));
      return { x, z: north - Math.sign(sagitta) * rise };
    })));
  },
  overshoot: (w, d) => {
    const north = -d / 2, double = chance(0.5), past = between(0.005, 0.3);
    const corner = () => ({ x: w / 2, z: north });
    return polygon(double ? "double overshoot" : "overshoot", northThrough(w, d, () => [{ x: w / 2 + past, z: north }, corner(),
      ...(double ? [{ x: w / 2, z: north - between(0.005, 0.3) }] : [])], double ? corner() : undefined));
  },
  spike: (w, d) => {
    const at = between(-0.4, 0.4) * w, length = between(0.03, 0.8) * (chance(0.5) ? 1 : -1), width = chance(0.5) ? 0 : between(0.01, 0.4);
    return polygon(width ? "stub" : "spike", northThrough(w, d, (north) => [{ x: at, z: north }, { x: at, z: north + length },
      ...(width ? [{ x: at + width, z: north + length }] : []), { x: at + width, z: north }]));
  },
  wedge: (w) => {
    const half = (between(2.5, 12.5) * Math.PI) / 180;
    return polygon("thin wedge", [{ x: -w / 2, z: 0 }, { x: w / 2, z: -w * Math.tan(half) }, { x: w / 2, z: w * Math.tan(half) }]);
  },
  chamfer: (w, d) => polygon("chamfer", northThrough(w, d, (north) => [{ x: w / 2 - between(0.001, 0.03), z: north }], { x: w / 2, z: -d / 2 + between(0.001, 0.03) })),
  // A room its walls fill (narrower than they are thick): no exposed face, so furniture's rule, as on the line.
  "too small": () => polygon("too small", box(between(0.05, 0.2), between(0.05, 0.2))),
  // A straight north wall drawn in two pieces, with a door on one (makeRoom): one face, the door kept clear of.
  "two-piece wall": (w, d) => polygon("two-piece wall", northThrough(w, d, (north) => [{ x: between(-0.35, 0.35) * w, z: north }])),
  jog: (w, d) => {
    const at = between(-0.4, 0.4) * w, step = between(0.001, 0.03) * (chance(0.5) ? 1 : -1);
    return polygon("jog", northThrough(w, d, (north) => [{ x: at, z: north }, { x: at, z: north + step }], { x: w / 2, z: -d / 2 + step }));
  },
};

function panel() {
  return { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf" as const, boardThicknessMm: pick([6, 9, 12, 18]), fixing: pick(["glued", "battens"] as const) } };
}

/** A column: free-standing, or (in a rectangle) against a wall's face or in a corner, touching both faces. */
function column(shape: Shape, width: number, depth: number, thickness: number): P[] | null {
  const size = between(0.15, 0.4), [faceX, faceZ] = [width / 2 - thickness / 2, depth / 2 - thickness / 2];
  const square = (x: number, z: number) => box(size, size).map((point) => ({ x: point.x + x + size / 2, z: point.z + z + size / 2 }));
  if (chance(0.1)) return square(between(-0.25, 0.25) * width, between(-0.25, 0.25) * depth);
  if (!shape.family.endsWith("rectangle") || !chance(0.2)) return null;
  if (chance(0.5)) return square(chance(0.5) ? -faceX : faceX - size, chance(0.5) ? -faceZ : faceZ - size);
  return chance(0.5) ? square(between(-faceX, faceX - size), chance(0.5) ? -faceZ : faceZ - size) : square(chance(0.5) ? -faceX : faceX - size, between(-faceZ, faceZ - size));
}

function makeRoom(index: number): { room: RoomSnapshot; family: string; openings: RoomOpening2D[] } {
  const shape = pick(Object.values(SHAPES))(between(1.2, 6), between(1.2, 5));
  const thickness = pick([0.08, 0.1, 0.12, 0.15, 0.2, 0.25]);
  const unturned = shape.points ?? box(shape.w, shape.d);
  const width = Math.max(...unturned.map((point) => point.x)) - Math.min(...unturned.map((point) => point.x));
  const depth = Math.max(...unturned.map((point) => point.z)) - Math.min(...unturned.map((point) => point.z));
  const hole = column(shape, width, depth, thickness);
  const angle = shape.points && shape.family !== "two-piece wall" && chance(0.3) ? between(0, Math.PI * 2) : 0;
  const turn = (points: P[]) => points.map(({ x, z }) => ({ x: x * Math.cos(angle) - z * Math.sin(angle), z: x * Math.sin(angle) + z * Math.cos(angle) }));
  let points = shape.points && turn(shape.points);
  if (points && chance(0.5)) points = [...points].reverse();
  const xs = points?.map((point) => point.x) ?? [-shape.w / 2, shape.w / 2], zs = points?.map((point) => point.z) ?? [-shape.d / 2, shape.d / 2];
  const geometry = { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), wallThickness: thickness, height: 2.6, slabThickness: 0.1 };
  const room: RoomSnapshot = { ...createRoom(`oracle-${index}`, `Oracle ${index}`, "kitchen", geometry), planShape: shape.planShape, planPolygon: points };
  room.geometry.baseboardDepth = chance(0.3) ? pick([0.01, 0.015, 0.02]) : undefined;
  const faceIds = getRoomWallFaceIds({ shape: shape.planShape, polygon: points });
  const panelled = faceIds.filter(() => chance(0.25));
  if (shape.family === "arc") panelled.push(pick(faceIds.slice(1, 32)));
  room.surfaces = { walls: { default: { paintColorHex: "#ffffff" }, faces: Object.fromEntries(panelled.map((faceId) => [faceId, panel()])) } };
  if (hole) room.planHoles = [turn(hole)];
  const door = (wall: RoomOpening2D["wall"], kind: RoomOpening2D["kind"], offsetMm: number): RoomOpening2D =>
    ({ id: `door-${index}`, roomId: room.id, wall, kind, offsetMm, widthMm: between(600, 1000), heightMm: kind === "door" ? 2100 : 1200, bottomMm: kind === "door" ? 0 : 900 });
  const split = shape.points?.[1].x ?? 0;
  const openings = shape.family === "two-piece wall"
    ? [door("north", "door", 1000 * (chance(0.5) ? between(-width / 2 + 0.6, split - 0.5) : between(split + 0.5, width / 2 - 0.6)))]
    : chance(0.25) ? [door(pick(["north", "east", "south", "west"] as const), pick(["door", "window"] as const), between(-800, 800))] : [];
  return { room, family: shape.family, openings };
}

/** The room's doors and windows where they are drawn, on the walls' centre line, from the room's own openings (not Fit's). */
function doorsOf(room: RoomSnapshot, openings: RoomOpening2D[]): Array<{ a: P; b: P; bottomMm: number; topMm: number }> {
  const drawn = openings.map((opening) => ({ ...opening, heightMm: opening.heightMm ?? 2100, bottomMm: opening.kind === "window" ? opening.bottomMm ?? 900 : 0 }));
  const span = (bottomMm: number, heightMm: number) => ({ bottomMm, topMm: bottomMm + heightMm });
  if ((room.planShape ?? "rectangle") === "rectangle") {
    const [w, d] = [room.geometry.width, room.geometry.depth];
    return drawn.map((opening) => {
      const [from, to] = [(opening.offsetMm - opening.widthMm / 2) / 1000, (opening.offsetMm + opening.widthMm / 2) / 1000];
      const line = { north: -d / 2, south: d / 2, west: -w / 2, east: w / 2 }[opening.wall];
      const [a, b] = opening.wall === "north" || opening.wall === "south" ? [{ x: from, z: line }, { x: to, z: line }] : [{ x: line, z: from }, { x: line, z: to }];
      return { a, b, ...span(opening.bottomMm, opening.heightMm) };
    });
  }
  const outline = getRoomPlanOutlinePoints({ shape: room.planShape ?? "rectangle", polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth });
  return mapCabinetCardinalOpeningsToPolygonWalls({ polygon: outline, openings: drawn }).map((opening) => {
    const index = Number(opening.wallId.replace("wall-", "")), start = outline[index], end = outline[(index + 1) % outline.length];
    const length = Math.hypot(end.x - start.x, end.z - start.z), along = (mm: number) => 0.5 + mm / 1000 / length;
    const at = (t: number) => ({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t });
    return { a: at(along(opening.offsetMm - opening.widthMm / 2)), b: at(along(opening.offsetMm + opening.widthMm / 2)), ...span(opening.bottomMm ?? 0, opening.heightMm ?? 2100) };
  });
}

// --- A run's frame and brute-force checks ------------------------------------------------------------------------------------
/** True when the footprint, `shrink` in from its sides, stands in the region: its outline every 2 mm, its middle every 50 mm. */
function footprintInRegion(region: Region, run: Run, shrink: number): boolean {
  const halfWidth = run.width / 2 - shrink, halfDepth = run.depth / 2 - shrink;
  const samples: P[] = [];
  for (const [from, to] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    const length = Math.hypot((to[0] - from[0]) * halfWidth, (to[1] - from[1]) * halfDepth), steps = Math.max(1, Math.ceil(length / 0.002));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      samples.push(toWorld(run, (from[0] + (to[0] - from[0]) * t) * halfWidth, (from[1] + (to[1] - from[1]) * t) * halfDepth));
    }
  }
  for (let a = -halfWidth; a <= halfWidth; a += 0.05) for (let b = -halfDepth; b <= halfDepth; b += 0.05) samples.push(toWorld(run, a, b));
  if (!samples.every((sample) => inRegion(region, sample))) return false;
  // Every corner of the outline, a wall band, a panel or a column stays out of it.
  return !region.vertices.some((point) => {
    const [a, b] = toRun(run, 0, point);
    return Math.abs(a) < halfWidth - EPS && Math.abs(b - run.depth / 2) < halfDepth - EPS;
  });
}

// --- The checks -------------------------------------------------------------------------------------------------------------
const failures: string[] = [];
const counts = { rooms: 0, furnitureRule: 0, filled: 0, runs: 0, cut: 0, filling: 0, nudges: 0, kept: 0, stopped: 0, furnitureOnly: 0 } as Record<string, number>;
const families: Record<string, number> = {};
function check(condition: boolean, message: () => string) {
  if (!condition && failures.length < 40) failures.push(message());
}

function fitRun(space: CabinetHostSpace, preset: "base" | "wall"): { definition: CabinetDefinition; host: CabinetHostSpace } | null {
  const host = preset === "wall" ? { ...space, mountingHeightMm: 1450 } : space;
  const fitted = fitCabinetToSpace(createCabinetPreset(preset, `oracle-${space.id}`), host, { mode: "fit_width" });
  return fitted.ok ? { definition: fitted.definition, host } : null;
}

/**
 * Does the run's face end between `from` and `to` along it: is any of it with no solid just behind it (0.005 mm, as the 3D
 * view's bands are drawn to 0.001 mm and their union leaves corners a few thousandths off) or out of the room; or does a solid
 * stand on it there (the next wall at a corner, or at a bend however slight) with the face not exposed again past `to` along
 * its wall's edge, `own` (a low bump on it, which a run on a baseboard stands over)? Behind it, exact: tested between each place a solid's edge crosses that
 * line, past slivers under 0.01 mm where two solids meet behind it; past `to`, every 0.1 mm for 20 mm, then every 1 mm (past
 * a column standing on it) until its cover ends.
 */
function faceBreaks(region: Region, run: Run, back: number, from: number, to: number, own: [number, number]): boolean {
  const level = 0.000005, [low, high] = [Math.min(from, to), Math.max(from, to)];
  const at = (along: number, across: number) => toWorld(run, along, -run.depth / 2 - back + across);
  const bare = (along: number) => inRegion(region, at(along, -level)) || !insideRing(at(along, -level), region.outline);
  const rings = [region.outline, ...region.bands.flatMap((band) => [band.outer, ...band.holes]), ...region.others];
  const cuts = rings.flatMap((ring) => ring.flatMap((point, index) => {
    const [p, q] = [toRun(run, back, point), toRun(run, back, ring[(index + 1) % ring.length])];
    if ((p[1] + level) * (q[1] + level) > 0 || p[1] === q[1]) return [];
    const along = p[0] + ((q[0] - p[0]) * (-level - p[1])) / (q[1] - p[1]);
    return along > low && along < high ? [along] : [];
  }));
  const stops = [low, ...cuts.sort((a, b) => a - b), high];
  if (bare(to) || stops.slice(1).some((stop, index) => stop - stops[index] > 0.00001 && bare((stops[index] + stop) / 2))) return true;
  const standing = edgesItMeets(region, run, back, true, 0);
  if (!(distanceToBox(standing, [low, high, 0, 0]) <= 0.000002)) return false;
  for (let beyond = 0.0001; beyond < 1; beyond += beyond < 0.02 ? 0.0001 : 0.001) {
    const along = to + Math.sign(to - from) * beyond;
    if (bare(along)) return true;
    if (along >= own[0] && along <= own[1] && inRegion(region, at(along, level)) && distanceToBox(standing, [along, along, 0, 0]) > 0.00001) return false;
  }
  return true;
}

/** Where the run's wall runs along it: the outline's edges nearest behind its face and parallel to it (one, or a straight wall's pieces). */
function ownEdgeAlong(region: Region, run: Run, back: number): [number, number] {
  const edges = region.outline.map((point, index) => [toRun(run, back, point), toRun(run, back, region.outline[(index + 1) % region.outline.length])] as const)
    .filter(([p, q]) => Math.abs(p[1] - q[1]) < 1e-6 && p[1] < 0);
  const nearest = Math.max(...edges.map(([p]) => p[1])), ends = edges.filter(([p]) => p[1] > nearest - 1e-6).flatMap(([p, q]) => [p[0], q[0]]);
  return ends.length ? [Math.min(...ends), Math.max(...ends)] : [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
}

/**
 * Does the run end where it should at its `side` end: `gap` (±0.5 mm) from the nearest solid in front of its back that its
 * end meets (or a corner of one just past its front), or from its face's end, or at a door's edge; and nearer to none?
 */
function endsRight(
  region: Region, edges: ReturnType<typeof edgesItMeets>, run: Run, back: number, gap: number, side: -1 | 1, atOpening: boolean, tolerance: number
): boolean {
  const own = ownEdgeAlong(region, run, back);
  const end = (side * run.width) / 2, box: [number, number, number, number] = [end, end, back, back + run.depth];
  const nearest = distanceToBox(edges, box);
  const faceEndsBy = (reach: number) => faceBreaks(region, run, back, end, end + side * reach, own);
  const [short, long] = [gap - tolerance, gap + tolerance];
  if (process.env.ORACLE_ONLY) console.log(`  end ${side}: nearest ${(nearest * 1000).toFixed(3)} mm, face ends by ${(short * 1000).toFixed(2)}: ${faceEndsBy(short)}, by ${(long * 1000).toFixed(2)}: ${faceEndsBy(long)}, opening ${atOpening}`);
  if (nearest < short || faceEndsBy(short)) return false;
  // It keeps its allowance from all of a solid it meets, so it may end that far from a corner of it just past its front.
  return atOpening || nearest <= long || faceEndsBy(long) || distanceToBox(edgesItMeets(region, run, back, true), box) <= long;
}

/** The doors and windows on the run's wall (behind its back, along it) that block its height, as stretches along the run. */
function doorsOnRunWall(room: RoomSnapshot, openings: RoomOpening2D[], run: Run, back: number, bottomMm: number, topMm: number): Array<[number, number]> {
  return doorsOf(room, openings).flatMap((door) => {
    const [a, b] = [toRun(run, back, door.a), toRun(run, back, door.b)];
    const onWall = Math.abs(a[1] - b[1]) < 1e-6 && a[1] < 0 && a[1] > -(back + (room.geometry.wallThickness ?? 0.12) / 2 + 0.05);
    return onWall && door.bottomMm < topMm && door.topMm > bottomMm ? [[Math.min(a[0], b[0]), Math.max(a[0], b[0])] as [number, number]] : [];
  });
}

function checkRun(region: Region, room: RoomSnapshot, space: CabinetHostSpace, openings: RoomOpening2D[], preset: "base" | "wall", label: string) {
  const fitted = fitRun(space, preset);
  if (!fitted) return;
  counts.runs += 1;
  const { definition } = fitted;
  const at = getCabinetFitPlacement(definition, room.geometry.width, room.geometry.depth);
  const placed = getCabinetPlacement(definition, room);
  if (!at) return check(false, () => `${label}: no placement`);
  const run: Run = { x: placed.position[0], z: placed.position[2], width: definition.totalWidth / 1000, depth: definition.depth / 1000, rotationY: placed.rotationY };
  const what = () => `${label} ${space.wallId} ${preset} (${run.width.toFixed(3)} × ${run.depth.toFixed(3)})`;
  check(Math.hypot(run.x - at.position[0], run.z - at.position[2]) < 1e-5, () => `${what()}: moved from where Fit put it`);
  check(getCabinetOverallDepth(definition) === definition.depth && getCabinetOverallWidth(definition) === definition.totalWidth, () => `${what()}: overall size differs`);
  const inside = footprintInRegion(region, run, 0.0006);
  if (!inside) counts.cut += 1;
  check(inside, () => `${what()}: the 3D view's walls cut into it`);
  const back = Math.max(0, space.baseboardOffsetMm ?? 0) / 1000, floor = preset === "base";
  const gap = (10 + (floor ? Math.max(0, space.wallSegment?.startBaseboardClearanceMm ?? 0) : 0)) / 1000;
  const backs = Array.from({ length: 21 }, (_, index) => -run.width / 2 + 0.002 + ((run.width - 0.004) * index) / 20);
  check(backs.every((along) => !inRegion(region, toWorld(run, along, -run.depth / 2 - back - 0.0003))), () => `${what()}: its back isn't on a face`);
  check(isPlacementContainedInRoom({ room, position: placed.position, rotationY: run.rotationY, dimensions: { w: definition.totalWidth, d: definition.depth, h: 870 }, builtIn: true }), () => `${what()}: not contained`);
  const edges = edgesItMeets(region, run, back);
  const clearance = distanceToBox(edges, [-run.width / 2, run.width / 2, back, back + run.depth]);
  // 0.5 mm, and more where a wall it meets is all but parallel to its face (a bend of hundredths of a degree): the 3D view draws
  // it to 0.001 mm across, so where it crosses the face is that over its slope along.
  const slopes = edges.filter(([p, q]) => Math.min(Math.abs(p[0]), Math.abs(q[0])) < run.width / 2 + 0.03)
    .map(([p, q]) => Math.abs(q[1] - p[1]) / Math.max(1e-12, Math.abs(q[0] - p[0])));
  const tolerance = 0.0005 + Math.min(0.005, Math.max(0, ...slopes.map((slope) => 0.000002 / Math.max(1e-9, slope) - 0.0005)));
  check(clearance >= gap - tolerance, () => `${what()}: ${(clearance * 1000).toFixed(3)} mm from a wall it meets along its face, under ${((gap - tolerance) * 1000).toFixed(2)} mm`);
  const bottomMm = preset === "wall" ? 1450 : 0, doors = doorsOnRunWall(room, openings, run, back, bottomMm, bottomMm + definition.height);
  check(doors.every(([from, to]) => to <= -run.width / 2 + 0.0005 || from >= run.width / 2 - 0.0005), () => `${what()}: it stands in front of a door or window`);
  const segment = definition.fitState?.segment;
  if (segment && Math.abs(segment.widthMm - definition.totalWidth) <= 1) {
    counts.filling += 1;
    for (const side of [-1, 1] as const) {
      const end = (side * run.width) / 2, atDoor = doors.some(([from, to]) => Math.abs(from - end) < 0.0005 || Math.abs(to - end) < 0.0005);
      check(endsRight(region, edges, run, back, gap, side, atDoor, tolerance), () => `${what()}: its ${side < 0 ? "start" : "end"} is more than ${((gap + tolerance) * 1000).toFixed(2)} mm from what it meets`);
    }
  }
  checkNudges(region, room, run, what);
}

function checkNudges(region: Region, room: RoomSnapshot, run: Run, what: () => string) {
  const along = { x: Math.cos(run.rotationY), z: -Math.sin(run.rotationY) }, out = { x: Math.sin(run.rotationY), z: Math.cos(run.rotationY) };
  for (const [name, dx, dz] of [["along", along.x, along.z], ["back along", -along.x, -along.z], ["into the wall", -out.x, -out.z], ["out", out.x, out.z]] as const) {
    counts.nudges += 1;
    const target = { ...run, x: run.x + dx * 0.01, z: run.z + dz * 0.01 };
    const [x, z] = clampBuiltInToRoom(room, target.x, target.z, run.width, run.depth, run.rotationY, { from: [run.x, run.z] });
    // Furniture of its size may stand there (inside furniture's room, half the wall plus 2 cm in, by its own samples).
    const furnitureFits = isPlacementContainedInRoom({ room, position: [target.x, 0, target.z], rotationY: run.rotationY, dimensions: { w: run.width * 1000, d: run.depth * 1000, h: 870 } });
    const moved = (x - run.x) * dx + (z - run.z) * dz, sideways = Math.abs((x - run.x) * dz - (z - run.z) * dx);
    // The clamp lets a run reach 0.05 mm into a face: kept when it fits 0.04 mm in, stopped when not even 0.06 mm in.
    const fits = footprintInRegion(region, target, 0.00004);
    if (!fits && footprintInRegion(region, target, 0.00006)) continue;
    if (fits) {
      counts.kept += 1;
      check(Math.abs(x - target.x) < 1e-9 && Math.abs(z - target.z) < 1e-9, () => `${what()}: a 10 mm nudge ${name} is refused or cut short (moved ${(moved * 1000).toFixed(3)} mm)`);
      continue;
    }
    if (furnitureFits) counts.furnitureOnly += 1;
    counts.stopped += 1;
    const further = { ...run, x: x + dx * 0.0002, z: z + dz * 0.0002 };
    check(moved >= -1e-9 && moved <= 0.01 + 1e-9 && sideways < 1e-9, () => `${what()}: a nudge ${name} went off its line`);
    // Short of the face if it would fit 0.2 mm on even 0.04 mm in (along an edge it slides past, 0.06 mm in may not tell).
    check(!footprintInRegion(region, further, 0.00004), () => `${what()}: a nudge ${name} stopped ${(moved * 1000).toFixed(3)} mm, short of the face`);
      check(isPlacementContainedInRoom({ room, position: [x, 0, z], rotationY: run.rotationY, dimensions: { w: run.width * 1000, d: run.depth * 1000, h: 870 }, builtIn: true }), () => `${what()}: a nudge ${name} stopped where it isn't contained (moved ${(moved * 1000).toFixed(4)} mm, region ${footprintInRegion(region, { ...run, x, z }, 0.0005)})`);
  }
}

/** Fit's hosts for a room on the line (0197c5c4, useDesignPageCabinetry.ts buildCabinetryAvailableSpaces), as it had them. */
function lineHostsOf(room: RoomSnapshot, openings: RoomOpening2D[]): CabinetHostSpace[] {
  const wallInsetMm = Math.round((room.geometry.wallThickness ?? 0.12) * 1000), depths = getRoomWallFinishDepths(room);
  const panelMm = (faceId: string) => Math.round((depths[faceId] ?? 0) * 1000);
  const shared = { roomId: room.id, roomName: room.name, roomType: room.roomType === "balcony" ? "custom" as const : room.roomType, heightMm: Math.round((room.geometry.height ?? 2.6) * 1000), baseboardOffsetMm: Math.max(0, Math.round((room.geometry.baseboardDepth ?? 0) * 1000)) };
  const roomOpenings = openings.filter((opening) => opening.roomId === room.id).map((opening) => ({ id: opening.id, wall: opening.wall, kind: opening.kind, offsetMm: opening.offsetMm, widthMm: opening.widthMm,
    heightMm: opening.heightMm ?? 2100, bottomMm: opening.kind === "window" ? opening.bottomMm ?? 900 : 0, label: opening.kind === "door" ? "Door" : "Window" }));
  const planShape = room.planShape ?? "rectangle";
  if (planShape !== "rectangle") {
    const polygon = getRoomPlanOutlinePoints(getRoomOutlineInsideFinishes({ shape: planShape, polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth }, depths));
    return createCabinetPolygonWallSpaces({ ...shared, polygon, openings: mapCabinetCardinalOpeningsToPolygonWalls({ polygon, openings: roomOpenings }), installationClearanceSideMm: wallInsetMm + 10 });
  }
  return createCabinetRoomWallSpaces({ ...shared, openings: roomOpenings,
    widthMm: Math.max(1, Math.round(room.geometry.width * 1000) - wallInsetMm * 2 - panelMm("west") - panelMm("east")),
    depthMm: Math.max(1, Math.round(room.geometry.depth * 1000) - wallInsetMm * 2 - panelMm("north") - panelMm("south")) });
}

/** A room with no exposed face: hosts, clamp, snap and containment exactly as on the line (furniture's, for built-ins). */
function checkFurnitureRule(room: RoomSnapshot, openings: RoomOpening2D[], label: string) {
  counts.furnitureRule += 1;
  const line = { ...room, floorElevationMm: 0 };
  const hosts = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: openings });
  check(JSON.stringify(hosts) === JSON.stringify(lineHostsOf(room, openings)), () => `${label}: hosts differ from the line's`);
  for (let sample = 0; sample < 4; sample += 1) {
    const [x, z, width, depth, rotationY] = [between(-1, 1) * room.geometry.width, between(-1, 1) * room.geometry.depth, between(0.2, 1.2), between(0.2, 0.7), between(0, 6.3)];
    check(JSON.stringify(clampBuiltInToRoom(room, x, z, width, depth, rotationY, { from: [0, 0] })) === JSON.stringify(clampToPlacementRoom(room, x, z, width, depth, rotationY)), () => `${label}: clamp differs from furniture's`);
    check(JSON.stringify(getBuiltInSnapTarget(room, [x, 0, z], width, depth, rotationY)) === JSON.stringify(getBuiltInSnapTarget(line, [x, 0, z], width, depth, rotationY)), () => `${label}: snap differs from the line's`);
    const contained = (builtIn: boolean) => isPlacementContainedInRoom({ room, position: [x, 0, z], rotationY, dimensions: { w: width * 1000, d: depth * 1000, h: 870 }, builtIn });
    check(contained(true) === contained(false), () => `${label}: containment differs from furniture's`);
  }
}

const started = Date.now();
for (let index = 0; index < ROOMS; index += 1) {
  if (process.env.ORACLE_ONLY && Number(process.env.ORACLE_ONLY) !== index) continue;
  state = (SEED ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0; // Each room from its own seed, so one can be rerun alone.
  const { room, family, openings } = makeRoom(index);
  counts.rooms += 1;
  families[family] = (families[family] ?? 0) + 1;
  const label = `room ${index} (${family}, seed ${SEED})`;
  if (process.env.ORACLE_ONLY) console.log(JSON.stringify({ shape: room.planShape, polygon: room.planPolygon, geometry: room.geometry, faces: room.surfaces?.walls?.faces, holes: room.planHoles, openings }));
  if (usesFurnitureRuleForBuiltIns(room)) {
    checkFurnitureRule(room, openings, label);
    continue;
  }
  const region = regionOf(room);
  if (region.filled) {
    counts.filled += 1; // The 3D view's wall union came out without the room in it: nothing to check against.
    continue;
  }
  const spaces = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: openings });
  const chosen = spaces.filter(() => chance(3 / Math.max(3, spaces.length)));
  chosen.forEach((space) => checkRun(region, room, space, openings, chance(0.75) ? "base" : "wall", label));
}

console.log(`Built-in faces oracle: ${counts.rooms} rooms (${Object.entries(families).map(([family, count]) => `${family} ${count}`).join(", ")}),`,
  `${counts.furnitureRule} on furniture's rule, ${counts.filled} whose 3D wall union came out without the room; ${counts.runs} runs (${counts.cut} cut by the 3D view's walls, ${counts.filling} filling their stretch), ${counts.nudges} nudges`,
  `(${counts.kept} kept, ${counts.stopped} stopped at the face, ${counts.furnitureOnly} of them where furniture's samples would let it on); seed ${SEED}, ${((Date.now() - started) / 1000).toFixed(1)} s.`);
assert.deepEqual(failures, [], `the oracle found ${failures.length}${failures.length >= 40 ? "+" : ""} failures`);
console.log("Built-in faces oracle tests passed.");
