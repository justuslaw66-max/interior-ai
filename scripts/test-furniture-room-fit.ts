import assert from "node:assert/strict";
import { WALL_FINISH_SKIN_MM } from "../components/editor/renderers/canonical-floor-plan/geometry";
import { buildHousePlan2D } from "../lib/design-page-house-plan";
import { getFurnitureWallInset, isPlacedItemInsideRoomPolygon } from "../lib/design-page-geometry";
import type { FloorPlanDocumentV2 } from "../lib/floor-plan-document-v2";
import { canonicalFloorPlanToDesignSnapshot } from "../lib/floor-plan-legacy-adapters";
import { buildCanonicalFloorPlanRenderModel } from "../lib/floor-plan-render-model";
import { IMPORTED_PAINT_SKIN_METERS } from "../lib/furniture-faces-as-drawn";
import { getFurnitureFaces, getTurnedFootprint } from "../lib/furniture-room-fit";
import { clampToRoomInsideFinishes, getRoomOutlineInsideFinishes } from "../lib/room-finished-outline";
import { clampToCustomPolygonRoom } from "../lib/room-polygon-fit";
import { createRoom, type RoomSnapshot } from "../lib/room-types";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "../lib/room-wall-finish-depths";
import { inRegion, regionOf, type Region } from "./built-in-faces-oracle-utils";
import { planFromShape, roomPanels, seeded, type ShapeSpec } from "./fixtures/imported-panel-corners";

/**
 * Furniture in drawn and imported rooms keeps its real (turned) footprint inside the room's finished faces and 2 cm off every
 * one, and off every wall and panel the 3D view draws past them (lib/furniture-room-fit.ts; J, 1 Nov 2026: "proceed with what u
 * will recommend is best for real life appliciation"). Worked examples first, each set against what the clamp's nine-point box
 * test alone (the line's clamp) does there; then a seeded oracle of drawn rooms against the room as their 3D view draws it
 * (scripts/built-in-faces-oracle-utils.ts: wall bands, panel boxes, columns). Imported rooms are measured against their 3D
 * walls and laminates by the panel-corner property test (scripts/test-floor-plan-canonical-finishes-openings.ts). CI runs 40
 * random rooms; FURNITURE_ORACLE_ROOMS any number, FURNITURE_ORACLE_SEED another seed.
 */

type P = { x: number; z: number };
const CLEAR = 0.02;
const LAMINATE = { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf" as const, boardThicknessMm: 18, fixing: "battens" as const } };
const PAINT = { paintColorHex: "#ffffff" };

const distanceToSegment = (point: P, a: P, b: P) => {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length)) : 0;
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
};
const side = (a: P, b: P, c: P) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const crosses = (a: P, b: P, c: P, d: P) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
const insideRing = (point: P, ring: readonly P[]) => ring.reduce((inside, current, index) => {
  const previous = ring[(index + ring.length - 1) % ring.length];
  return current.z > point.z !== previous.z > point.z && point.x < ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x ? !inside : inside;
}, false);
/** The gap between a footprint and a ring's edges: none where they cross or one holds the other's corner. */
function gapToRing(footprint: readonly P[], ring: readonly P[]): number {
  if (footprint.some((point) => insideRing(point, ring)) || ring.some((point) => insideRing(point, footprint))) return 0;
  let gap = Infinity;
  footprint.forEach((a, i) => ring.forEach((c, j) => {
    const b = footprint[(i + 1) % footprint.length], d = ring[(j + 1) % ring.length];
    gap = crosses(a, b, c, d) ? 0 : Math.min(gap, distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
  }));
  return gap;
}
/** The gap from a footprint to the 3D view's solids of a drawn room (Infinity past them all), or -1 out of its region. */
function gapInRegion(region: Region, footprint: readonly P[]): number {
  if (!footprint.every((point) => inRegion(region, point))) return -1;
  let gap = Infinity;
  for (const { a, b } of region.edges) footprint.forEach((c, i) => {
    const d = footprint[(i + 1) % footprint.length];
    gap = crosses(a, b, c, d) ? 0 : Math.min(gap, distanceToSegment(c, a, b), distanceToSegment(d, a, b), distanceToSegment(a, c, d), distanceToSegment(b, c, d));
  });
  return gap;
}

function drawnRoom(id: string, points: P[], faces: Record<string, object>, thickness = 0.12, holes?: P[][]): RoomSnapshot {
  const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
  const geometry = { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), wallThickness: thickness, height: 2.6, slabThickness: 0.1 };
  return { ...createRoom(id, id, "living", geometry), planShape: "custom_polygon", planPolygon: points, planHoles: holes,
    surfaces: { walls: { default: PAINT, faces } } } as RoomSnapshot;
}
/** Where the room's clamp puts the item, and where the line's (its box's nine points alone) would. */
function clampBoth(room: RoomSnapshot, target: P, width: number, depth: number, rotationY: number) {
  const inset = getFurnitureWallInset(room.geometry.wallThickness ?? 0.12), depths = getRoomWallFinishDepths(room);
  const outline = getRoomOutlineInsideFinishes({ shape: "custom_polygon", polygon: room.planPolygon, holes: room.planHoles,
    w: room.geometry.width, d: room.geometry.depth }, depths).polygon!;
  const [cos, sin] = [Math.abs(Math.cos(rotationY)), Math.abs(Math.sin(rotationY))], [boxW, boxD] = [width * cos + depth * sin, width * sin + depth * cos];
  const at = clampToRoomInsideFinishes(target.x, target.z, width, depth, room.geometry.width, room.geometry.depth, inset, rotationY,
    "custom_polygon", room.planPolygon, room.planHoles, depths);
  const line = clampToCustomPolygonRoom(target.x, target.z, boxW, boxD, inset, outline, room.planHoles ?? [], { minX: -9, maxX: 9, minZ: -9, maxZ: 9 });
  const item = { width, depth, rotationY, clearance: CLEAR };
  const placed = isPlacedItemInsideRoomPolygon(at[0], at[1], boxW, boxD, inset, outline, room.planHoles ?? [], item);
  return { at, line, placed, footprint: getTurnedFootprint(at[0], at[1], width, depth, rotationY), lineFootprint: getTurnedFootprint(line[0], line[1], width, depth, rotationY) };
}

// --- A turned L, at its outside corner ---------------------------------------------------------------------------------------
{
  const turn = 0.6, L: P[] = [{ x: -2.5, z: -2 }, { x: 2.5, z: -2 }, { x: 2.5, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2.5, z: 2 }];
  const points = L.map(({ x, z }) => ({ x: x * Math.cos(turn) - z * Math.sin(turn), z: x * Math.sin(turn) + z * Math.cos(turn) }));
  const room = drawnRoom("turned-l", points, { "wall-2": LAMINATE, "wall-3": LAMINATE });
  const region = regionOf(room), corner = points[3];
  const { placed, footprint, lineFootprint } = clampBoth(room, corner, 1, 0.5, 0);
  assert.ok(gapInRegion(region, lineFootprint) < CLEAR - 0.005, "the box test alone lets the item reach into the outside corner's panels");
  assert.ok(placed && gapInRegion(region, footprint) >= CLEAR - 0.0002, `a turned L's outside corner: 2 cm off (${gapInRegion(region, footprint)})`);
  assert.ok(Math.hypot(footprint[0].x - lineFootprint[0].x, footprint[0].z - lineFootprint[0].z) < 0.3, "the nearest place that fits");
}

// --- A thin spike, painted and panelled --------------------------------------------------------------------------------------
{
  const points: P[] = [{ x: -2.5, z: -2 }, { x: 0, z: -2 }, { x: 0.01, z: -0.4 }, { x: 0.02, z: -2 }, { x: 2.5, z: -2 }, { x: 2.5, z: 2 }, { x: -2.5, z: 2 }];
  const room = drawnRoom("spike", points, { "wall-1": LAMINATE, "wall-2": LAMINATE });
  const region = regionOf(room);
  const { line, placed, footprint, lineFootprint } = clampBoth(room, { x: 0.01, z: -0.9 }, 1.8, 0.9, 0);
  assert.ok(gapInRegion(region, lineFootprint) < 0, `the box test alone straddles the spike (${line})`);
  assert.ok(placed && gapInRegion(region, footprint) >= CLEAR - 0.0002, `beside a thin spike: 2 cm off (${gapInRegion(region, footprint)})`);
}

// --- A column by a turned L's outside corner, and a column's own corners ------------------------------------------------------
{
  // The line tests an item's box against a column's outline whole (polygonIntersectsFootprint), so a column's corners never let
  // it in; at the room's outside corner beside the column they still did.
  const turn = 0.6, L: P[] = [{ x: -2.5, z: -2 }, { x: 2.5, z: -2 }, { x: 2.5, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2.5, z: 2 }];
  const at = (x: number, z: number) => ({ x: x * Math.cos(turn) - z * Math.sin(turn), z: x * Math.sin(turn) + z * Math.cos(turn) });
  const column = [at(0.3, -0.6), at(0.6, -0.6), at(0.6, -0.3), at(0.3, -0.3)];
  const room = drawnRoom("column", L.map(({ x, z }) => at(x, z)), { "wall-2": LAMINATE, "wall-3": LAMINATE }, 0.12, [column]);
  const region = regionOf(room);
  const corner = clampBoth(room, at(-0.2, 0.3), 1, 0.5, 0);
  assert.ok(gapInRegion(region, corner.lineFootprint) < CLEAR - 0.005, "the box test alone reaches into the outside corner by the column");
  assert.ok(corner.placed && gapInRegion(region, corner.footprint) >= CLEAR - 0.0002, `by a column at an outside corner: 2 cm off (${gapInRegion(region, corner.footprint)})`);
  for (const rotationY of [0, Math.PI / 4]) {
    const own = clampBoth(room, at(0.45, -0.1), 1.8, 0.9, rotationY);
    if (gapInRegion(region, own.lineFootprint) >= CLEAR) assert.deepEqual(own.at, own.line, "clear of the column already: the line's place");
    assert.ok(own.placed && gapInRegion(region, own.footprint) >= CLEAR - 0.0002, `against a column's corner: 2 cm off (${gapInRegion(region, own.footprint)})`);
  }
}

// --- Imported plans: an arc bowing in, a spike, and the painted half of a T --------------------------------------------------
function importedRooms(spec: ShapeSpec, seed: number, finish: (wallId: string) => object) {
  const document = planFromShape(`example-${spec.kind}`, spec, seeded(seed)) as FloorPlanDocumentV2;
  const { snapshot, scene } = canonicalFloorPlanToDesignSnapshot(document);
  const rooms = snapshot.rooms.map((room) => ({ ...room, surfaceFinishes: undefined, surfaces: { walls: { default: PAINT,
    faces: Object.fromEntries((room.planEdgeWallIds ?? []).map((wallId) => [wallId, finish(wallId)])) } } }) as RoomSnapshot);
  const floor = buildCanonicalFloorPlanRenderModel(scene).floors[0], planRooms = buildHousePlan2D(rooms, 8, 6).rooms;
  return { document, rooms, floor, planRooms };
}
/** The item's least gap to the room's laminates and walls as its 3D view draws them, in plan metres. */
function importedGap(setup: ReturnType<typeof importedRooms>, room: RoomSnapshot, footprint: readonly P[]): number {
  const origin = room.planPosition ?? { x: 0, z: 0 }, world = footprint.map(({ x, z }) => ({ x: x + origin.x, z: z + origin.z }));
  const planRoom = setup.planRooms.find(({ id }) => id === room.id)!;
  const laminates = roomPanels(setup.floor, planRoom).filter(({ depth }) => depth > WALL_FINISH_SKIN_MM / 1000 + 1e-9).map(({ quad }) => quad);
  const walls = setup.floor.walls.flatMap((wall) => wall.solids.map(({ footprint: f }) => [f.startLeft, f.endLeft, f.endRight, f.startRight]
    .map(({ xMm, zMm }) => ({ x: xMm / 1000, z: zMm / 1000 }))));
  return Math.min(...[...laminates, ...walls].map((ring) => gapToRing(world, ring)));
}
{
  // The east wall an arc 2.7 m in radius bowing 0.9 m into the room, panelled, in a plan square to the axes: the room's outline
  // takes nine chords of it (each standing up to 12 mm off it), the 3D view seventeen slices.
  const spec: ShapeSpec = { kind: "arc-in", vertices: { a: [0, 0], b: [6000, 0], c: [6000, 4000], e: [0, 4000] }, rooms: { R: ["a", "b", "c", "e"] },
    arcs: { "b>c": { centre: [7832, 2000], clockwise: true } } };
  const setup = importedRooms(spec, 1951, (wallId) => (wallId === "w-b-c" ? LAMINATE : PAINT));
  const room = setup.rooms[0], polygon = room.planPolygon!, arc = (room.planEdgeWallIds ?? []).flatMap((wallId, index) => (wallId === "w-b-c" ? [index] : []));
  assert.equal(arc.length, 9, "nine chords");
  // A sofa end on against the fourth chord, a third of the way along it.
  const [a, b] = [polygon[arc[3]], polygon[arc[4]]];
  const { line, placed, footprint, lineFootprint } = clampBoth(room, { x: a.x + (b.x - a.x) * 0.3, z: a.z + (b.z - a.z) * 0.3 }, 1, 0.5, Math.PI / 2);
  assert.ok(importedGap(setup, room, lineFootprint) < CLEAR - 0.006, `on the arc's chords alone, nearer the panel (${line}: ${importedGap(setup, room, lineFootprint)})`);
  const gap = importedGap(setup, room, footprint);
  assert.ok(placed && gap >= CLEAR - 0.001 && gap <= CLEAR + 0.005, `an arc bowing in: 2 cm off its true curve (${gap})`);
}
{
  // A spike 1.8 m long and 10° across, panelled both sides.
  const half = 1800 * Math.tan((5 * Math.PI) / 180);
  const spec: ShapeSpec = { kind: "spike", vertices: { a: [0, 0], s0: [2500 - half, 0], tip: [2500, 1800], s1: [2500 + half, 0], b: [5000, 0], c: [5000, 4000], e: [0, 4000] },
    rooms: { R: ["a", "s0", "tip", "s1", "b", "c", "e"] } };
  const setup = importedRooms(spec, 5, (wallId) => (wallId.includes("tip") ? LAMINATE : PAINT));
  const room = setup.rooms[0], tip = room.planPolygon![2];
  const { line, placed, footprint, lineFootprint } = clampBoth(room, tip, 1, 0.5, 0);
  assert.ok(importedGap(setup, room, lineFootprint) < 0.01, `the box test alone comes into the spike's panels (${line})`);
  const gap = importedGap(setup, room, footprint);
  assert.ok(placed && gap >= CLEAR - 0.0005, `at a thin spike's tip: 2 cm off (${gap})`);
}
{
  // A T: room N's south side is the through wall in two plan walls, split where the stem meets it; one half panelled.
  const spec: ShapeSpec = { kind: "t", vertices: { p1: [-4000, -3000], p2: [4000, -3000], p3: [4000, 0], p4: [4000, 3000], p5: [0, 3000],
    p6: [-4000, 3000], p7: [-4000, 0], j: [0, 0] }, rooms: { N: ["p1", "p2", "p3", "j", "p7"], W: ["p7", "j", "p5", "p6"], E: ["j", "p3", "p4", "p5"] },
    sameWall: [["p7>j", "j>p3"]] };
  const setup = importedRooms(spec, 1951, (wallId) => (wallId === "w-p3-j" ? LAMINATE : PAINT));
  const room = setup.rooms.find(({ id }) => id === "N")!, ids = room.planEdgeWallIds ?? [];
  const painted = ids.indexOf("w-j-p7"), [from, to] = [room.planPolygon![painted], room.planPolygon![(painted + 1) % ids.length]];
  const middle = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
  const { at, line, placed, footprint } = clampBoth(room, middle, 0.4, 0.4, 0);
  // It stands where the line puts it: the clamp's outline leans the painted half from the panel's depth at the T to its own at
  // the far corner (#256's open case), which keeps it clear, so the exact test keeps the line's place.
  assert.deepEqual(at, line, "the painted half of a T: the line's place, kept");
  const gap = importedGap(setup, room, footprint);
  assert.ok(placed && gap >= CLEAR, `the painted half of a T: ${(gap * 1000).toFixed(1)} mm off`);
  console.log(`The painted half of a T: the item stands ${(gap * 1000).toFixed(1)} mm off, where the line puts it.`);
}

// --- The noted edges follow the room ------------------------------------------------------------------------------------------
{
  // The outline's array is kept when a finish changes; the faces follow the new finish (the panel's box past an outside corner).
  const points: P[] = [{ x: -2, z: -2 }, { x: 0, z: -2 }, { x: 0.6, z: -1 }, { x: 2, z: -1 }, { x: 2, z: 2 }, { x: -2, z: 2 }];
  const panelled = drawnRoom("swap", points, { "wall-1": LAMINATE }), painted = { ...panelled, surfaces: { walls: { default: PAINT, faces: {} } } } as RoomSnapshot;
  const facesOf = (room: RoomSnapshot) => {
    const depths = getRoomWallFinishDepths(room);
    const outline = getRoomOutlineInsideFinishes({ shape: "custom_polygon", polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth }, depths).polygon!;
    return getFurnitureFaces(outline, getFurnitureWallInset(0.12), CLEAR);
  };
  const before = facesOf(panelled), after = facesOf(painted);
  assert.equal(painted.planPolygon, panelled.planPolygon, "one outline array");
  // At the outside corner the walls' cores run on past each other's faces either way; the panel's box goes with its finish.
  assert.ok(after.solids.length > 0 && before.solids.length > after.solids.length, "a panel's box past the corner, then none once it is painted");
}

assert.equal(IMPORTED_PAINT_SKIN_METERS, WALL_FINISH_SKIN_MM / 1000, "the imported view's skin");

// --- Drawn rooms against their 3D view ----------------------------------------------------------------------------------------
let state = Number(process.env.FURNITURE_ORACLE_SEED ?? 20261101) >>> 0;
function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state ^ (state >>> 15), 1 | state);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
const between = (low: number, high: number) => low + (high - low) * random();
const chance = (probability: number) => random() < probability;
const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
const box = (w: number, d: number): P[] => [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }, { x: w / 2, z: d / 2 }, { x: -w / 2, z: d / 2 }];
const north = (w: number, d: number, middle: (z: number) => P[], east?: P): P[] => { const [a, b, c, e] = box(w, d); return [a, ...middle(a.z), east ?? b, c, e]; };
const SHAPES: Record<string, (w: number, d: number) => P[]> = {
  rectangle: box,
  l: (w, d) => { const [cw, cd] = [between(0.2, 0.7) * w, between(0.2, 0.7) * d]; return [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }, { x: w / 2, z: d / 2 - cd }, { x: w / 2 - cw, z: d / 2 - cd }, { x: w / 2 - cw, z: d / 2 }, { x: -w / 2, z: d / 2 }]; },
  bend: (w, d) => { const at = between(-0.3, 0.3) * w, half = (between(0, 25) * Math.PI) / 180, s = chance(0.5) ? 1 : -1; return north(w, d, (z) => [{ x: at, z: z + s * Math.tan(half) * Math.min(at + w / 2, w / 2 - at) }]); },
  arc: (w, d) => { const sag = between(0.1, 0.8) * (chance(0.5) ? 1 : -1), r = (sag * sag + (w / 2) ** 2) / (2 * Math.abs(sag)); return north(w, d, (z) => Array.from({ length: 31 }, (_, i) => { const x = -w / 2 + (w * (i + 1)) / 32; return { x, z: z - Math.sign(sag) * (Math.sqrt(r * r - x * x) - (r - Math.abs(sag))) }; })); },
  spike: (w, d) => { const at = between(-0.4, 0.4) * w, length = between(0.03, 0.8) * (chance(0.5) ? 1 : -1), width = chance(0.5) ? 0 : between(0.01, 0.4); return north(w, d, (z) => [{ x: at, z }, { x: at, z: z + length }, ...(width ? [{ x: at + width, z: z + length }] : []), { x: at + width, z }]); },
  "v spike": (w, d) => { const at = between(-0.3, 0.3) * w, length = between(0.2, 1.2), half = between(0.02, 0.4); return north(w, d, (z) => [{ x: at - half, z }, { x: at, z: z + length }, { x: at + half, z }]); },
  wedge: (w) => { const half = (between(2.5, 20) * Math.PI) / 180; return [{ x: -w / 2, z: 0 }, { x: w / 2, z: -w * Math.tan(half) }, { x: w / 2, z: w * Math.tan(half) }]; },
  chamfer: (w, d) => north(w, d, () => [{ x: w / 2 - between(0.001, 0.3), z: -d / 2 }], { x: w / 2, z: -d / 2 + between(0.001, 0.3) }),
  jog: (w, d) => { const at = between(-0.4, 0.4) * w, step = between(0.001, 0.1) * (chance(0.5) ? 1 : -1); return north(w, d, (z) => [{ x: at, z }, { x: at, z: z + step }], { x: w / 2, z: -d / 2 + step }); },
  star: (w) => Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5, r = i % 2 ? w / 2 : (w / 2) * between(0.35, 0.8); return { x: r * Math.cos(a), z: r * Math.sin(a) }; }),
};
const ITEMS: Array<[number, number]> = [[0.4, 0.4], [1, 0.5], [0.5, 1], [1.8, 0.9], [0.12, 0.12]];
const TURNS = [0, 0.3, Math.PI / 4, Math.PI / 2, 2.1];
const ROOMS = Number(process.env.FURNITURE_ORACLE_ROOMS ?? 40);
const counts = { rooms: 0, placed: 0, worstMm: 0 };
for (let index = 0; index < ROOMS; index += 1) {
  const family = pick(Object.keys(SHAPES)), angle = chance(0.5) ? between(0, 2 * Math.PI) : 0;
  let points = SHAPES[family](between(1.2, 6), between(1.2, 5)).map(({ x, z }) => ({ x: x * Math.cos(angle) - z * Math.sin(angle), z: x * Math.sin(angle) + z * Math.cos(angle) }));
  if (chance(0.5)) points = [...points].reverse();
  const faces = Object.fromEntries(getRoomWallFaceIds({ shape: "custom_polygon", polygon: points }).filter(() => chance(0.45)).map((faceId) => [faceId,
    { materialId: LAMINATE.materialId, panelBacking: { board: "mdf" as const, boardThicknessMm: pick([6, 9, 12, 18]), fixing: pick(["glued", "battens"] as const) } }]));
  const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
  const column = chance(0.2) ? box(between(0.15, 0.4), between(0.15, 0.4)).map((p) => ({ x: p.x + between(-0.2, 0.2) * (Math.max(...xs) - Math.min(...xs)), z: p.z + between(-0.2, 0.2) * (Math.max(...zs) - Math.min(...zs)) })) : null;
  const room = drawnRoom(`oracle-${index}`, points, faces, pick([0.08, 0.1, 0.12, 0.15, 0.2, 0.25]), column ? [column] : undefined);
  const region = regionOf(room);
  if (region.filled) continue;
  counts.rooms += 1;
  const targets: P[] = [...points, ...points.map((p, i) => ({ x: (p.x + points[(i + 1) % points.length].x) / 2, z: (p.z + points[(i + 1) % points.length].z) / 2 })),
    ...Array.from({ length: 8 }, () => ({ x: between(Math.min(...xs) - 0.3, Math.max(...xs) + 0.3), z: between(Math.min(...zs) - 0.3, Math.max(...zs) + 0.3) }))];
  for (const target of targets) for (const [width, depth] of ITEMS) for (const rotationY of TURNS) {
    const { at, placed, footprint } = clampBoth(room, target, width, depth, rotationY);
    if (!placed) continue;
    counts.placed += 1;
    const gap = gapInRegion(region, footprint);
    counts.worstMm = Math.max(counts.worstMm, (CLEAR - gap) * 1000);
    assert.ok(gap >= CLEAR - 0.0002, `${family} room ${index}: a ${width} × ${depth} item turned ${rotationY.toFixed(2)} for (${target.x.toFixed(3)}, ${target.z.toFixed(3)}) at (${at[0].toFixed(4)}, ${at[1].toFixed(4)}) stands ${(gap * 1000).toFixed(2)} mm off the 3D view's walls and panels`);
  }
}
assert.ok(counts.placed > ROOMS * 100, "placements to measure");
console.log(`Furniture in drawn rooms: ${counts.rooms} rooms, ${counts.placed} placements, at most ${Math.max(0, counts.worstMm).toFixed(3)} mm nearer than 2 cm.`);
console.log("Furniture room fit checks passed.");
