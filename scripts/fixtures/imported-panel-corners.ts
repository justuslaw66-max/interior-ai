// Seeded random imported plans for the panel-corner properties in test-floor-plan-canonical-finishes-openings.ts: rooms of
// many shapes (L, T, cross, Y, wedges, bends, cusps, arcs), compiled for real, with mixed wall thicknesses and finishes, and
// the room's drawn panels measured against its walls, its other panels and its furniture's clamp.
import type { FloorPlanDocumentV2, FloorPlanFloorV2 } from "@/lib/floor-plan-document-v2";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { buildCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { buildHousePlan2D, type HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { getCanonicalFaceTrimsMm, getCanonicalRoomWallFinish } from "@/components/editor/renderers/canonical-floor-plan/canonicalWallPanels";
import { trimmedFaceEdge, wallSurfaceEdge, WALL_FINISH_SKIN_MM } from "@/components/editor/renderers/canonical-floor-plan/geometry";
import { clampToRoomInsideFinishes, getRoomOutlineInsideFinishes } from "@/lib/room-finished-outline";
import { getFurnitureWallInset, isFootprintInsideRoomPolygon } from "@/lib/design-page-geometry";
import { getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { RoomSnapshot } from "@/lib/room-types";

type P = { x: number; z: number };
type Arc = { centre: [number, number]; clockwise: boolean };
/** A plan as rooms of vertex loops (positive turning), and the arcs among their edges (keyed "from>to"). */
export type ShapeSpec = {
  kind: string; vertices: Record<string, [number, number]>; rooms: Record<string, string[]>; arcs?: Record<string, Arc>;
  /**
   * Groups of edges of one thickness (keyed "from>to"): a wall drawn in parts (a slight bend, a through wall at a T), and a
   * junction's arms, whose footprints the plan joins on a line only when they're one thickness (floor-plan-wall-footprints.ts
   * leaves a hole at a junction of walls of different thicknesses running on through it, which isn't a corner of any face).
   */
  sameWall?: string[][];
};

/** mulberry32: the same plans for the same seed. */
export function seeded(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, between: (low: number, high: number) => low + (high - low) * next(), pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)] };
}
type Random = ReturnType<typeof seeded>;
const deg = (value: number) => (value * Math.PI) / 180;

const SHAPES: Record<string, (random: Random) => ShapeSpec> = {
  l: (r) => {
    const [w, d] = [r.between(3000, 7000), r.between(3000, 6000)], [nw, nd] = [w * r.between(0.25, 0.6), d * r.between(0.25, 0.6)];
    return { kind: "l", vertices: { a: [0, 0], b: [w, 0], c: [w, d - nd], e: [w - nw, d - nd], f: [w - nw, d], g: [0, d] }, rooms: { R: ["a", "b", "c", "e", "f", "g"] } };
  },
  t: (r) => {
    const [a, b, c, s] = [r.between(2500, 5000), r.between(2500, 5000), r.between(2500, 4000), r.between(2500, 4000)];
    return { kind: "t", vertices: { p1: [-a, -c], p2: [b, -c], p3: [b, 0], p4: [b, s], p5: [0, s], p6: [-a, s], p7: [-a, 0], j: [0, 0] },
      rooms: { N: ["p1", "p2", "p3", "j", "p7"], W: ["p7", "j", "p5", "p6"], E: ["j", "p3", "p4", "p5"] }, sameWall: [["p7>j", "j>p3"]] };
  },
  cross: (r) => {
    const [a, b] = [r.between(2500, 5000), r.between(2500, 5000)], s = r.between(-deg(20), deg(20));
    const arm = (angle: number, length: number): [number, number] => [length * Math.cos(angle), length * Math.sin(angle)];
    return { kind: "cross", vertices: { j: [0, 0], e: arm(s, a), n: arm(Math.PI / 2 + s, b), w: arm(Math.PI + s, a), s: arm(-Math.PI / 2 + s, b),
      ne: [a, b], nw: [-a, b], sw: [-a, -b], se: [a, -b] },
      rooms: { A: ["j", "e", "ne", "n"], B: ["j", "n", "nw", "w"], C: ["j", "w", "sw", "s"], D: ["j", "s", "se", "e"] }, sameWall: [["j>e", "j>n", "j>w", "j>s"], ["se>e", "e>ne"], ["ne>n", "n>nw"], ["nw>w", "w>sw"], ["sw>s", "s>se"]] };
  },
  y: (r) => {
    const radius = r.between(3000, 5000), angles = [90, 210, 330].map((angle) => deg(angle + r.between(-15, 15)));
    const at = (angle: number, length = radius): [number, number] => [length * Math.cos(angle), length * Math.sin(angle)];
    const middle = (from: number, to: number) => at((from + (to < from ? to + 2 * Math.PI : to)) / 2, radius * 1.15);
    return { kind: "y", vertices: { j: [0, 0], a0: at(angles[0]), a1: at(angles[1]), a2: at(angles[2]),
      m0: middle(angles[0], angles[1]), m1: middle(angles[1], angles[2]), m2: middle(angles[2], angles[0]) },
      rooms: { A: ["j", "a0", "m0", "a1"], B: ["j", "a1", "m1", "a2"], C: ["j", "a2", "m2", "a0"] }, sameWall: [["j>a0", "j>a1", "j>a2"], ["m2>a0", "a0>m0"], ["m0>a1", "a1>m1"], ["m1>a2", "a2>m2"]] };
  },
  wedge: (r) => {
    const [angle, length] = [deg(r.between(5, 60)), r.between(4000, 7000)];
    return { kind: "wedge", vertices: { p: [0, 0], q: [length, 0], s: [length * Math.cos(angle), length * Math.sin(angle)] }, rooms: { R: ["p", "q", "s"] } };
  },
  bend: (r) => {
    const [w, d, turn] = [r.between(4000, 8000), r.between(3000, 5000), deg(r.between(0, 20)) * (r.next() < 0.5 ? -1 : 1)];
    // A slight bend is one wall drawn in two parts, of one thickness.
    return { kind: "bend", vertices: { a: [0, 0], m: [w / 2, (w / 2) * Math.tan(turn / 2)], b: [w, 0], c: [w, d], e: [0, d] }, rooms: { R: ["a", "m", "b", "c", "e"] }, sameWall: [["a>m", "m>b"]] };
  },
  spike: (r) => {
    const [w, d, height] = [r.between(4000, 7000), r.between(3500, 5000), r.between(1200, 2500)], half = height * Math.tan(deg(r.between(1.5, 10)));
    return { kind: "spike", vertices: { a: [0, 0], s0: [w / 2 - half, 0], tip: [w / 2, height], s1: [w / 2 + half, 0], b: [w, 0], c: [w, d], e: [0, d] },
      rooms: { R: ["a", "s0", "tip", "s1", "b", "c", "e"] } };
  },
  arc: (r) => {
    // A rectangle whose east side is an arc: inward to a cusp (tangent) or an acute corner, or outward.
    const [w, d] = [r.between(4000, 7000), r.between(3000, 6000)], inward = r.next() < 0.6, push = r.between(0, d / 2);
    return { kind: inward ? (push < 200 ? "arc-cusp" : "arc-in") : "arc-out", vertices: { a: [0, 0], b: [w, 0], c: [w, d], e: [0, d] },
      rooms: { R: ["a", "b", "c", "e"] }, arcs: { "b>c": { centre: [inward ? w + push : w - push, d / 2], clockwise: inward } } };
  },
  arcs: (r) => {
    // Two arcs meeting at a corner, each bulging in or out.
    const [w, d] = [r.between(4000, 7000), r.between(4000, 6000)], [inEast, inSouth] = [r.next() < 0.5, r.next() < 0.5];
    const [pushEast, pushSouth] = [r.between(w * 0.6, w * 1.5), r.between(d * 0.6, d * 1.5)];
    return { kind: "arcs", vertices: { a: [0, 0], b: [w, 0], c: [w, d], e: [0, d] }, rooms: { R: ["a", "b", "c", "e"] },
      arcs: { "b>c": { centre: [inEast ? w + pushEast : w - pushEast, d / 2], clockwise: inEast },
        "c>e": { centre: [w / 2, inSouth ? d + pushSouth : d - pushSouth], clockwise: inSouth } } };
  },
};
export const SHAPE_KINDS = Object.keys(SHAPES);

const prov = () => ({ confidence: 0.99, extractionVersion: "t", reviewHistory: [], evidence: [{ sourceId: "source-1",
  basis: "vector_traced" as const, confidence: 0.99, extractorVersion: "t", pageNumber: 1, cropPx: { xPx: 0, yPx: 0, widthPx: 1, heightPx: 1 } }] });
const assumed = (valueMm: number) => ({ valueMm, evidence: "assumed" as const, provenance: prov() });

/** The spec as a plan: its vertices turned, mirrored and moved, a wall per edge with its own thickness, and maybe a door. */
export function planFromShape(id: string, spec: ShapeSpec, random: Random): FloorPlanDocumentV2 {
  const [turn, mirror, dx, dz] = [random.between(0, 2 * Math.PI), random.next() < 0.5 ? -1 : 1, random.between(-3000, 3000), random.between(-3000, 3000)];
  const exact = ([x, z]: [number, number]) => ({ xMm: mirror * (x * Math.cos(turn) - z * Math.sin(turn)) + dx, zMm: x * Math.sin(turn) + z * Math.cos(turn) + dz });
  const place = (point: [number, number]) => { const { xMm, zMm } = exact(point); return { xMm: Math.round(xMm), zMm: Math.round(zMm) }; };
  const vertices = Object.entries(spec.vertices).map(([vertexId, point]) => ({ id: vertexId, ...place(point), provenance: prov() }));
  const walls = new Map<string, { id: string; from: string; to: string; rooms: string[] }>();
  const loops = Object.entries(spec.rooms).map(([roomId, loop]) => ({ roomId, walls: loop.map((from, index) => {
    const to = loop[(index + 1) % loop.length];
    const known = walls.get(`${to}>${from}`);
    if (known) { known.rooms.push(roomId); return { wallId: known.id, direction: "reverse" as const }; }
    walls.set(`${from}>${to}`, { id: `w-${from}-${to}`, from, to, rooms: [roomId] });
    return { wallId: `w-${from}-${to}`, direction: "forward" as const };
  }) }));
  // A centre on whole millimetres the arc's rounded ends are equidistant from (the plan allows 0.5 mm).
  const centres = Object.entries(spec.arcs ?? {}).map(([key, arc]) => {
    const [from, to] = key.split(">").map((vertexId) => place(spec.vertices[vertexId]));
    const ideal = exact(arc.centre);
    let best = { xMm: Math.round(ideal.xMm), zMm: Math.round(ideal.zMm), off: Infinity };
    for (let stepX = -6; stepX <= 6; stepX += 1) for (let stepZ = -6; stepZ <= 6; stepZ += 1) {
      const candidate = { xMm: Math.round(ideal.xMm) + stepX, zMm: Math.round(ideal.zMm) + stepZ };
      const off = Math.abs(Math.hypot(candidate.xMm - from.xMm, candidate.zMm - from.zMm) - Math.hypot(candidate.xMm - to.xMm, candidate.zMm - to.zMm));
      if (off < 0.4 && Math.hypot(stepX, stepZ) < Math.hypot(best.xMm - Math.round(ideal.xMm), best.zMm - Math.round(ideal.zMm)) || (best.off >= 0.4 && off < best.off)) best = { ...candidate, off };
    }
    return { id: `arc-${key.replace(">", "-")}`, xMm: best.xMm, zMm: best.zMm, provenance: prov() };
  });
  const groupThickness = (spec.sameWall ?? []).map(() => random.pick([100, 150, 200, 250, 300]));
  const wallList = [...walls.entries()].map(([key, wall]) => {
    const arc = spec.arcs?.[key];
    const path = arc ? { kind: "arc" as const, startVertexId: wall.from, endVertexId: wall.to, centerVertexId: `arc-${key.replace(">", "-")}`,
      clockwise: mirror < 0 ? !arc.clockwise : arc.clockwise } : { kind: "line" as const, startVertexId: wall.from, endVertexId: wall.to };
    const group = (spec.sameWall ?? []).findIndex((edges) => edges.some((entry) => entry === key || entry.split(">").reverse().join(">") === key));
    const thicknessMm = group >= 0 ? groupThickness[group] : random.pick([100, 150, 200, 250, 300]);
    return { id: wall.id, thicknessMm, adjacentRoomIds: wall.rooms, path,
      classification: wall.rooms.length > 1 ? "interior" as const : "exterior" as const, provenance: prov() };
  });
  const at = new Map(vertices.map(({ id: vertexId, xMm, zMm }) => [vertexId, { xMm, zMm }]));
  const lengthOf = ({ path }: (typeof wallList)[number]) => Math.hypot(at.get(path.endVertexId)!.xMm - at.get(path.startVertexId)!.xMm, at.get(path.endVertexId)!.zMm - at.get(path.startVertexId)!.zMm);
  const doorWall = random.next() < 0.3 ? random.pick(wallList.filter((wall) => wall.path.kind === "line")) : undefined;
  const offsetMm = Math.round(random.between(60, 700));
  const openings = doorWall && lengthOf(doorWall) > offsetMm + 900 ? [{ id: "door", wallId: doorWall.id, kind: "door", operation: "swing", offsetMm,
    widthMm: 800, hinge: "start", handing: "left", provenance: prov() }] : [];
  return {
    schemaVersion: 2, units: "mm", id, revisionId: `${id}-r1`, createdAt: "2026-10-31T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [{ id: "source-1", kind: "pdf", name: "plan", mimeType: "application/pdf", sha256: "b".repeat(64), pageCount: 1 }],
    floors: [{
      id: "floor-1", name: "L1", levelIndex: 0, elevationMm: 0, storeyHeightMm: 2800, slabThicknessMm: 150, calibrations: [],
      defaults: { wallHeight: assumed(2600), doorHeight: assumed(2100), windowHeight: assumed(1200), windowSillHeight: assumed(900) },
      vertices: [...vertices, ...centres], walls: wallList,
      rooms: loops.map(({ roomId, walls: loop }) => ({ id: roomId, name: roomId, roomType: "living", provenance: prov(), wallLoops: [{ kind: "outer" as const, walls: loop }] })),
      openings: openings as unknown as FloorPlanFloorV2["openings"], structures: [], annotations: [], dimensions: [],
    }],
  } as unknown as FloorPlanDocumentV2;
}

const BACKINGS = [6, 9, 12, 18].flatMap((boardThicknessMm) => (["glued", "battens"] as const).map((fixing) => ({ board: "mdf", boardThicknessMm, fixing })));
/** Each of the room's walls laminated on a random board, or painted. */
function finished(room: RoomSnapshot, random: Random): RoomSnapshot {
  const faces = Object.fromEntries((room.planEdgeWallIds ?? []).map((wallId) => [wallId, random.next() < 0.75
    ? { materialId: "greenlam-woodgrains-5394", panelBacking: random.pick(BACKINGS) } : { paintColorHex: "#ffffff" }]));
  return { ...room, surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces } }, surfaceFinishes: undefined } as RoomSnapshot;
}

const cross = (a: P, b: P) => a.x * b.z - a.z * b.x;
const sub = (a: P, b: P) => ({ x: a.x - b.x, z: a.z - b.z });
function inside(point: P, polygon: readonly P[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i], polygon[j]];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}
function segmentDistance(point: P, a: P, b: P): number {
  const ab = sub(b, a), length = ab.x * ab.x + ab.z * ab.z;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * ab.x + (point.z - a.z) * ab.z) / length)) : 0;
  return Math.hypot(point.x - a.x - ab.x * t, point.z - a.z - ab.z * t);
}
const boundaryDistance = (point: P, polygon: readonly P[]) =>
  Math.min(...polygon.map((corner, index) => segmentDistance(point, corner, polygon[(index + 1) % polygon.length])));
const polygonArea = (points: readonly P[]) => points.reduce((sum, point, index) => sum + cross(point, points[(index + 1) % points.length]), 0) / 2;
/** The area two convex outlines share (Sutherland–Hodgman). */
export function overlapArea(subject: readonly P[], clipper: readonly P[]): number {
  const edges = polygonArea(clipper) > 0 ? clipper : [...clipper].reverse();
  let kept: P[] = [...subject];
  edges.forEach((from, index) => {
    const to = edges[(index + 1) % edges.length];
    const side = (point: P) => cross(sub(to, from), sub(point, from));
    const input = kept;
    kept = [];
    input.forEach((point, pointIndex) => {
      const next = input[(pointIndex + 1) % input.length];
      const [here, there] = [side(point), side(next)];
      if (here >= 0) kept.push(point);
      if ((here >= 0) !== (there >= 0)) kept.push({ x: point.x + (next.x - point.x) * (here / (here - there)), z: point.z + (next.z - point.z) * (here / (here - there)) });
    });
  });
  return kept.length < 3 ? 0 : Math.abs(polygonArea(kept));
}
const convexSimple = (quad: readonly P[]) => {
  const turns = quad.map((point, index) => cross(sub(quad[(index + 1) % 4], point), sub(quad[(index + 2) % 4], quad[(index + 1) % 4])));
  return turns.every((turn) => turn >= -1e-9) || turns.every((turn) => turn <= 1e-9);
};

export type ClampLimit = { rooms: number; intoPanel: number; worstMm: number };
export type CornerStats = {
  plans: number; skipped: number; rooms: number; panels: number; kinds: Record<string, number>; worst: Record<string, number>;
  failing: Record<string, number>; failingByKind: Record<string, number>; failures: string[];
  /**
   * Where the clamp's own limit lets an item nearer a laminate than 2 cm (CLAMP_LIMIT_CASES), by kind of plan: the rooms, those
   * where it goes into the laminate, and how far short of 2 cm in front it stops at worst.
   */
  clampLimit: Record<string, ClampLimit>;
};
/**
 * Tolerances, stated. Straight walls: the plan's points are whole millimetres and its footprint joins are rounded, so panels
 * meet to within these. A room with an arc: an arc is drawn as straight slices whose finish follows their mitred joints, but
 * a corner with an arc is found on the polylines of its faces, and where an arc meets another wall at a sharp angle the plan's
 * footprints there are joined slice by slice, so these allow the slices' slivers (the review's documented arc mitre slivers).
 * Furniture is measured as how far short of 2 cm in front of a panel an item stops, so 20 mm there lets it touch, not enter.
 */
export const CORNER_TOLERANCES = {
  straight: { overlapMm2: 2, pokeMm: 0.5, buriedMm: 0.5, coverMm: 2, furnitureMm: 0.5 },
  arc: { overlapMm2: 50, pokeMm: 2, buriedMm: 8, coverMm: 35, furnitureMm: 20 },
};
type Tolerances = (typeof CORNER_TOLERANCES)["straight"];

/**
 * Rooms that still fail a check in a run of this many plans, by check (31 Oct 2026, fifth review): known open cases, so a
 * count can only come down. Wedges under about 15 degrees (their faces meet far up the wedge, where a door near the tip or the
 * plan's unjoined footprints leave slivers), arcs meeting a wall at a sharp angle (their slices' own mitres), and junctions of
 * three walls (slivers of up to 10 mm² where the plan's footprints join). The two furniture cases are arcs bowing into the
 * room: its outline is the plan's chords of the arc, which can each span more of it than one of the wall's slices, and the
 * clamp keeps to the outline, so an item comes nearer the arc by up to a chord's sagitta (4.7 mm into a panel in corners-341,
 * 1.1 mm in corners-1709). The clamp is the same at a bare arc.
 */
export const OPEN_CORNER_CASES: Record<number, Record<string, number>> = {
  100: { overlapMm2: 1, uncoveredMm: 1 },
  2000: { overlapMm2: 22, uncoveredMm: 40, furnitureMm: 2, buriedMm: 20, pokeMm: 3 },
};

/**
 * The furniture clamp's own limit, measured apart (31 Oct 2026; it is shared with drawn rooms, and fixing it is J's call): at
 * an outside corner of a turned room it keeps a square inset, and its nine points can let an item's box straddle a thin
 * spike. By kind of plan, in a run of this many: the rooms where an item comes nearer a laminate than 2 cm (beyond the kind's
 * tolerance), those where it goes into one, and the most it stops short of 2 cm in front (less 20 mm, how deep it goes). A
 * count or the worst may only come down; a kind not listed fails.
 */
export const CLAMP_LIMIT_CASES: Record<number, Record<string, ClampLimit>> = {
  100: {
    spike: { rooms: 11, intoPanel: 11, worstMm: 534.44 }, l: { rooms: 10, intoPanel: 8, worstMm: 52.74 },
    "arc-in": { rooms: 2, intoPanel: 2, worstMm: 23.82 },
  },
  2000: {
    spike: { rooms: 208, intoPanel: 207, worstMm: 583.03 }, l: { rooms: 210, intoPanel: 142, worstMm: 328.3 },
    "arc-in": { rooms: 9, intoPanel: 9, worstMm: 24.24 }, bend: { rooms: 10, intoPanel: 0, worstMm: 2.41 },
    arcs: { rooms: 3, intoPanel: 3, worstMm: 25.1 }, "arc-cusp": { rooms: 2, intoPanel: 2, worstMm: 23.99 },
  },
};

type Panel = { wallId: string; quad: P[]; depth: number };
const SKIN = WALL_FINISH_SKIN_MM / 1000 + 1e-9;

function roomPanels(floor: ReturnType<typeof buildCanonicalFloorPlanRenderModel>["floors"][number], room: HousePlanRoom2D): Panel[] {
  return floor.walls.flatMap((wall) => wall.roomSides.filter(({ roomId }) => roomId === room.id).flatMap(({ side }) => {
    const { depthMm } = getCanonicalRoomWallFinish(room, wall.id);
    const depth = depthMm > 0 ? depthMm : WALL_FINISH_SKIN_MM;
    return wall.solids.filter((solid) => solid.bottomMm <= wall.baseOffsetMm + 0.5).flatMap((solid) => {
      const trims = getCanonicalFaceTrimsMm(room, floor.walls, wall, solid, side);
      if (trims.hidden) return [];
      const [bare, front] = [trimmedFaceEdge(solid, side, 0, trims), trimmedFaceEdge(solid, side, depth, trims)];
      return [{ wallId: wall.id, quad: [bare.start, bare.end, front.end, front.start], depth: depth / 1000 }];
    });
  }));
}

/** Points through a panel: every 2 mm near its ends and every 20 mm between, at a quarter, half and three quarters deep. */
function panelSamples(quad: readonly P[]): P[] {
  const [b0, b1, f1, f0] = quad;
  const length = Math.max(Math.hypot(b1.x - b0.x, b1.z - b0.z), Math.hypot(f1.x - f0.x, f1.z - f0.z));
  const points: P[] = [];
  for (let along = 0.001; along < length; along += along < 0.06 || along > length - 0.06 ? 0.002 : 0.02) {
    const t = along / length;
    const [bare, front] = [{ x: b0.x + (b1.x - b0.x) * t, z: b0.z + (b1.z - b0.z) * t }, { x: f0.x + (f1.x - f0.x) * t, z: f0.z + (f1.z - f0.z) * t }];
    for (const deep of [0.25, 0.5, 0.75]) points.push({ x: bare.x + (front.x - bare.x) * deep, z: bare.z + (front.z - bare.z) * deep });
  }
  return points;
}

/** Measures one compiled plan's rooms, adding to `stats`. */
export function checkPlan(document: FloorPlanDocumentV2, kind: string, random: Random, stats: CornerStats, addressTransform = "normal"): void {
  const { snapshot, scene } = canonicalFloorPlanToDesignSnapshot(document, { addressTransform } as Parameters<typeof canonicalFloorPlanToDesignSnapshot>[1]);
  const rooms = snapshot.rooms.map((room) => finished(room, random));
  const planRooms = buildHousePlan2D(rooms, 8, 6).rooms;
  const floor = buildCanonicalFloorPlanRenderModel(scene).floors[0];
  const footprints = floor.walls.flatMap((wall) => wall.solids.filter((solid) => solid.bottomMm <= wall.baseOffsetMm + 0.5).map((solid) => ({
    wallId: wall.id, quad: [solid.footprint.startLeft, solid.footprint.endLeft, solid.footprint.endRight, solid.footprint.startRight].map(({ xMm, zMm }) => ({ x: xMm / 1000, z: zMm / 1000 })) })));
  stats.plans += 1;
  stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1;
  for (const room of planRooms) checkRoom(room, rooms.find(({ id }) => id === room.id)!, floor, footprints, `${document.id} ${kind} ${addressTransform} ${room.id}`, stats);
}

type Footprint = { wallId: string; quad: P[] };
const note = (stats: CornerStats, key: string, value: number, limit: number, label: string) => {
  stats.worst[key] = Math.max(stats.worst[key] ?? 0, value);
  if (value <= limit) return;
  stats.failing[key] = (stats.failing[key] ?? 0) + 1;
  const kind = label.split(" ")[1] ?? "";
  stats.failingByKind[kind] = (stats.failingByKind[kind] ?? 0) + 1;
  if (stats.failures.filter((line) => line.includes(` ${key} `)).length < 6) stats.failures.push(`${label}: ${key} ${value.toFixed(2)} (limit ${limit})`);
};

function checkRoom(room: HousePlanRoom2D, snapshot: RoomSnapshot, floor: Parameters<typeof roomPanels>[0], footprints: Footprint[], label: string, stats: CornerStats): void {
  if (!snapshot.planEdgeWallIds) { note(stats, "unnamed", 1, 0, label); return; }
  const outline = room.polygon!.map(({ x, z }) => ({ x: x + room.x, z: z + room.z }));
  const panels = roomPanels(floor, room);
  stats.rooms += 1;
  stats.panels += panels.length;
  const tolerance = (snapshot.planEdgeWallIds ?? []).some((wallId) => floor.walls.find(({ id }) => id === wallId)?.path.kind === "arc")
    ? CORNER_TOLERANCES.arc : CORNER_TOLERANCES.straight;
  panels.forEach((panel, index) => {
    if (!convexSimple(panel.quad)) note(stats, "twisted", 1, 0, `${label} ${panel.wallId}`);
    for (const other of panels.slice(index + 1)) note(stats, "overlapMm2", overlapArea(panel.quad, other.quad) * 1e6, tolerance.overlapMm2, `${label} ${panel.wallId}+${other.wallId}`);
  });
  for (const panel of panels) {
    let poke = 0, buried = 0;
    for (const point of panelSamples(panel.quad)) {
      const inOutline = inside(point, outline);
      const wallsHere = footprints.filter(({ quad }) => inside(point, quad));
      if (!inOutline && !wallsHere.length) poke = Math.max(poke, Math.min(boundaryDistance(point, outline), ...footprints.map(({ quad }) => boundaryDistance(point, quad))));
      const other = wallsHere.filter(({ wallId }) => wallId !== panel.wallId);
      if (other.length) buried = Math.max(buried, ...other.map(({ quad }) => boundaryDistance(point, quad)));
    }
    note(stats, "pokeMm", poke * 1000, tolerance.pokeMm, `${label} ${panel.wallId}`);
    note(stats, "buriedMm", buried * 1000, tolerance.buriedMm, `${label} ${panel.wallId}`);
  }
  checkCoverage(room, snapshot, floor, footprints, outline, panels, label, stats, tolerance);
  checkFurniture(room, snapshot, panels, label, stats, tolerance);
}

const ITEMS = [[0.4, 0.4], [1, 0.5], [0.5, 1]] as const;
const rectangle = (x: number, z: number, w: number, d: number): P[] =>
  [{ x: x - w / 2, z: z - d / 2 }, { x: x + w / 2, z: z - d / 2 }, { x: x + w / 2, z: z + d / 2 }, { x: x - w / 2, z: z + d / 2 }];
/** The gap between two convex outlines: none when they overlap. */
function gapBetween(a: readonly P[], b: readonly P[]): number {
  if (a.some((point) => inside(point, b)) || b.some((point) => inside(point, a))) return 0;
  let gap = Infinity;
  a.forEach((from, i) => b.forEach((to, j) => {
    const [aEnd, bEnd] = [a[(i + 1) % a.length], b[(j + 1) % b.length]];
    gap = Math.min(gap, segmentDistance(from, to, bEnd), segmentDistance(aEnd, to, bEnd), segmentDistance(to, from, aEnd), segmentDistance(bEnd, from, aEnd));
  }));
  return gap;
}

/**
 * How far apart two convex outlines are: the gap between them, or where they overlap, minus how deep (the least distance one
 * must move along an edge's normal to clear the other), so an item through a panel reads worse than one touching it.
 */
function separation(a: readonly P[], b: readonly P[]): number {
  const gap = gapBetween(a, b);
  if (gap > 0) return gap;
  let depth = Infinity;
  for (const outline of [a, b]) outline.forEach((from, index) => {
    const to = outline[(index + 1) % outline.length];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length < 1e-12) return;
    const axis = { x: -(to.z - from.z) / length, z: (to.x - from.x) / length };
    const [onA, onB] = [a, b].map((points) => points.map((point) => point.x * axis.x + point.z * axis.z));
    depth = Math.min(depth, Math.min(Math.max(...onA) - Math.min(...onB), Math.max(...onB) - Math.min(...onA)));
  });
  return -Math.max(0, depth);
}

/**
 * Furniture stops 20 mm in front of every laminate the room is measured to: items dragged onto each panel (its ends and
 * middle) and onto each corner of the clamp's outline are placed by the room's clamp (clampToRoomInsideFinishes), and each one's gap to every laminate
 * panel is at least 20 mm. A skin (paint, tiles) isn't measured: the room stops at the bare wall there (J: what is drawn is what
 * is measured).
 */
function checkFurniture(room: HousePlanRoom2D, snapshot: RoomSnapshot, panels: Panel[], label: string, stats: CornerStats, tolerance: Tolerances) {
  const laminates = panels.filter(({ depth }) => depth > SKIN);
  if (!laminates.length) return;
  const origin = snapshot.planPosition ?? { x: room.x, z: room.z };
  const inset = getFurnitureWallInset(snapshot.geometry.wallThickness ?? 0.12);
  const depths = getRoomWallFinishDepths(snapshot);
  const inner = getRoomOutlineInsideFinishes({ shape: "custom_polygon", polygon: snapshot.planPolygon, holes: snapshot.planHoles, w: snapshot.geometry.width, d: snapshot.geometry.depth }, depths);
  const clampOutline = inner.polygon ?? [];
  const targets = [...clampOutline.map(({ x, z }) => ({ x: x + origin.x, z: z + origin.z })), ...laminates.flatMap(({ quad: [b0, , f1, f0] }) => [0.02, 0.5, 0.98].map((t) =>
    ({ x: f0.x + (f1.x - f0.x) * t + (b0.x - f0.x) * 0.5, z: f0.z + (f1.z - f0.z) * t + (b0.z - f0.z) * 0.5 })))];
  const area = polygonArea(clampOutline), halfWall = inset - 0.02;
  const outsideCorners = clampOutline.flatMap((corner, index) => {
    const [before, after] = [clampOutline[(index - 1 + clampOutline.length) % clampOutline.length], clampOutline[(index + 1) % clampOutline.length]];
    const [into, out] = [sub(corner, before), sub(after, corner)];
    const turn = Math.atan2(cross(into, out), into.x * out.x + into.z * out.z);
    return turn * area < -1e-12 ? [{ corner, reach: Math.min(1, inset + halfWall / Math.max(0.05, Math.cos(turn / 2))) }] : [];
  });
  let short = 0, missed = 0;
  for (const target of targets) for (const [w, d] of ITEMS) {
    const [x, z] = clampToRoomInsideFinishes(target.x - origin.x, target.z - origin.z, w, d, snapshot.geometry.width, snapshot.geometry.depth,
      inset, 0, "custom_polygon", snapshot.planPolygon, snapshot.planHoles, depths);
    // Where the clamp finds no place for it (an item too big for a sharp corner), it keeps it in the room's box: not placed.
    if (!isFootprintInsideRoomPolygon(x, z, w / 2 + inset, d / 2 + inset, clampOutline, snapshot.planHoles ?? [])) continue;
    // The clamp tests nine points of the item's box grown by the wall inset (lib/design-page-geometry.ts), so an outside
    // corner of its outline (a room's outside corner, a thin spike, the step where walls of different depths run on) can
    // reach into the box between them, past the walls' faces as well as their panels: measured apart.
    const grown = rectangle(x, z, w + 2 * inset, d + 2 * inset);
    const crosses = clampOutline.some((corner, index) => inside(corner, grown)
      || grown.some((from, side) => segmentsCross(corner, clampOutline[(index + 1) % clampOutline.length], from, grown[(side + 1) % 4])));
    // And at an outside corner the clamp keeps the box's square, not a round, wall inset clear of the corner, so in a turned
    // room the item can come nearer the walls' (and panels') corner than 2 cm, by up to (1 - cos 45°) of the corner's reach.
    const nearOutside = outsideCorners.some(({ corner, reach }) => gapBetween(rectangle(x, z, w, d), [corner, corner, corner]) < reach);
    const item = rectangle(x + origin.x, z + origin.z, w, d);
    for (const panel of laminates) {
      const miss = 0.02 - separation(item, panel.quad);
      if (crosses || nearOutside) missed = Math.max(missed, miss);
      else short = Math.max(short, miss);
    }
  }
  note(stats, "furnitureMm", short * 1000, tolerance.furnitureMm, label);
  stats.worst.furnitureWhereClampMissesMm = Math.max(stats.worst.furnitureWhereClampMissesMm ?? 0, missed * 1000);
  if (missed * 1000 <= tolerance.furnitureMm) return;
  const kind = label.split(" ")[1] ?? "";
  const known = stats.clampLimit[kind] ?? { rooms: 0, intoPanel: 0, worstMm: 0 };
  stats.clampLimit[kind] = {
    rooms: known.rooms + 1, intoPanel: known.intoPanel + (missed > 0.02 ? 1 : 0), worstMm: Math.max(known.worstMm, missed * 1000),
  };
}

const segmentsCross = (a: P, b: P, c: P, d: P) => {
  const [d1, d2, d3, d4] = [cross(sub(b, a), sub(c, a)), cross(sub(b, a), sub(d, a)), cross(sub(d, c), sub(a, c)), cross(sub(d, c), sub(b, c))];
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** A straight wall's bare face on the room's side: a point on it and its normal into the room. */
function faceLine(wall: Parameters<typeof roomPanels>[0]["walls"][number], side: 1 | -1) {
  const [start, end] = [wall.centerlineSegments[0].start, wall.centerlineSegments[wall.centerlineSegments.length - 1].end];
  const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  const normal = { x: (-(end.zMm - start.zMm) / length) * side, z: ((end.xMm - start.xMm) / length) * side };
  return { at: { x: start.xMm / 1000 + (normal.x * wall.thicknessMm) / 2000, z: start.zMm / 1000 + (normal.z * wall.thicknessMm) / 2000 }, normal };
}

/**
 * Each face is covered up to its corners: points just in front of it, on the room's floor and away from other walls, lie in
 * a panel. A face is its edge's stretch of wall (an arc's run of edges), and at an outside corner on past its vertex to where
 * the faces meet (its slice's face ends there when the walls are joined); within 10 degrees of straight on it ends at the
 * vertex.
 */
function checkCoverage(
  room: HousePlanRoom2D, snapshot: RoomSnapshot, floor: Parameters<typeof roomPanels>[0], footprints: Footprint[], outline: P[], panels: Panel[],
  label: string, stats: CornerStats, tolerance: Tolerances
) {
  let uncovered = 0;
  const edges = snapshot.planEdgeWallIds ?? [];
  const area = polygonArea(outline);
  const turnAt = (index: number) => {
    const count = outline.length, [before, here, after] = [outline[(index - 1 + count) % count], outline[index], outline[(index + 1) % count]];
    const [into, out] = [sub(here, before), sub(after, here)];
    return Math.atan2(cross(into, out), into.x * out.x + into.z * out.z);
  };
  const outsideAt = (index: number) => turnAt(index) * area < 0 && Math.abs(turnAt(index)) >= deg(10);
  edges.forEach((wallId, index) => {
    if (edges[(index - 1 + edges.length) % edges.length] === wallId) return; // one run per wall
    let last = index;
    while (edges[(last + 1) % edges.length] === wallId && (last + 1) % edges.length !== index) last = (last + 1) % edges.length;
    const wall = floor.walls.find(({ id }) => id === wallId);
    const side = wall?.roomSides.find(({ roomId }) => roomId === room.id)?.side;
    if (!wall || !side) return;
    const [from, to] = [outline[index], outline[(last + 1) % outline.length]];
    const chord = Math.hypot(to.x - from.x, to.z - from.z), along = { x: (to.x - from.x) / chord, z: (to.z - from.z) / chord };
    const reach = (vertex: number) => (outsideAt(vertex) ? 0.6 : 0);
    const [low, high] = [-reach(index), chord + reach((last + 1) % outline.length)];
    // Within 10 degrees of straight on, the faces meet on the mitre through the vertex.
    const mitres = [index, (last + 1) % outline.length].flatMap((vertex, end) => {
      if (Math.abs(turnAt(vertex)) >= deg(10)) return [];
      const count = outline.length, [before, here, after] = [outline[(vertex - 1 + count) % count], outline[vertex], outline[(vertex + 1) % count]];
      const [into, out] = [sub(here, before), sub(after, here)];
      const [lengthIn, lengthOut] = [Math.hypot(into.x, into.z), Math.hypot(out.x, out.z)];
      const mean = { x: into.x / lengthIn + out.x / lengthOut, z: into.z / lengthIn + out.z / lengthOut };
      return [{ at: here, normal: end === 0 ? mean : { x: -mean.x, z: -mean.z } }];
    });
    const { depthMm } = getCanonicalRoomWallFinish(room, wall.id);
    const depth = depthMm > 0 ? depthMm : WALL_FINISH_SKIN_MM;
    // In front of the neighbouring straight walls' faces too: an inside corner's true corner is where the faces cross.
    const neighbourFaces = [edges[(index - 1 + edges.length) % edges.length], edges[(last + 1) % edges.length]].map((neighbourId) => {
      const neighbour = floor.walls.find(({ id }) => id === neighbourId);
      const neighbourSide = neighbour?.roomSides.find(({ roomId }) => roomId === room.id)?.side;
      if (!neighbour || !neighbourSide || neighbour.path.kind !== "line") return null;
      const neighbourDepth = getCanonicalRoomWallFinish(room, neighbour.id).depthMm;
      return { ...faceLine(neighbour, neighbourSide), depth: (neighbourDepth > 0 ? neighbourDepth : WALL_FINISH_SKIN_MM) / 1000 };
    });
    const neighbours = neighbourFaces.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    // At an outside corner the faces meet on the mitre from where their bare faces cross to where their fronts do, so near it
    // the floor in front of the deeper panel beyond the shallower one's depth is the mitre's open side.
    const pastCorner = (offset: number, position: number) =>
      (outsideAt(index) && position < 1 && offset > (neighbourFaces[0]?.depth ?? Infinity)) ||
      (outsideAt((last + 1) % outline.length) && position > chord - 1 && offset > (neighbourFaces[1]?.depth ?? Infinity));
    for (const solid of wall.solids.filter((entry) => entry.bottomMm <= wall.baseOffsetMm + 0.5)) {
      const [bare, front] = [wallSurfaceEdge(solid, side, 0), wallSurfaceEdge(solid, side, depth)];
      const length = Math.hypot(bare.end.x - bare.start.x, bare.end.z - bare.start.z);
      for (let step = 0.0005; step < length; step += 0.002) {
        const t = step / length;
        for (const deep of [0.3, 0.7]) {
          const point = { x: bare.start.x + (bare.end.x - bare.start.x) * t + (front.start.x - bare.start.x) * deep,
            z: bare.start.z + (bare.end.z - bare.start.z) * t + (front.start.z - bare.start.z) * deep };
          // Covered: in a panel, or on the joint between two (a point on a shared edge can fall outside both by rounding).
          if (panels.some(({ quad }) => inside(point, quad))) continue;
          const position = (point.x - from.x) * along.x + (point.z - from.z) * along.z;
          if (position < low || position > high || !inside(point, outline) || footprints.some(({ quad }) => inside(point, quad))) continue;
          // (at least half a millimetre in front: a sample on the line itself is the corner's own rounding)
          if ([...neighbours, ...mitres].some(({ at, normal }) => (point.x - at.x) * normal.x + (point.z - at.z) * normal.z < 0.0005)) continue;
          if (pastCorner((depth / 1000) * deep, position)) continue;
          const nearest = Math.min(...footprints.filter((entry) => entry.wallId !== wall.id).map(({ quad }) => boundaryDistance(point, quad)));
          if (nearest * 1000 <= tolerance.coverMm || panels.some(({ quad }) => boundaryDistance(point, quad) < 0.0001)) continue;
          uncovered = Math.max(uncovered, nearest * 1000);
        }
      }
    }
  });
  note(stats, "uncoveredMm", uncovered, 0, label);
}

/** `count` seeded plans across the shapes, each with an address transform, measured. */
export function runImportedPanelCornerProperties(count: number, seed = 20261031): CornerStats {
  const random = seeded(seed);
  const stats: CornerStats = { plans: 0, skipped: 0, rooms: 0, panels: 0, kinds: {}, worst: {}, failing: {}, failingByKind: {}, failures: [],
    clampLimit: {} };
  const transforms = ["normal", "rotate_90", "mirror_x", "mirror_x_rotate_270"];
  for (let index = 0; index < count; index += 1) {
    const shape = SHAPES[SHAPE_KINDS[index % SHAPE_KINDS.length]](random);
    const document = planFromShape(`corners-${index}`, shape, random);
    try {
      checkPlan(document, shape.kind, random, stats, random.pick(transforms));
    } catch (error) {
      // A random arc whose centre can't sit on whole millimetres within 0.5 mm of both ends fails the plan's validation: skipped.
      if ((error as Error).message.includes("failed validation")) stats.skipped += 1;
      else note(stats, "threw", 1, 0, `corners-${index} ${shape.kind} ${(error as Error).message}`);
    }
  }
  return stats;
}
