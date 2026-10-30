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
  distanceToBox, EPS, inFrontOfFace, inRegion, insideRing, regionOf, solidsOf, toWorld, type P, type Region, type Run, type Wall,
} from "./built-in-faces-oracle-utils";

/**
 * A seeded randomized oracle for where built-ins stand (lib/room-built-in-region.ts; J, 29 Oct 2026: "Face, back flush").
 * Thousands of drawn rooms — rectangles, L's, bends 0–20° both ways, 32-segment arcs with a panelled segment, overshoots and
 * double overshoots, spikes and stubs in and out, thin wedges, tiny chamfers and jogs, rooms their walls fill, both windings,
 * random walls, panels, baseboards, columns and doors — are checked against the region as defined, point by point: inside the outline, outside
 * every wall's band (centre line to face) and corner, outside the columns. Each fitted, placed run must stand in it with its
 * back on a face, end 10 mm (and a floor run's baseboard) ±0.5 mm from what it meets, a door or the face's end, and keep
 * nudges of 10 mm along and into its wall or stop them at the face, never refusing one furniture of its size would make.
 * A room with no exposed face must behave exactly as on the line (furniture's rule). ORACLE_SEED / ORACLE_ROOMS vary it.
 */

const SEED = Number(process.env.ORACLE_SEED ?? 20261031);
const ROOMS = Number(process.env.ORACLE_ROOMS ?? 2400);
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
  jog: (w, d) => {
    const at = between(-0.4, 0.4) * w, step = between(0.001, 0.03) * (chance(0.5) ? 1 : -1);
    return polygon("jog", northThrough(w, d, (north) => [{ x: at, z: north }, { x: at, z: north + step }], { x: w / 2, z: -d / 2 + step }));
  },
};

function panel() {
  return { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf" as const, boardThicknessMm: pick([6, 9, 12, 18]), fixing: pick(["glued", "battens"] as const) } };
}

function makeRoom(index: number): { room: RoomSnapshot; family: string; openings: RoomOpening2D[] } {
  const shape = pick(Object.values(SHAPES))(between(1.2, 6), between(1.2, 5));
  let points = shape.points;
  if (points && chance(0.3)) {
    const angle = between(0, Math.PI * 2);
    points = points.map(({ x, z }) => ({ x: x * Math.cos(angle) - z * Math.sin(angle), z: x * Math.sin(angle) + z * Math.cos(angle) }));
  }
  if (points && chance(0.5)) points = [...points].reverse();
  const xs = points?.map((point) => point.x) ?? [-shape.w / 2, shape.w / 2], zs = points?.map((point) => point.z) ?? [-shape.d / 2, shape.d / 2];
  const geometry = { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), wallThickness: pick([0.08, 0.1, 0.12, 0.15, 0.2, 0.25]), height: 2.6, slabThickness: 0.1 };
  const room: RoomSnapshot = { ...createRoom(`oracle-${index}`, `Oracle ${index}`, "kitchen", geometry), planShape: shape.planShape, planPolygon: points };
  room.geometry.baseboardDepth = chance(0.3) ? pick([0.01, 0.015, 0.02]) : undefined;
  const faceIds = getRoomWallFaceIds({ shape: shape.planShape, polygon: points });
  const panelled = faceIds.filter(() => chance(0.25));
  if (shape.family === "arc") panelled.push(pick(faceIds.slice(1, 32)));
  room.surfaces = { walls: { default: { paintColorHex: "#ffffff" }, faces: Object.fromEntries(panelled.map((faceId) => [faceId, panel()])) } };
  if (chance(0.1)) {
    const [cx, cz, size] = [between(-0.25, 0.25) * geometry.width, between(-0.25, 0.25) * geometry.depth, between(0.15, 0.35)];
    room.planHoles = [box(size, size).map(({ x, z }) => ({ x: x + cx, z: z + cz }))];
  }
  const openings: RoomOpening2D[] = chance(0.25)
    ? [{ id: `door-${index}`, roomId: room.id, wall: pick(["north", "east", "south", "west"] as const), kind: pick(["door", "window"] as const), offsetMm: between(-800, 800), widthMm: between(600, 1000), heightMm: 1200, bottomMm: 900 }]
    : [];
  return { room, family: shape.family, openings };
}

// --- A run's frame and brute-force checks ------------------------------------------------------------------------------------
function nearWalls(region: Region, run: Run, margin: number): Wall[] {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toWorld(run, (a * run.width) / 2, (b * run.depth) / 2));
  const [minX, maxX, minZ, maxZ] = [Math.min(...corners.map((c) => c.x)) - margin, Math.max(...corners.map((c) => c.x)) + margin, Math.min(...corners.map((c) => c.z)) - margin, Math.max(...corners.map((c) => c.z)) + margin];
  return region.walls.filter(({ bounds }) => bounds[1] > minX && bounds[0] < maxX && bounds[3] > minZ && bounds[2] < maxZ);
}

/** True when the footprint, `shrink` in from its sides, stands in the region: its outline every 2 mm, its middle every 50 mm. */
function footprintInRegion(region: Region, run: Run, shrink: number): boolean {
  const halfWidth = run.width / 2 - shrink, halfDepth = run.depth / 2 - shrink, walls = nearWalls(region, run, 0.01);
  const samples: P[] = [];
  for (const [from, to] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    const length = Math.hypot((to[0] - from[0]) * halfWidth, (to[1] - from[1]) * halfDepth), steps = Math.max(1, Math.ceil(length / 0.002));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      samples.push(toWorld(run, (from[0] + (to[0] - from[0]) * t) * halfWidth, (from[1] + (to[1] - from[1]) * t) * halfDepth));
    }
  }
  for (let a = -halfWidth; a <= halfWidth; a += 0.05) for (let b = -halfDepth; b <= halfDepth; b += 0.05) samples.push(toWorld(run, a, b));
  if (!samples.every((sample) => inRegion(region, sample, walls))) return false;
  // Every corner of the outline, a band, a wall's corner or a column stays out of it.
  const local = (point: P) => [(point.x - run.x) * Math.cos(run.rotationY) - (point.z - run.z) * Math.sin(run.rotationY), (point.x - run.x) * Math.sin(run.rotationY) + (point.z - run.z) * Math.cos(run.rotationY)];
  const vertices = [...region.outline, ...(region.solids ??= solidsOf(region)).flat()];
  return !vertices.some((point) => { const [a, b] = local(point); return Math.abs(a) < halfWidth - EPS && Math.abs(b) < halfDepth - EPS; });
}

// --- The checks -------------------------------------------------------------------------------------------------------------
const failures: string[] = [];
const counts = { rooms: 0, furnitureRule: 0, runs: 0, filling: 0, nudges: 0, kept: 0, stopped: 0, furnitureOnly: 0 } as Record<string, number>;
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
 * Does the run end where it should at its `side` end: `gap` (±0.5 mm) from the nearest solid in front of its face that its
 * end meets, or from its face's end, or at a door's edge; and nearer to none? A run standing off its face by a baseboard may
 * also end where its face goes under a solid lower than that (a jog, a slight bend), as far from it as it already stands.
 */
function endsRight(region: Region, solids: Array<Array<[number, number]>>, run: Run, back: number, gap: number, side: -1 | 1, atOpening: boolean): boolean {
  const end = (side * run.width) / 2, endSide: [number, number, number, number] = [end, end, back, back + run.depth];
  const nearest = Math.min(...solids.map((points) => distanceToBox(points, endSide)));
  const faceEndsBy = (reach: number) => {
    // As the region's faces are found: a face goes on where a solid stands within a thousandth of a mm behind it.
    const behind = toWorld(run, end + side * reach, -run.depth / 2 - back - 0.000001);
    return inRegion(region, behind) || !insideRing(behind, region.outline);
  };
  if (process.env.ORACLE_ONLY) console.log(`  end ${side}: nearest ${(nearest * 1000).toFixed(3)} mm, face ends by ${gap * 1000 - 0.5}: ${faceEndsBy(gap - 0.0005)}, by ${gap * 1000 + 0.5}: ${faceEndsBy(gap + 0.0005)}, opening ${atOpening}`);
  if (nearest < gap - 0.0005 || faceEndsBy(gap - 0.0005)) return false;
  // A run standing off its face (on a baseboard) may end where its face does under a solid lower than its back stands off.
  const faceCoveredAt = (reach: number) => !inRegion(region, toWorld(run, end + side * reach, -run.depth / 2 - back + 0.000001));
  return atOpening || nearest <= gap + 0.0005 || faceEndsBy(gap + 0.0005) || (back > 0 && faceCoveredAt(0.0005));
}

function checkRun(region: Region, room: RoomSnapshot, space: CabinetHostSpace, preset: "base" | "wall", label: string) {
  const fitted = fitRun(space, preset);
  if (!fitted) return;
  counts.runs += 1;
  const { definition, host } = fitted;
  const at = getCabinetFitPlacement(definition, room.geometry.width, room.geometry.depth);
  const placed = getCabinetPlacement(definition, room);
  if (!at) return check(false, () => `${label}: no placement`);
  const run: Run = { x: placed.position[0], z: placed.position[2], width: definition.totalWidth / 1000, depth: definition.depth / 1000, rotationY: placed.rotationY };
  const what = () => `${label} ${space.wallId} ${preset} (${run.width.toFixed(3)} × ${run.depth.toFixed(3)})`;
  check(Math.hypot(run.x - at.position[0], run.z - at.position[2]) < 1e-5, () => `${what()}: moved from where Fit put it`);
  check(getCabinetOverallDepth(definition) === definition.depth && getCabinetOverallWidth(definition) === definition.totalWidth, () => `${what()}: overall size differs`);
  check(footprintInRegion(region, run, 0.0006), () => `${what()}: not in the region`);
  const back = Math.max(0, space.baseboardOffsetMm ?? 0) / 1000, floor = preset === "base";
  const gap = (10 + (floor ? Math.max(0, space.wallSegment?.startBaseboardClearanceMm ?? 0) : 0)) / 1000;
  const backs = Array.from({ length: 21 }, (_, index) => -run.width / 2 + 0.002 + ((run.width - 0.004) * index) / 20);
  check(backs.every((along) => !inRegion(region, toWorld(run, along, -run.depth / 2 - back - 0.0003))), () => `${what()}: its back isn't on a face`);
  check(isPlacementContainedInRoom({ room, position: placed.position, rotationY: run.rotationY, dimensions: { w: definition.totalWidth, d: definition.depth, h: 870 }, builtIn: true }), () => `${what()}: not contained`);
  const solids = solidsOf(region).map((solid) => inFrontOfFace(run, back, solid));
  const clearance = Math.min(...solids.map((points) => distanceToBox(points, [-run.width / 2, run.width / 2, back, back + run.depth])));
  check(clearance >= gap - 0.0005, () => `${what()}: ${(clearance * 1000).toFixed(3)} mm from a wall, under ${gap * 1000 - 0.5} mm`);
  const segment = definition.fitState?.segment;
  if (segment && Math.abs(segment.widthMm - definition.totalWidth) <= 1) {
    counts.filling += 1;
    const edges = host.openings.flatMap((opening) => [opening.offsetMm - opening.widthMm / 2, opening.offsetMm + opening.widthMm / 2]);
    const wall = space.wallSegment, way = wall ? Math.sign((wall.endXmm - wall.startXmm) * Math.cos(run.rotationY) - (wall.endZmm - wall.startZmm) * Math.sin(run.rotationY)) : 1;
    for (const side of [-1, 1] as const) {
      const end = side * way < 0 ? segment.startMm : segment.endMm;
      check(endsRight(region, solids, run, back, gap, side, edges.some((edge) => Math.abs(edge - end) < 0.5)), () => `${what()}: its ${side < 0 ? "start" : "end"} is more than ${gap * 1000 + 0.5} mm from what it meets`);
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
    check(!footprintInRegion(region, further, 0.00006), () => `${what()}: a nudge ${name} stopped ${(moved * 1000).toFixed(3)} mm, short of the face`);
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
  const spaces = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: openings });
  const chosen = spaces.filter(() => chance(3 / Math.max(3, spaces.length)));
  chosen.forEach((space) => checkRun(region, room, space, chance(0.75) ? "base" : "wall", label));
}

console.log(`Built-in faces oracle: ${counts.rooms} rooms (${Object.entries(families).map(([family, count]) => `${family} ${count}`).join(", ")}),`,
  `${counts.furnitureRule} on furniture's rule; ${counts.runs} runs (${counts.filling} filling their stretch), ${counts.nudges} nudges`,
  `(${counts.kept} kept, ${counts.stopped} stopped at the face, ${counts.furnitureOnly} of them where furniture's samples would let it on); seed ${SEED}, ${((Date.now() - started) / 1000).toFixed(1)} s.`);
assert.deepEqual(failures, [], `the oracle found ${failures.length}${failures.length >= 40 ? "+" : ""} failures`);
console.log("Built-in faces oracle tests passed.");
