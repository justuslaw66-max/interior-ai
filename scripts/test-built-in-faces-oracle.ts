import assert from "node:assert/strict";

import {
  createCabinetPolygonWallSpaces,
  createCabinetRoomWallSpaces,
  fitCabinetToSpace,
  getCabinetFitPlacement,
  mapCabinetCardinalOpeningsToPolygonWalls,
} from "../features/cabinetry/fitToSpace";
import { getCabinetOverallDepth, getCabinetOverallHeight, getCabinetOverallWidth } from "../features/cabinetry/layout";
import { createCabinetPreset } from "../features/cabinetry/presets";
import { buildCabinetryAvailableSpaces, getCabinetPlacement } from "../features/cabinetry/roomCabinetHosts";
import type { CabinetDefinition, CabinetHostSpace } from "../features/cabinetry/types";
import type { HousePlanRoom2D } from "../lib/design-page-house-plan";
import { validateDesignPageOpeningPlacement } from "../lib/design-page-opening-placement";
import { mapPlanOpeningsToRoomRenderer } from "../lib/design-page-plan-overlays";
import type { RoomOpening2D } from "../lib/editorScene";
import { clampBuiltInToRoom, getBuiltInSnapTarget, usesFurnitureRuleForBuiltIns } from "../lib/room-built-in-faces";
import { getRoomOutlineInsideFinishes, getRoomPlanOutlinePoints } from "../lib/room-finished-outline";
import { createRoom, type RoomSnapshot } from "../lib/room-types";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "../lib/room-wall-finish-depths";
import { isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";
import {
  distanceToBox, edgesItMeets, EPS, exposedOnLine, inRegion, regionOf, toPlanRoom, toRun, toWorld, type LineFrame, type P, type Region, type Run,
} from "./built-in-faces-oracle-utils";

/**
 * A seeded randomized oracle for where built-ins stand (lib/room-built-in-region.ts; J, 29 Oct 2026: "Face, back flush").
 * Random drawn rooms — rectangles, L's, bends 0–20° both ways, 32-segment arcs with a panelled segment, overshoots and double
 * overshoots, spikes and stubs in and out, thin wedges, tiny chamfers and jogs, straight walls drawn in two pieces with a door,
 * rooms their walls fill, both windings — with random walls, panels, baseboards, doors the plan would place, and
 * columns free, against a drawn edge or a rectangle's wall, or in a corner, and in a quarter of them rooms next door along one
 * or two edges (walls of another thickness, sharing all, part or more of the edge or standing just off it, with a door of their
 * own on the shared wall), are checked against the room as the 3D view draws it (scripts/built-in-faces-oracle-utils.ts): the
 * wall bands of it and the rooms next door, its panel boxes, and the doors where the plan draws them. Every exposed face must
 * be offered as a host (along a wall a thicker one next door runs along, at the depth exposed along more of it), and every
 * host be an exposed face. On every host, a base and a wall cabinet, fitted and placed, must stand clear of the walls with its
 * back on a face (a base unit's on the baseboard), clear of every door on its wall, end 10 mm (and a floor run's baseboard)
 * ±0.5 mm from what it meets along its face, a door or where its face ends (more along a wall all but parallel to its face),
 * and keep nudges of 10 mm along and into its wall or stop them at the face; where Fit refuses, no run as narrow as Fit makes
 * may stand anywhere along the host. A room with no exposed face must have the line's hosts, snap and containment. CI runs 150 rooms (about 11 s); ORACLE_FULL=1 runs 2,400 (about 3
 * min), ORACLE_ROOMS any number, ORACLE_SEED another seed, ORACLE_ONLY one room.
 */

const SEED = Number(process.env.ORACLE_SEED ?? 20261031);
const ROOMS = Number(process.env.ORACLE_ROOMS ?? (process.env.ORACLE_FULL ? 2400 : 150));
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

/**
 * A column: free-standing; in a drawn shape, against a random edge's face (on it or up to 30 mm off it), at one of its ends or
 * along it, turned with it; or in a rectangle, against a wall's face or in a corner, touching both faces.
 */
function column(shape: Shape, width: number, depth: number, thickness: number): P[] | null {
  const size = between(0.15, 0.4), [faceX, faceZ] = [width / 2 - thickness / 2, depth / 2 - thickness / 2];
  const square = (x: number, z: number) => box(size, size).map((point) => ({ x: point.x + x + size / 2, z: point.z + z + size / 2 }));
  if (chance(0.1)) return square(between(-0.25, 0.25) * width, between(-0.25, 0.25) * depth);
  if (shape.points && chance(0.2)) return columnOnEdge(shape.points, thickness);
  if (!shape.family.endsWith("rectangle") || !chance(0.2)) return null;
  if (chance(0.5)) return square(chance(0.5) ? -faceX : faceX - size, chance(0.5) ? -faceZ : faceZ - size);
  return chance(0.5) ? square(between(-faceX, faceX - size), chance(0.5) ? -faceZ : faceZ - size) : square(chance(0.5) ? -faceX : faceX - size, between(-faceZ, faceZ - size));
}

function columnOnEdge(points: P[], thickness: number): P[] | null {
  const sign = points.reduce((sum, point, index) => sum + point.x * points[(index + 1) % points.length].z - points[(index + 1) % points.length].x * point.z, 0) >= 0 ? 1 : -1;
  const index = Math.floor(random() * points.length), a = points[index], b = points[(index + 1) % points.length], length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 0.5) return null;
  const [dx, dz] = [(b.x - a.x) / length, (b.z - a.z) / length], [nx, nz] = [-dz * sign, dx * sign];
  const size = between(0.1, Math.min(0.4, length / 2)), off = thickness / 2 + (chance(0.5) ? 0 : between(0, 0.03));
  const along = chance(0.4) ? thickness / 2 : chance(0.5) ? length - thickness / 2 - size : between(0.1, length - size - 0.1);
  const at = (s: number, o: number) => ({ x: a.x + dx * s + nx * o, z: a.z + dz * s + nz * o });
  return [at(along, off), at(along + size, off), at(along + size, off + size), at(along, off + size)];
}

function makeRoom(index: number): { room: RoomSnapshot; family: string; openings: RoomOpening2D[]; neighbours: HousePlanRoom2D[] } {
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
  // The plan draws a cardinal door at the middle of the room's wall facing that way that holds it, plus its offset: on a
  // straight wall in two pieces, about either piece's middle (a few tries for one the plan places).
  const split = shape.points?.[1].x ?? 0;
  const tries = shape.family === "two-piece wall" ? Array.from({ length: 4 }, () => {
    const piece = chance(0.5) ? [-width / 2, split] : [split, width / 2];
    return door("north", "door", 1000 * Math.max(0, (piece[1] - piece[0]) / 2 - 0.5) * between(-1, 1));
  }) : chance(0.25) ? [door(pick(["north", "east", "south", "west"] as const), pick(["door", "window"] as const), between(-800, 800))] : [];
  const openings = tries.filter((opening) => placeable([toPlanRoom(room)], opening)).slice(0, 1);
  const next = makeNeighbours(room, index);
  return { room, family: shape.family, openings: [...openings, ...next.openings], neighbours: next.neighbours };
}

/** Would the plan place the door (validateDesignPageOpeningPlacement: on one wall, 180 mm from its corners)? Else bad input. */
function placeable(rooms: HousePlanRoom2D[], opening: RoomOpening2D): boolean {
  return validateDesignPageOpeningPlacement(opening, [], undefined, { rooms, planWidthMeters: 0, planDepthMeters: 0 }).valid;
}

/**
 * Rooms next door, in a quarter of the rooms: along one or two of its edges a metre or more long and running along x or z, a
 * room on the outside with walls of any thickness, sharing all of the edge, part of it or more, or standing up to 30 mm off
 * it; a rectangle half the time, and then half the time with a door of its own on the shared wall the plan would place. Not
 * along an angled edge: the 3D view splits a shared wall's parts along x or z only (splitWallPartsAtSharedBoundaries), so an
 * angled shared wall loses the half-thickness its ends run on (a 3D bug, not the region's to copy).
 */
function makeNeighbours(room: RoomSnapshot, index: number): { neighbours: HousePlanRoom2D[]; openings: RoomOpening2D[] } {
  if (!chance(0.25)) return { neighbours: [], openings: [] };
  const outline = getRoomPlanOutlinePoints({ shape: room.planShape ?? "rectangle", polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth });
  const sign = outline.reduce((sum, point, at) => sum + point.x * outline[(at + 1) % outline.length].z - outline[(at + 1) % outline.length].x * point.z, 0) >= 0 ? 1 : -1;
  const edges = outline.map((a, at) => ({ a, b: outline[(at + 1) % outline.length] }))
    .filter(({ a, b }) => Math.hypot(b.x - a.x, b.z - a.z) >= 1 && (Math.abs(b.x - a.x) < 1e-9 || Math.abs(b.z - a.z) < 1e-9));
  const neighbours: HousePlanRoom2D[] = [], openings: RoomOpening2D[] = [];
  for (let count = chance(0.5) ? 2 : 1; count > 0 && edges.length; count -= 1) {
    const { a, b } = edges.splice(Math.floor(random() * edges.length), 1)[0], length = Math.hypot(b.x - a.x, b.z - a.z);
    const [dx, dz] = [(b.x - a.x) / length, (b.z - a.z) / length], [ox, oz] = [dz * sign, -dx * sign]; // out of the room
    const [from, to] = pick([[0, length], [between(0, 0.4) * length, between(0.6, 1) * length], [-between(0, 0.5), length + between(0, 0.5)]]);
    const off = chance(0.2) ? between(0.001, 0.03) : 0, deep = between(1, 3);
    const at = (along: number, out: number) => ({ x: a.x + dx * along + ox * (off + out), z: a.z + dz * along + oz * (off + out) });
    const points = [at(from, 0), at(to, 0), at(to, deep), at(from, deep)];
    const xs = points.map((point) => point.x), zs = points.map((point) => point.z);
    const [x, z] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
    const rectangle = chance(0.5);
    const next: HousePlanRoom2D = {
      id: `oracle-${index}-next-${count}`, name: `Next door ${count}`, roomType: "living", x, z,
      w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), height: 2.6, wallThickness: pick([0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3]),
      ...(rectangle ? { shape: "rectangle" as const } : { shape: "custom_polygon" as const, polygon: points.map((point) => ({ x: point.x - x, z: point.z - z })) }),
    };
    neighbours.push(next);
    // Its own door on the wall it shares (not one standing off it), on the side facing the room, about that wall's middle.
    if (!rectangle || off > 0 || to - from < 1.4 || !chance(0.5)) continue;
    const wall = oz < -0.5 ? "south" : oz > 0.5 ? "north" : ox < -0.5 ? "east" : "west";
    const offsetMm = 1000 * between(-1, 1) * ((to - from) / 2 - 0.5);
    openings.push({ id: `door-${index}-next-${count}`, roomId: next.id, wall, kind: "door", offsetMm, widthMm: between(600, 900), heightMm: 2100, bottomMm: 0 });
  }
  const rooms = [toPlanRoom(room), ...neighbours];
  return { neighbours, openings: openings.filter((opening) => placeable(rooms, opening)) };
}

/**
 * The room's doors and windows where the plan and 3D view draw them (mapPlanOpeningsToRoomRenderer: each on its host wall's
 * centre line, about its centre), not where Fit maps them (mapCabinetCardinalOpeningsToPolygonWalls).
 */
function doorsOf(room: RoomSnapshot, openings: RoomOpening2D[]): Array<{ a: P; b: P; bottomMm: number; topMm: number }> {
  const drawn = mapPlanOpeningsToRoomRenderer(openings, [toPlanRoom(room), ...plan.neighbours]);
  return drawn.flatMap((opening, index) => {
    const center = opening.hostWorldCenter, tangent = opening.hostTangent, source = openings[index];
    if (opening.hostResolution?.status !== "resolved" || !center || !tangent) return [];
    const half = opening.width / 2, bottomMm = source.kind === "window" ? source.bottomMm ?? 900 : 0;
    return [{ a: { x: center.x - tangent.x * half, z: center.z - tangent.z * half }, b: { x: center.x + tangent.x * half, z: center.z + tangent.z * half },
      bottomMm, topMm: bottomMm + (source.heightMm ?? 2100) }];
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
/** The room's plan: it at the origin, and the rooms next door (set for each room). */
let plan: { neighbours: HousePlanRoom2D[]; rooms: Map<string, HousePlanRoom2D>; thickest: number } = { neighbours: [], rooms: new Map(), thickest: 0 };
const failures: string[] = [];
const counts = { rooms: 0, nextDoor: 0, furnitureRule: 0, filled: 0, faces: 0, hosts: 0, runs: 0, refused: 0, cut: 0, filling: 0, nudges: 0, kept: 0, stopped: 0, furnitureOnly: 0 } as Record<string, number>;
const families: Record<string, number> = {};
function check(condition: boolean, message: () => string) {
  if (!condition && failures.length < 40) failures.push(message());
}

function fitRun(space: CabinetHostSpace, preset: "base" | "wall"): { definition: CabinetDefinition; host: CabinetHostSpace } | null {
  const host = preset === "wall" ? { ...space, mountingHeightMm: 1450 } : space;
  const fitted = fitCabinetToSpace(createCabinetPreset(preset, `oracle-${space.id}`), host, { mode: "fit_width" });
  return fitted.ok ? { definition: fitted.definition, host } : null;
}

/** The run's face line's frame: [along the run from its middle, out from its face]. */
const runFrame = (run: Run, back: number): LineFrame => ({
  frame: (point) => toRun(run, back, point), at: (along, across) => toWorld(run, along, -run.depth / 2 - back + across),
});

/** Does the run's face, as the 3D view draws it, end anywhere between `from` and `to` along it (exposedOnLine)? */
function faceBreaks(region: Region, run: Run, back: number, from: number, to: number): boolean {
  const [low, high] = [Math.min(from, to), Math.max(from, to)];
  return !exposedOnLine(region, runFrame(run, back), low - 0.00002, high + 0.00002).some((stretch) => stretch.from <= low && stretch.to >= high);
}

/**
 * Does the run end where it should at its `side` end: `gap` (±0.5 mm) from the nearest solid in front of its back that its
 * end meets (or a corner of one just past its front), or from where its face ends (at a corner, or a solid standing on it
 * however low), or at a door's edge; and nearer to none?
 */
function endsRight(
  region: Region, edges: ReturnType<typeof edgesItMeets>, run: Run, back: number, gap: number, side: -1 | 1, atOpening: boolean, tolerance: number
): boolean {
  const end = (side * run.width) / 2, box: [number, number, number, number] = [end, end, back, back + run.depth];
  const nearest = distanceToBox(edges, box);
  const faceEndsBy = (reach: number) => faceBreaks(region, run, back, end, end + side * reach);
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
    // Along the wall within the drawing's rounding (its centre to a thousandth of a mm).
    const onWall = Math.abs(a[1] - b[1]) < 0.0001 && a[1] < 0 && a[1] > -(back + Math.max(room.geometry.wallThickness ?? 0.12, plan.thickest) / 2 + 0.05);
    return onWall && door.bottomMm < topMm && door.topMm > bottomMm ? [[Math.min(a[0], b[0]), Math.max(a[0], b[0])] as [number, number]] : [];
  });
}

/**
 * The narrowest run Fit makes of a preset (fitting it to ever narrower walls of a plain room until it refuses), in metres, with
 * its depth and height.
 */
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
    found = { width: fitted.definition.totalWidth / 1000, depth: fitted.definition.depth / 1000, heightMm: getCabinetOverallHeight(fitted.definition) };
  }
  narrowest.set(preset, found);
  return found;
}

/**
 * Where Fit refuses a host, is it right to? A run as narrow as Fit makes, as deep, its back on the host's line (a base unit's
 * on the baseboard), slid along the host 5 mm at a time, must not stand anywhere: in the region (0.6 mm in from its sides),
 * its allowance (10 mm, and a floor run's baseboard, plus 0.5 mm) from every solid it would meet and from where its face
 * ends, and clear of the doors on its wall.
 */
function checkRefusal(region: Region, room: RoomSnapshot, space: CabinetHostSpace, openings: RoomOpening2D[], preset: "base" | "wall", label: string) {
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
    const doors = doorsOnRunWall(room, openings, run, back, bottomMm, bottomMm + smallest.heightMm);
    if (doors.some(([from, to]) => to > -width / 2 && from < width / 2)) continue;
    if (distanceToBox(edgesItMeets(region, run, back), [-width / 2, width / 2, back, back + depth]) < gap) continue;
    if (faceBreaks(region, run, back, -width / 2 - gap, width / 2 + gap) || !footprintInRegion(region, run, 0.0006)) continue;
    return check(false, () => `${label} ${space.wallId} ${preset}: Fit refuses it, but a ${(width * 1000).toFixed(1)} mm run stands ${(along * 1000).toFixed(0)} mm along it`);
  }
}

function checkRun(region: Region, room: RoomSnapshot, space: CabinetHostSpace, openings: RoomOpening2D[], preset: "base" | "wall", label: string) {
  const fitted = fitRun(space, preset);
  if (!fitted) return checkRefusal(region, room, space, openings, preset, label);
  counts.runs += 1;
  const { definition } = fitted;
  const at = getCabinetFitPlacement(definition, room.geometry.width, room.geometry.depth);
  const placed = getCabinetPlacement(definition, room, false, plan.rooms);
  if (!at) return check(false, () => `${label}: no placement`);
  const run: Run = { x: placed.position[0], z: placed.position[2], width: definition.totalWidth / 1000, depth: definition.depth / 1000, rotationY: placed.rotationY };
  const what = () => `${label} ${space.wallId} ${preset} (${run.width.toFixed(3)} × ${run.depth.toFixed(3)})`;
  check(Math.hypot(run.x - at.position[0], run.z - at.position[2]) < 1e-5, () => `${what()}: moved from where Fit put it`);
  check(getCabinetOverallDepth(definition) === definition.depth && getCabinetOverallWidth(definition) === definition.totalWidth, () => `${what()}: overall size differs`);
  const inside = footprintInRegion(region, run, 0.0006);
  if (!inside) counts.cut += 1;
  check(inside, () => `${what()}: the 3D view's walls cut into it`);
  // A base unit's back on the baseboard; a wall cabinet's on the face (it hangs above the baseboard).
  const floor = preset === "base", back = floor ? Math.max(0, space.baseboardOffsetMm ?? 0) / 1000 : 0;
  const gap = (10 + (floor ? Math.max(0, space.wallSegment?.startBaseboardClearanceMm ?? 0) : 0)) / 1000;
  const backs = Array.from({ length: 21 }, (_, index) => -run.width / 2 + 0.002 + ((run.width - 0.004) * index) / 20);
  check(backs.every((along) => !inRegion(region, toWorld(run, along, -run.depth / 2 - back - 0.0003))), () => `${what()}: its back isn't on a face`);
  check(isPlacementContainedInRoom({ room, position: placed.position, rotationY: run.rotationY, dimensions: { w: definition.totalWidth, d: definition.depth, h: 870 }, builtIn: true, planRooms: plan.rooms }), () => `${what()}: not contained`);
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
    const [x, z] = clampBuiltInToRoom(room, target.x, target.z, run.width, run.depth, run.rotationY, { from: [run.x, run.z], planRooms: plan.rooms });
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
      check(isPlacementContainedInRoom({ room, position: [x, 0, z], rotationY: run.rotationY, dimensions: { w: run.width * 1000, d: run.depth * 1000, h: 870 }, builtIn: true, planRooms: plan.rooms }), () => `${what()}: a nudge ${name} stopped where it isn't contained (moved ${(moved * 1000).toFixed(4)} mm, region ${footprintInRegion(region, { ...run, x, z }, 0.0005)})`);
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

/**
 * Where the line's Snap to wall sent a built-in (useDesignPageCabinetry.ts on f8ce1926, restated): the nearest of the room's
 * four sides, half the wall plus 2 cm in, by its turned footprint, and its middle for one wider than that.
 */
function lineSnapTarget(room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY: number): [number, number] {
  const [cos, sin] = [Math.abs(Math.cos(rotationY)), Math.abs(Math.sin(rotationY))];
  const [footprintWidth, footprintDepth] = [cos * width + sin * depth, sin * width + cos * depth];
  const inset = Math.max(0, room.geometry.wallThickness ?? 0.12) / 2 + 0.02;
  const wallX = Math.max(0, room.geometry.width / 2 - inset - footprintWidth / 2), wallZ = Math.max(0, room.geometry.depth / 2 - inset - footprintDepth / 2);
  const candidates: Array<[number, number]> = [[-wallX, z], [wallX, z], [x, -wallZ], [x, wallZ]];
  return candidates.reduce((best, candidate) => (Math.hypot(candidate[0] - x, candidate[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? candidate : best));
}

/**
 * A room with no exposed face: hosts, snap and containment as on the line (furniture's, for built-ins), each against the line's
 * own code restated or the line's furniture path. The built-in clamp there is furniture's own clamp (clampAsFurniture), so it
 * isn't compared with itself here; scripts/test-cabinetry-polygon-hosts.ts checks an imported room's moves.
 */
function checkFurnitureRule(room: RoomSnapshot, openings: RoomOpening2D[], label: string) {
  counts.furnitureRule += 1;
  const hosts = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: plan.rooms.size, planOpenings: openings, planRooms: plan.rooms });
  check(JSON.stringify(hosts) === JSON.stringify(lineHostsOf(room, openings)), () => `${label}: hosts differ from the line's`);
  for (let sample = 0; sample < 4; sample += 1) {
    const [x, z, width, depth, rotationY] = [between(-1, 1) * room.geometry.width, between(-1, 1) * room.geometry.depth, between(0.2, 1.2), between(0.2, 0.7), between(0, 6.3)];
    check(JSON.stringify(getBuiltInSnapTarget(room, [x, 0, z], width, depth, rotationY, plan.rooms)) === JSON.stringify(lineSnapTarget(room, x, z, width, depth, rotationY)), () => `${label}: snap differs from the line's`);
    const contained = (builtIn: boolean) => isPlacementContainedInRoom({ room, position: [x, 0, z], rotationY, dimensions: { w: width * 1000, d: depth * 1000, h: 870 }, builtIn, planRooms: plan.rooms });
    check(contained(true) === contained(false), () => `${label}: containment differs from furniture's`);
  }
}

/**
 * Is every face the 3D view draws offered as a host, and is every host a face it draws? For each outline edge, the stretches
 * of its face line exposed along it (exposedOnLine) must lie within one host on that line (its own, or a straight wall's first
 * piece's), and each host on the line must start and end where an exposed stretch does (±0.5 mm, more where the wall ending
 * it is all but parallel); a rectangle's hosts run corner to corner over a column, so their ends aren't checked where it has
 * one (with rooms next door, each is its exposed face). The face line is half the wall and its panel in from the edge, or where a thicker wall of a room
 * next door runs along it over that (parallel, its core reaching past it) that wall's face, whichever is exposed along more
 * of the edge (within a millimetre, either). No two hosts the same.
 */
function faceDepths(edge: { start: P; dx: number; dz: number; nx: number; nz: number; length: number }, own: number): number[] {
  const depths = [own];
  plan.neighbours.forEach((next) => {
    const thickness = Math.max(0.01, next.wallThickness ?? 0.12);
    const points = getRoomPlanOutlinePoints({ shape: next.shape, polygon: next.polygon, w: next.w, d: next.d }).map((point) => ({ x: point.x + next.x, z: point.z + next.z }));
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!(length > 0.002) || Math.abs(((b.x - a.x) * edge.dz - (b.z - a.z) * edge.dx) / length) > 1e-6) return;
      const across = (a.x - edge.start.x) * edge.nx + (a.z - edge.start.z) * edge.nz;
      const along = [a, b].map((point) => (point.x - edge.start.x) * edge.dx + (point.z - edge.start.z) * edge.dz);
      const reaches = Math.max(...along) + thickness / 2 > 0 && Math.min(...along) - thickness / 2 < edge.length;
      if (reaches && across - thickness / 2 < own && across + thickness / 2 > own + 0.000005) depths.push(across + thickness / 2);
    });
  });
  return depths;
}

function checkHostsOffered(region: Region, room: RoomSnapshot, spaces: CabinetHostSpace[], label: string) {
  const outline = region.outline, faceIds = getRoomWallFaceIds({ shape: room.planShape ?? "rectangle", polygon: room.planPolygon });
  const depths = getRoomWallFinishDepths(room), thickness = room.geometry.wallThickness ?? 0.12, reach = room.geometry.width + room.geometry.depth;
  const sign = outline.reduce((sum, point, index) => sum + point.x * outline[(index + 1) % outline.length].z - outline[(index + 1) % outline.length].x * point.z, 0) >= 0 ? 1 : -1;
  const keys = spaces.map((space) => JSON.stringify(space.wallSegment && [space.wallSegment.startXmm, space.wallSegment.startZmm, space.wallSegment.endXmm, space.wallSegment.endZmm]));
  check(new Set(keys).size === keys.length, () => `${label}: a host is listed twice`);
  outline.forEach((start, index) => {
    const end = outline[(index + 1) % outline.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    if (!(length > 1e-9)) return;
    const [dx, dz] = [(end.x - start.x) / length, (end.z - start.z) / length], [nx, nz] = [-dz * sign, dx * sign];
    const lineAt = (face: number) => {
      const origin = { x: start.x + nx * face, z: start.z + nz * face };
      const line: LineFrame = {
        frame: (point) => [(point.x - origin.x) * dx + (point.z - origin.z) * dz, (point.x - origin.x) * nx + (point.z - origin.z) * nz],
        at: (along, across) => ({ x: origin.x + dx * along + nx * across, z: origin.z + dz * along + nz * across }),
      };
      const exposed = exposedOnLine(region, line, -reach, length + reach);
      // Its own: 20 mm of it or more along the edge (less holds nothing, the allowance at each end).
      const own = exposed.filter((stretch) => Math.min(stretch.to, length) - Math.max(stretch.from, 0) >= 0.02);
      return { line, exposed, own, along: own.reduce((sum, stretch) => sum + Math.min(stretch.to, length) - Math.max(stretch.from, 0), 0) };
    };
    const faces = faceDepths({ start, dx, dz, nx, nz, length }, thickness / 2 + (depths[faceIds[index]] ?? 0)).map(lineAt);
    const most = Math.max(...faces.map((face) => face.along));
    const hostsOn = ({ line }: (typeof faces)[number]) => spaces.flatMap((space) => {
      const segment = space.wallSegment;
      if (!segment) return [];
      const [a, b] = [line.frame({ x: segment.startXmm / 1000, z: segment.startZmm / 1000 }), line.frame({ x: segment.endXmm / 1000, z: segment.endZmm / 1000 })];
      // On the line, and along it (a host under a millimetre, near a corner, lies near the next edge's line too: by its wall).
      const along = Math.abs(b[0] - a[0]) >= 0.001 ? Math.abs(b[1] - a[1]) / Math.abs(b[0] - a[0]) < 1e-6 : space.wallId === faceIds[index] || space.wallId === `wall-${index}`;
      return along && Math.abs(a[1]) < 0.00001 && Math.abs(b[1]) < 0.00001 ? [{ space, from: Math.min(a[0], b[0]), to: Math.max(a[0], b[0]) }] : [];
    });
    // The face exposed along most of the edge, or one within a millimetre of it with a host on it.
    const best = faces.filter((face) => face.along >= most - 0.001);
    const { exposed, own } = best.find((face) => hostsOn(face).length) ?? best[0], onLine = hostsOn(best.find((face) => hostsOn(face).length) ?? best[0]);
    const what = `${label} edge ${index} (${faceIds[index]})`;
    counts.hosts += onLine.filter((host) => host.space.wallId === faceIds[index] || host.space.wallId === `wall-${index}`).length;
    if (own.length) {
      counts.faces += 1;
      const first = own[0], last = own[own.length - 1];
      check(onLine.some((host) => host.from <= first.from + 0.0005 + first.slackFrom && host.to >= last.to - 0.0005 - last.slackTo),
        () => `${what}: its face, exposed ${own.map((stretch) => `${(stretch.from * 1000).toFixed(1)}..${(stretch.to * 1000).toFixed(1)}`).join(", ")} mm along it, isn't within a host (${onLine.map((host) => `${(host.from * 1000).toFixed(1)}..${(host.to * 1000).toFixed(1)}`).join(", ") || "none"})`);
    }
    if ((room.planShape ?? "rectangle") === "rectangle" && room.planHoles?.length && !plan.neighbours.length) return;
    onLine.forEach((host) => check(exposed.some((stretch) => Math.abs(stretch.from - host.from) <= 0.0005 + stretch.slackFrom) &&
      exposed.some((stretch) => Math.abs(stretch.to - host.to) <= 0.0005 + stretch.slackTo),
      () => `${what}: host ${host.space.wallId} ${(host.from * 1000).toFixed(1)}..${(host.to * 1000).toFixed(1)} mm isn't where an exposed face starts and ends (${exposed.map((stretch) => `${(stretch.from * 1000).toFixed(1)}..${(stretch.to * 1000).toFixed(1)}`).join(", ") || "none"})`));
  });
}

const started = Date.now();
for (let index = 0; index < ROOMS; index += 1) {
  if (process.env.ORACLE_ONLY && Number(process.env.ORACLE_ONLY) !== index) continue;
  state = (SEED ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0; // Each room from its own seed, so one can be rerun alone.
  const { room, family, openings, neighbours } = makeRoom(index);
  const own = toPlanRoom(room);
  plan = { neighbours, rooms: new Map([own, ...neighbours].map((entry) => [entry.id, entry])), thickest: Math.max(0, ...neighbours.map((next) => next.wallThickness ?? 0)) };
  counts.rooms += 1;
  if (neighbours.length) counts.nextDoor += 1;
  families[family] = (families[family] ?? 0) + 1;
  const label = `room ${index} (${family}${neighbours.length ? `, ${neighbours.length} next door` : ""}, seed ${SEED})`;
  if (process.env.ORACLE_ONLY) console.log(JSON.stringify({ shape: room.planShape, polygon: room.planPolygon, geometry: room.geometry, faces: room.surfaces?.walls?.faces, holes: room.planHoles, openings, neighbours }));
  if (usesFurnitureRuleForBuiltIns(room, undefined, plan.rooms)) {
    checkFurnitureRule(room, openings, label);
    continue;
  }
  const region = regionOf(room, neighbours);
  if (region.filled) {
    counts.filled += 1; // The 3D view's wall union came out without the room in it: nothing to check against.
    continue;
  }
  const spaces = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: plan.rooms.size, planOpenings: openings, planRooms: plan.rooms });
  checkHostsOffered(region, room, spaces, label);
  spaces.forEach((space) => (["base", "wall"] as const).forEach((preset) => checkRun(region, room, space, openings, preset, label)));
}

console.log(`Built-in faces oracle: ${counts.rooms} rooms (${Object.entries(families).map(([family, count]) => `${family} ${count}`).join(", ")}; ${counts.nextDoor} with rooms next door),`,
  `${counts.furnitureRule} on furniture's rule, ${counts.filled} whose 3D wall union came out without the room; ${counts.faces} exposed faces, ${counts.hosts} hosts; ${counts.runs} runs (${counts.cut} cut by the 3D view's walls, ${counts.filling} filling their stretch), ${counts.refused} refused, ${counts.nudges} nudges`,
  `(${counts.kept} kept, ${counts.stopped} stopped at the face, ${counts.furnitureOnly} of them where furniture's samples would let it on); seed ${SEED}, ${((Date.now() - started) / 1000).toFixed(1)} s.`);
assert.deepEqual(failures, [], `the oracle found ${failures.length}${failures.length >= 40 ? "+" : ""} failures`);
console.log("Built-in faces oracle tests passed.");
