import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { WALL_FINISH_SKIN_MM } from "../components/editor/renderers/canonical-floor-plan/geometry";
import { buildHousePlan2D } from "../lib/design-page-house-plan";
import { getFurnitureWallInset } from "../lib/design-page-geometry";
import type { FloorPlanDocumentV2 } from "../lib/floor-plan-document-v2";
import { canonicalFloorPlanToDesignSnapshot } from "../lib/floor-plan-legacy-adapters";
import { buildCanonicalFloorPlanRenderModel, type CanonicalFloorPlanRenderModel } from "../lib/floor-plan-render-model";
import { getFurnitureRoomContext } from "../lib/furniture-room-context";
import { getFurnitureFaces, getTurnedFootprint } from "../lib/furniture-room-fit";
import { clampBuiltInToRoom } from "../lib/room-built-in-faces";
import { clampToRoomInsideFinishes, getRoomOutlineInsideFinishes } from "../lib/room-finished-outline";
import { createRoom, type RoomSnapshot } from "../lib/room-types";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "../lib/room-wall-finish-depths";
import { isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";
import type { HousePlanRoom2D } from "../lib/design-page-house-plan";
import { inRegion, regionOf, toPlanRoom, type Region } from "./built-in-faces-oracle-utils";
import { planFromShape, roomPanels, seeded, type ShapeSpec } from "./fixtures/imported-panel-corners";

/**
 * Furniture in drawn and imported rooms keeps its real (turned) footprint 2 cm off every wall, panel and column as the room's
 * 3D view draws them, the rooms next door's walls included, and no further (lib/furniture-room-fit.ts; J, 1 Nov 2026: "proceed
 * with what u will recommend is best for real life appliciation"): where the line's clamp leaves it that clear it stays, where
 * not it goes to the nearest place that is, and containment accepts exactly what is. Built-ins keep the line's clamp. Worked
 * examples first, each set against the line's clamp (the same, without the furniture's room); then a seeded oracle of drawn
 * rooms, some beside a room with thicker walls, against the room as their 3D view draws it (scripts/built-in-faces-oracle-utils.ts:
 * wall bands, panel boxes, columns), with brute-force checks that a moved item went to the nearest place the 3D view leaves
 * clear and that one refused had no such place near. Imported rooms are measured against their 3D walls and laminates, both
 * ways, by the panel-corner property test (scripts/test-floor-plan-canonical-finishes-openings.ts). CI runs 40 random rooms;
 * FURNITURE_ORACLE_ROOMS any number, FURNITURE_ORACLE_SEED another seed, FURNITURE_ORACLE_FINE=1 the brute force finer.
 */

type P = { x: number; z: number };
type Floor = CanonicalFloorPlanRenderModel["floors"][number];
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
/**
 * The gap from a footprint to the 3D view's solids of a drawn room (Infinity past them all), or -1 out of its region; none where
 * a solid's corner is inside it (a column it stands over whole).
 */
function gapInRegion(region: Region, footprint: readonly P[]): number {
  if (!footprint.every((point) => inRegion(region, point))) return -1;
  let gap = Infinity;
  for (const { a, b } of region.edges) if (insideRing(a, footprint) || insideRing(b, footprint)) return 0;
  for (const { a, b } of region.edges) footprint.forEach((c, i) => {
    const d = footprint[(i + 1) % footprint.length];
    gap = crosses(a, b, c, d) ? 0 : Math.min(gap, distanceToSegment(c, a, b), distanceToSegment(d, a, b), distanceToSegment(a, c, d), distanceToSegment(b, c, d));
  });
  return gap;
}

const box = (w: number, d: number): P[] => [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }, { x: w / 2, z: d / 2 }, { x: -w / 2, z: d / 2 }];
function drawnRoom(id: string, points: P[], faces: Record<string, object>, thickness = 0.12, holes?: P[][]): RoomSnapshot {
  const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
  const geometry = { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs), wallThickness: thickness, height: 2.6, slabThickness: 0.1 };
  return { ...createRoom(id, id, "living", geometry), planShape: "custom_polygon", planPolygon: points, planHoles: holes,
    surfaces: { walls: { default: PAINT, faces } } } as RoomSnapshot;
}
/** The plan's rooms: the room at the origin, and those next door where they stand. */
const planOf = (room: RoomSnapshot, neighbours: readonly HousePlanRoom2D[] = []) =>
  new Map<string, HousePlanRoom2D>([[room.id, toPlanRoom(room)], ...neighbours.map((other): [string, HousePlanRoom2D] => [other.id, other])]);
/** Where the room's furniture clamp puts the item, where the line's would (the same clamp, without the room), and containment. */
function clampBoth(room: RoomSnapshot, target: P, width: number, depth: number, rotationY: number, planRooms = planOf(room), floors?: Floor[]) {
  const inset = getFurnitureWallInset(room.geometry.wallThickness ?? 0.12), depths = getRoomWallFinishDepths(room);
  const args = [width, depth, room.geometry.width, room.geometry.depth, inset, rotationY, "custom_polygon", room.planPolygon, room.planHoles, depths] as const;
  const at = clampToRoomInsideFinishes(target.x, target.z, ...args, getFurnitureRoomContext(room, planRooms, floors));
  const line = clampToRoomInsideFinishes(target.x, target.z, ...args);
  const canonicalModel = floors && ({ floors } as unknown as CanonicalFloorPlanRenderModel);
  const contained = (place: P) => isPlacementContainedInRoom({ room, position: [place.x, 0, place.z], rotationY, dimensions: { w: width * 1000, d: depth * 1000 }, planRooms, canonicalModel });
  return { at, line, placed: contained({ x: at[0], z: at[1] }), contained, footprint: getTurnedFootprint(at[0], at[1], width, depth, rotationY),
    lineFootprint: getTurnedFootprint(line[0], line[1], width, depth, rotationY) };
}
/** The nearest place within `reach` of the target, on rings `step` apart, where `clear` holds, or null. */
function nearestBrute(target: P, reach: number, step: number, clear: (place: P) => boolean): P | null {
  for (let radius = 0; radius <= reach; radius += step) {
    const count = Math.max(8, Math.ceil((2 * Math.PI * radius) / step));
    for (let index = 0; index < count; index += 1) {
      const place = { x: target.x + radius * Math.cos((2 * Math.PI * index) / count), z: target.z + radius * Math.sin((2 * Math.PI * index) / count) };
      if (clear(place)) return place;
    }
  }
  return null;
}
const turned = (place: P, width: number, depth: number, rotationY: number) => getTurnedFootprint(place.x, place.z, width, depth, rotationY);

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
function importedRooms(spec: ShapeSpec, seed: number, finish: (wallId: string) => object, openings: object[] = []) {
  const document = planFromShape(`example-${spec.kind}`, spec, seeded(seed)) as FloorPlanDocumentV2;
  const provenance = document.floors[0].walls[0].provenance;
  document.floors[0].openings = openings.map((opening) => ({ hinge: "none", handing: "none", operation: "fixed", provenance, ...opening })) as never;
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
  const { line, placed, footprint, lineFootprint } = clampBoth(room, { x: a.x + (b.x - a.x) * 0.3, z: a.z + (b.z - a.z) * 0.3 }, 1, 0.5, Math.PI / 2, undefined, [setup.floor]);
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
  const { line, placed, footprint, lineFootprint } = clampBoth(room, tip, 1, 0.5, 0, undefined, [setup.floor]);
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
  const { at, line, placed, footprint } = clampBoth(room, middle, 0.4, 0.4, 0, undefined, [setup.floor]);
  // It stands where the line puts it: the clamp's outline leans the painted half from the panel's depth at the T to its own at
  // the far corner (#256's open case), which keeps it clear, so the exact test keeps the line's place.
  assert.deepEqual(at, line, "the painted half of a T: the line's place, kept");
  const gap = importedGap(setup, room, footprint);
  assert.ok(placed && gap >= CLEAR, `the painted half of a T: ${(gap * 1000).toFixed(1)} mm off`);
  console.log(`The painted half of a T: the item stands ${(gap * 1000).toFixed(1)} mm off, where the line puts it.`);
}

{
  // An imported room with a door and a window (J, 2 Nov 2026: furniture never stands in a wall's thickness, a reveal included).
  // Pushed into either opening, a sideboard stops 2 cm off the wall's face line there, as the line's box clamp does, and one with
  // its back in the reveal is refused (a floor with only the slices standing on it let it in, up to the centre line).
  const spec: ShapeSpec = { kind: "rect", vertices: { a: [0, 0], b: [5000, 0], c: [5000, 4000], e: [0, 4000] }, rooms: { R: ["a", "b", "c", "e"] } };
  const setup = importedRooms(spec, 1951, () => PAINT, [
    { id: "door", wallId: "w-a-b", kind: "door", operation: "swing", offsetMm: 1500, widthMm: 800, hinge: "start", handing: "left" },
    { id: "window", wallId: "w-b-c", kind: "window", offsetMm: 1200, widthMm: 1000, heightMm: 1200, sillHeightMm: 900 },
  ]);
  const room = setup.rooms[0], origin = room.planPosition ?? { x: 0, z: 0 }, floorPlan = setup.document.floors[0];
  const vertex = (id: string) => floorPlan.vertices.find((entry) => entry.id === id)!;
  for (const [wallId, alongMm] of [["w-a-b", 1900], ["w-b-c", 1700]] as const) {
    const wall = floorPlan.walls.find(({ id }) => id === wallId)!, path = wall.path as { startVertexId: string; endVertexId: string };
    const [a, b] = [vertex(path.startVertexId), vertex(path.endVertexId)], length = Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm);
    const [dx, dz] = [(b.xMm - a.xMm) / length, (b.zMm - a.zMm) / length];
    const middle = { x: (a.xMm + dx * alongMm) / 1000 - origin.x, z: (a.zMm + dz * alongMm) / 1000 - origin.z };
    const side = insideRing({ x: middle.x - dz * 0.5, z: middle.z + dx * 0.5 }, room.planPolygon!) ? 1 : -1, [nx, nz] = [-dz * side, dx * side];
    const rotationY = Math.atan2(-nx, -nz), at = (off: number) => ({ x: middle.x + nx * off, z: middle.z + nz * off });
    const { line, placed, footprint, contained } = clampBoth(room, at(-0.3), 1.2, 0.4, rotationY, undefined, [setup.floor]);
    const gap = importedGap(setup, room, footprint), lineGap = importedGap(setup, room, turned({ x: line[0], z: line[1] }, 1.2, 0.4, rotationY));
    assert.ok(lineGap >= CLEAR - 0.0005, `the line's clamp keeps it 2 cm off the ${wallId} wall's face line (${lineGap})`);
    assert.ok(placed && gap >= CLEAR - 0.0005 && gap <= CLEAR + 0.001, `pushed into the ${wallId} opening: 2 cm off its reveal (${gap})`);
    // Its back 50 mm into the reveal (its face half the wall in from the centre line).
    assert.equal(contained(at(wall.thicknessMm / 2000 - 0.05 + 0.2)), false, `a sideboard with its back in the ${wallId} reveal is refused`);
    assert.ok(contained(at(wall.thicknessMm / 2000 + 0.021 + 0.2)), `one 21 mm off the ${wallId} wall's face is accepted`);
  }
}

// --- The edges follow the room, whatever was read before -------------------------------------------------------------------
{
  // The outline's array is kept when a finish changes; each room's faces follow its own finish (the panel's box past an outside
  // corner), read in either order.
  const points: P[] = [{ x: -2, z: -2 }, { x: 0, z: -2 }, { x: 0.6, z: -1 }, { x: 2, z: -1 }, { x: 2, z: 2 }, { x: -2, z: 2 }];
  const panelled = drawnRoom("swap", points, { "wall-1": LAMINATE }), painted = { ...panelled, surfaces: { walls: { default: PAINT, faces: {} } } } as RoomSnapshot;
  const facesOf = (room: RoomSnapshot) => {
    const depths = getRoomWallFinishDepths(room);
    const outline = getRoomOutlineInsideFinishes({ shape: "custom_polygon", polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth }, depths).polygon!;
    return getFurnitureFaces(outline, [], CLEAR, getFurnitureRoomContext(room))!;
  };
  const before = facesOf(panelled), after = facesOf(painted), again = facesOf(panelled);
  assert.equal(painted.planPolygon, panelled.planPolygon, "one outline array");
  // At the outside corner the walls' cores run on past each other's faces either way; the panel's box goes with its finish.
  assert.ok(after.solids.length > 0 && before.solids.length > after.solids.length, "a panel's box past the corner, then none once it is painted");
  assert.equal(again, before, "the panelled room's faces again, after the painted one's were read");
  assert.equal(facesOf(painted), after, "and the painted room's");
}

// --- A thin V spike's tip: as near as the 3D view draws it, not the outline's mitre --------------------------------------
for (const angle of [10, 20, 40]) {
  // A V spike 1.2 m long off a 5 m room's north wall (120 mm walls). The outline's mitre at its tip stands 345 mm past it at
  // 20° (690 mm at 10°); the 3D view's cores end about 60 mm past it.
  const half = 1.2 * Math.tan(((angle / 2) * Math.PI) / 180);
  const points: P[] = [{ x: -2.5, z: -2.5 }, { x: -half, z: -2.5 }, { x: 0, z: -1.3 }, { x: half, z: -2.5 }, { x: 2.5, z: -2.5 }, { x: 2.5, z: 2.5 }, { x: -2.5, z: 2.5 }];
  const room = drawnRoom(`v-${angle}`, points, {}), region = regionOf(room);
  for (const z of [-0.93, -0.85, -0.75, -0.69, -1.1]) {
    const { at, line, placed, contained, footprint } = clampBoth(room, { x: 0, z }, 1, 0.5, 0);
    const clear = (place: P) => gapInRegion(region, turned(place, 1, 0.5, 0)) >= CLEAR + 0.001;
    if (clear({ x: 0, z })) assert.ok(contained({ x: 0, z }), `a ${angle}° spike: a table ${((z + 1.05) * 1000).toFixed(0)} mm past the tip, clear of its 3D walls, is accepted`);
    if (clear({ x: line[0], z: line[1] })) assert.deepEqual(at, line, `a ${angle}° spike: the line's place, clear of its 3D walls, is kept`);
    assert.ok(placed && gapInRegion(region, footprint) >= CLEAR - 0.0002, `a ${angle}° spike: 2 cm off its tip (${gapInRegion(region, footprint)})`);
    const moved = Math.hypot(at[0], at[1] - z), nearer = nearestBrute({ x: 0, z }, moved - 0.008, 0.004, clear);
    assert.equal(nearer, null, `a ${angle}° spike: moved ${(moved * 1000).toFixed(0)} mm, a nearer place is clear (${JSON.stringify(nearer)})`);
  }
}

// --- The thicker walls of the room next door -----------------------------------------------------------------------------
{
  // Room A (120 mm walls) shares its north wall with room B (250 mm walls) to its north: the 3D view draws the shared wall at
  // both thicknesses, so B's core stands 65 mm past A's face. A sofa pushed north stops 2 cm off it.
  const A = drawnRoom("A", box(4, 3), {}), B = drawnRoom("B", box(4, 3), {}, 0.25), next = { ...toPlanRoom(B), z: -3 };
  const region = regionOf(A, [next]), { at, line, placed, footprint, lineFootprint } = clampBoth(A, { x: 0, z: -1.45 }, 1, 0.5, 0, planOf(A, [next]));
  assert.ok(gapInRegion(region, lineFootprint) < 0, `on its own walls alone, it stands in the next room's thicker wall (${line})`);
  const gap = gapInRegion(region, footprint);
  assert.ok(placed && gap >= CLEAR - 0.0002 && gap <= CLEAR + 0.001, `beside the next room's thicker wall: 2 cm off it (${gap})`);
  assert.ok(Math.abs(at[1] - 0.25 - (-1.5 + 0.125 + CLEAR)) < 0.001, `its edge 2 cm off the thicker core (${at[1] - 0.25})`);
  // The same room in the plan alone keeps the line's place.
  assert.deepEqual(clampBoth(A, { x: 0, z: -1.45 }, 1, 0.5, 0).at, line, "alone in its plan: the line's place");
}

// --- Built-ins keep the line's clamp ------------------------------------------------------------------------------------
{
  // An imported room keeps furniture's rule for built-ins (usesFurnitureRuleForBuiltIns): their clamp stays the line's.
  const half = 1800 * Math.tan((5 * Math.PI) / 180);
  const spec: ShapeSpec = { kind: "spike", vertices: { a: [0, 0], s0: [2500 - half, 0], tip: [2500, 1800], s1: [2500 + half, 0], b: [5000, 0], c: [5000, 4000], e: [0, 4000] },
    rooms: { R: ["a", "s0", "tip", "s1", "b", "c", "e"] } };
  const setup = importedRooms(spec, 5, (wallId) => (wallId.includes("tip") ? LAMINATE : PAINT)), room = setup.rooms[0];
  let differ = 0;
  for (const target of room.planPolygon!) for (const [width, depth] of [[0.6, 0.58], [0.45, 0.35]]) for (const rotationY of [0, 0.4, Math.PI / 2]) {
    const { at, line } = clampBoth(room, target, width, depth, rotationY, undefined, [setup.floor]);
    assert.deepEqual(clampBuiltInToRoom(room, target.x, target.z, width, depth, rotationY), line, "a built-in on furniture's rule: the line's clamp");
    if (at[0] !== line[0] || at[1] !== line[1]) differ += 1;
  }
  assert.ok(differ > 0, "where furniture's own clamp moves off the line's place");
}


// --- Every furniture clamp is handed the room: the plan's rooms and an imported plan's walls ---------------------------------
{
  const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
  // A drop into another room: the placement queries' clamp (bound with the plan's rooms and the compiled plan), as its
  // containment is; a bare clampToPlacementRoom(targetRoom, ...) had neither (an imported room got the line's box clamp).
  const drag = read("lib/useDesignPageSceneItemDrag.ts");
  assert.doesNotMatch(drag, /import \{[^}]*\bclampToPlacementRoom\b[^}]*\} from "@\/lib\/useDesignPagePlacementRoomQueries"/, "the drop's clamp is handed in");
  assert.match(drag, /clampToPlacementRoom: ClampToPlacementRoom;/);
  assert.match(read("lib/useDesignPageSceneItemDragRegistration.ts"), /clampToPlacementRoom: placement\.actions\.catalog\.clampToCatalogPlacementRoom/);
  assert.match(read("lib/useDesignPagePlacementRoomQueries.ts"), /clampToPlacementRoom\(room, x, z, itemWidth, itemDepth, rotationY, houseRoomById, canonicalModel\?\.floors\)/);
  // Nothing else calls the placement clamp, or the inside-finishes clamp without furniture's room, but built-ins.
  const sources = (dir: string): string[] => readdirSync(join(__dirname, "..", dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(__dirname, "..", path)).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
  const callers = ["lib", "components", "features", "app"].flatMap(sources).filter((path) => /\bclampToPlacementRoom\(/.test(read(path)));
  assert.deepEqual(callers.sort(), ["lib/useDesignPagePlacementRoomQueries.ts", "lib/useDesignPageSceneItemDrag.ts"], "the placement clamp's callers");
}

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
// The brute-force checks on a finer grid, farther out (FURNITURE_ORACLE_FINE=1); CI's: within 0.4 m on a 1 cm grid.
const FINE = process.env.FURNITURE_ORACLE_FINE === "1";
const counts = { rooms: 0, beside: 0, placed: 0, worstMm: 0, moved: 0, kept: 0, refused: 0, accepted: 0 };
const rotate = (angle: number) => ({ x, z }: P) => ({ x: x * Math.cos(angle) - z * Math.sin(angle), z: x * Math.sin(angle) + z * Math.cos(angle) });
for (let index = 0; index < ROOMS; index += 1) {
  const family = pick(Object.keys(SHAPES)), angle = chance(0.5) ? between(0, 2 * Math.PI) : 0, [w, d] = [between(1.2, 6), between(1.2, 5)];
  let points = SHAPES[family](w, d).map(rotate(angle));
  if (chance(0.5)) points = [...points].reverse();
  const faces = Object.fromEntries(getRoomWallFaceIds({ shape: "custom_polygon", polygon: points }).filter(() => chance(0.45)).map((faceId) => [faceId,
    { materialId: LAMINATE.materialId, panelBacking: { board: "mdf" as const, boardThicknessMm: pick([6, 9, 12, 18]), fixing: pick(["glued", "battens"] as const) } }]));
  const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
  const [columnX, columnZ] = [between(-0.2, 0.2) * (Math.max(...xs) - Math.min(...xs)), between(-0.2, 0.2) * (Math.max(...zs) - Math.min(...zs))];
  const column = chance(0.2) ? box(between(0.15, 0.4), between(0.15, 0.4)).map((p) => ({ x: p.x + columnX, z: p.z + columnZ })) : null;
  const thickness = pick([0.08, 0.1, 0.12, 0.15, 0.2, 0.25]);
  const room = drawnRoom(`oracle-${index}`, points, faces, thickness, column ? [column] : undefined);
  // Some beside a room to the south with thicker walls, sharing the south wall (every shape but a star and a wedge has it whole).
  const beside = !["star", "wedge"].includes(family) && chance(0.35), southDepth = between(1, 3);
  const neighbours = beside ? [{ ...toPlanRoom(drawnRoom(`south-${index}`, box(w, southDepth).map(rotate(angle)), {}, thickness + between(0.03, 0.15))),
    ...rotate(angle)({ x: 0, z: d / 2 + southDepth / 2 }) }] : [];
  const region = regionOf(room, neighbours), planRooms = planOf(room, neighbours);
  if (region.filled) continue;
  counts.rooms += 1;
  counts.beside += beside ? 1 : 0;
  const targets: P[] = [...points, ...points.map((p, i) => ({ x: (p.x + points[(i + 1) % points.length].x) / 2, z: (p.z + points[(i + 1) % points.length].z) / 2 })),
    ...Array.from({ length: 8 }, () => ({ x: between(Math.min(...xs) - 0.3, Math.max(...xs) + 0.3), z: between(Math.min(...zs) - 0.3, Math.max(...zs) + 0.3) }))];
  for (const target of targets) for (const [width, depth] of ITEMS) for (const rotationY of TURNS) {
    const { at, line, placed, contained, footprint } = clampBoth(room, target, width, depth, rotationY, planRooms);
    const where = `${family} room ${index}${beside ? " beside a thicker room" : ""}: a ${width} × ${depth} item turned ${rotationY.toFixed(2)} for (${target.x.toFixed(3)}, ${target.z.toFixed(3)})`;
    const gapAt = (place: P) => gapInRegion(region, turned(place, width, depth, rotationY));
    // Clear by the 3D view, with a millimetre in hand: what the line's clamp leaves so clear stays, and containment accepts.
    const clear = (place: P) => gapAt(place) >= CLEAR + 0.001;
    const targetGap = gapAt(target);
    if (targetGap >= CLEAR + 0.001) assert.ok(contained(target), `${where}: containment refuses it there, ${(targetGap * 1000).toFixed(2)} mm off the 3D view's walls`);
    if (contained(target)) assert.ok(targetGap >= CLEAR - 0.0002, `${where}: containment accepts it there, ${(targetGap * 1000).toFixed(2)} mm off the 3D view's walls`);
    counts.accepted += contained(target) ? 1 : 0;
    const lineGap = gapAt({ x: line[0], z: line[1] });
    if (lineGap >= CLEAR + 0.001) {
      counts.kept += 1;
      assert.deepEqual(at, line, `${where}: moved off the line's place (${line}), ${(lineGap * 1000).toFixed(2)} mm off the 3D view's walls`);
    }
    if (!placed) {
      // Refused: nowhere near is clear.
      counts.refused += 1;
      const near = nearestBrute(target, 0.25, 0.02, clear);
      assert.equal(near, null, `${where}: refused at (${at[0].toFixed(4)}, ${at[1].toFixed(4)}), but (${near?.x.toFixed(4)}, ${near?.z.toFixed(4)}) is clear`);
      continue;
    }
    counts.placed += 1;
    const gap = gapInRegion(region, footprint);
    counts.worstMm = Math.max(counts.worstMm, (CLEAR - gap) * 1000);
    assert.ok(gap >= CLEAR - 0.0002, `${where} at (${at[0].toFixed(4)}, ${at[1].toFixed(4)}) stands ${(gap * 1000).toFixed(2)} mm off the 3D view's walls and panels`);
    if (at[0] === line[0] && at[1] === line[1]) continue;
    // Moved off the line's place: to the nearest place the 3D view leaves clear (to within its rounding and a few millimetres).
    counts.moved += 1;
    const moved = Math.hypot(at[0] - target.x, at[1] - target.z), [reach, step] = FINE ? [Math.min(0.8, moved - 0.012), 0.005] : [Math.min(0.4, moved - 0.015), 0.01];
    const near = reach > 0 ? nearestBrute(target, reach, step, clear) : null;
    assert.equal(near, null, `${where}: moved ${(moved * 1000).toFixed(0)} mm to (${at[0].toFixed(4)}, ${at[1].toFixed(4)}), but (${near?.x.toFixed(4)}, ${near?.z.toFixed(4)}) is clear ${near ? (Math.hypot(near.x - target.x, near.z - target.z) * 1000).toFixed(0) : ""} mm off`);
  }
}
assert.ok(counts.placed > ROOMS * 100 && counts.beside > 0 && counts.moved > 0, "placements to measure");
console.log(`Furniture in drawn rooms: ${counts.rooms} rooms (${counts.beside} beside a room with thicker walls), ${counts.placed} placements, at most ` +
  `${Math.max(0, counts.worstMm).toFixed(3)} mm nearer than 2 cm; ${counts.kept} kept where the line's clamp left them clear, ${counts.moved} moved to the ` +
  `nearest clear place, ${counts.refused} refused with none clear near; containment as the 3D view at ${counts.accepted} targets it accepts.`);
console.log("Furniture room fit checks passed.");
