import { getCanonicalFaceTrimsMm, getCanonicalRoomWallFinish } from "../components/editor/renderers/canonical-floor-plan/canonicalWallPanels";
import { trimmedFaceEdge } from "../components/editor/renderers/canonical-floor-plan/geometry";
import { buildHousePlan2D, type HousePlanRoom2D } from "../lib/design-page-house-plan";
import type { FloorPlanDocumentV2, FloorPlanFloorV2 } from "../lib/floor-plan-document-v2";
import { canonicalFloorPlanToDesignSnapshot } from "../lib/floor-plan-legacy-adapters";
import { compileCanonicalFloorPlanRenderModel, type CanonicalFloorPlanFloorRenderModel, type CanonicalFloorPlanRenderModel } from "../lib/floor-plan-render-model";
import type { RoomSnapshot } from "../lib/room-types";
import type { P, Region } from "./built-in-faces-oracle-utils";

/**
 * Seeded imported plans for scripts/test-built-in-imported-oracle.ts, built as an upload builds them (a canonical document,
 * canonicalFloorPlanToDesignSnapshot), and each room as the canonical 3D view draws it: every slice of every wall on its floor
 * (canonical-floor-plan's extrusions, beside, below and above their openings), and the room's laminate panels as drawn
 * (wallFinishShellGeometry's plan outline: the bare face to the finish's depth, cut at the room's corners by
 * getCanonicalFaceTrimsMm). Nothing here reads lib/room-built-in-region.ts or lib/room-built-in-imported-region.ts.
 */

export type Random = { next: () => number; between: (low: number, high: number) => number; pick: <T>(list: readonly T[]) => T };

/** mulberry32: the same plans for the same seed. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, between: (low, high) => low + (high - low) * next(), pick: (list) => list[Math.floor(next() * list.length)] };
}

/**
 * A plan as rooms of vertex loops (mm, before it is turned), with groups of edges ("from>to") of one thickness: a straight wall
 * drawn in parts, a junction's through wall (the plan joins footprints on a line only when they're one thickness), and the
 * walls given a thickness of their own (a partition).
 */
type Spec = {
  kind: string; vertices: Record<string, [number, number]>; rooms: Record<string, string[]>;
  sameWall?: string[][]; thickness?: Record<string, number>;
};

const OUTER = [150, 200, 250, 300], ANY = [100, 120, 150, 200, 250, 300];
const SHAPES: Record<string, (r: Random) => Spec> = {
  rectangle: (r) => {
    const [w, d] = [r.between(2400, 6000), r.between(2200, 5000)];
    return { kind: "rectangle", vertices: { a: [0, 0], b: [w, 0], c: [w, d], e: [0, d] }, rooms: { R: ["a", "b", "c", "e"] } };
  },
  // Two rooms with a partition thinner than the outer walls (so than the rooms' average), meeting them in T-junctions.
  partition: (r) => {
    const [w1, w2, d] = [r.between(2200, 4500), r.between(2200, 4500), r.between(2400, 4500)];
    return { kind: "partition", vertices: { a: [0, 0], m: [w1, 0], b: [w1 + w2, 0], c: [w1 + w2, d], n: [w1, d], e: [0, d] },
      rooms: { A: ["a", "m", "n", "e"], B: ["m", "b", "c", "n"] }, sameWall: [["a>m", "m>b"], ["c>n", "n>e"]], thickness: { "m>n": r.pick([75, 90, 100, 110]) } };
  },
  // A room along a through wall, and two rooms under it split by a stem: T-junctions at both ends of the stem.
  t: (r) => {
    const [a, b, c, s] = [r.between(2200, 4500), r.between(2200, 4500), r.between(2200, 4000), r.between(2200, 4000)];
    return { kind: "t", vertices: { p1: [-a, -c], p2: [b, -c], p3: [b, 0], p4: [b, s], p5: [0, s], p6: [-a, s], p7: [-a, 0], j: [0, 0] },
      rooms: { N: ["p1", "p2", "p3", "j", "p7"], W: ["p7", "j", "p5", "p6"], E: ["j", "p3", "p4", "p5"] },
      sameWall: [["p7>j", "j>p3"], ["p4>p5", "p5>p6"]], thickness: { "j>p5": r.pick([90, 100, 120, 150, 200]) } };
  },
  l: (r) => {
    const [w, d] = [r.between(3000, 6500), r.between(3000, 6000)], [nw, nd] = [w * r.between(0.3, 0.6), d * r.between(0.3, 0.6)];
    return { kind: "l", vertices: { a: [0, 0], b: [w, 0], c: [w, d - nd], e: [w - nw, d - nd], f: [w - nw, d], g: [0, d] }, rooms: { R: ["a", "b", "c", "e", "f", "g"] } };
  },
  // Four rooms about a cross junction, its arms of one thickness each way.
  cross: (r) => {
    const [a, b, c, d] = [r.between(2200, 4000), r.between(2200, 4000), r.between(2200, 4000), r.between(2200, 4000)];
    return { kind: "cross", vertices: { j: [0, 0], e: [b, 0], n: [0, -c], w: [-a, 0], s: [0, d], ne: [b, -c], nw: [-a, -c], sw: [-a, d], se: [b, d] },
      rooms: { A: ["j", "n", "ne", "e"], B: ["j", "w", "nw", "n"], C: ["j", "s", "sw", "w"], D: ["j", "e", "se", "s"] },
      sameWall: [["w>j", "j>e"], ["n>j", "j>s"], ["nw>n", "n>ne"], ["ne>e", "e>se"], ["se>s", "s>sw"], ["sw>w", "w>nw"]] };
  },
  // A room with an angled wall (60–85° and 95–120° corners), and a slight bend (a wall in two parts of one thickness).
  angled: (r) => {
    const [w, d, lean] = [r.between(3000, 6000), r.between(2600, 5000), r.between(-1, 1) * r.between(300, 1400)];
    const bend = r.between(-1, 1) * r.between(0, 300);
    return { kind: "angled", vertices: { a: [0, 0], m: [w / 2, bend], b: [w, 0], c: [w + lean, d], e: [0, d] }, rooms: { R: ["a", "m", "b", "c", "e"] }, sameWall: [["a>m", "m>b"]] };
  },
};
export const IMPORTED_SHAPES = Object.keys(SHAPES);

const prov = () => ({ confidence: 0.99, extractionVersion: "t", reviewHistory: [], evidence: [{ sourceId: "source-1",
  basis: "vector_traced" as const, confidence: 0.99, extractorVersion: "t", pageNumber: 1, cropPx: { xPx: 0, yPx: 0, widthPx: 1, heightPx: 1 } }] });
const assumed = (valueMm: number) => ({ valueMm, evidence: "assumed" as const, provenance: prov() });

/** How a plan is laid: turned (degrees), mirrored, moved. */
export type Placement = { turnDeg: number; mirror: boolean; dx: number; dz: number };

/** The spec as a canonical document: turned, mirrored and moved to whole millimetres, a wall per edge, and its doors and windows. */
function documentOf(id: string, spec: Spec, placement: Placement, r: Random): FloorPlanDocumentV2 {
  const turn = (placement.turnDeg * Math.PI) / 180, flip = placement.mirror ? -1 : 1;
  const place = ([x, z]: [number, number]) => ({
    xMm: Math.round(flip * (x * Math.cos(turn) - z * Math.sin(turn)) + placement.dx), zMm: Math.round(x * Math.sin(turn) + z * Math.cos(turn) + placement.dz),
  });
  const vertices = Object.entries(spec.vertices).map(([vertexId, point]) => ({ id: vertexId, ...place(point), provenance: prov() }));
  const walls = new Map<string, { id: string; from: string; to: string; rooms: string[] }>();
  const loops = Object.entries(spec.rooms).map(([roomId, loop]) => ({ roomId, walls: loop.map((from, index) => {
    const to = loop[(index + 1) % loop.length], known = walls.get(`${to}>${from}`);
    if (known) { known.rooms.push(roomId); return { wallId: known.id, direction: "reverse" as const }; }
    walls.set(`${from}>${to}`, { id: `w-${from}-${to}`, from, to, rooms: [roomId] });
    return { wallId: `w-${from}-${to}`, direction: "forward" as const };
  }) }));
  const groups = (spec.sameWall ?? []).map(() => r.pick(OUTER));
  const same = (key: string, entry: string) => entry === key || entry.split(">").reverse().join(">") === key;
  const wallList = [...walls.entries()].map(([key, wall]) => {
    const group = (spec.sameWall ?? []).findIndex((edges) => edges.some((entry) => same(key, entry)));
    const own = Object.entries(spec.thickness ?? {}).find(([entry]) => same(key, entry))?.[1];
    return { id: wall.id, thicknessMm: own ?? (group >= 0 ? groups[group] : r.pick(ANY)), adjacentRoomIds: wall.rooms,
      path: { kind: "line" as const, startVertexId: wall.from, endVertexId: wall.to },
      classification: wall.rooms.length > 1 ? "interior" as const : "exterior" as const, provenance: prov() };
  });
  return {
    schemaVersion: 2, units: "mm", id, revisionId: `${id}-r1`, createdAt: "2026-11-01T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [{ id: "source-1", kind: "pdf", name: "plan", mimeType: "application/pdf", sha256: "c".repeat(64), pageCount: 1 }],
    floors: [{
      id: "floor-1", name: "L1", levelIndex: 0, elevationMm: 0, storeyHeightMm: 2800, slabThicknessMm: 150, calibrations: [],
      defaults: { wallHeight: assumed(2600), doorHeight: assumed(2100), windowHeight: assumed(1200), windowSillHeight: assumed(900) },
      vertices, walls: wallList,
      rooms: loops.map(({ roomId, walls: loop }) => ({ id: roomId, name: roomId, roomType: "kitchen", provenance: prov(), wallLoops: [{ kind: "outer" as const, walls: loop }] })),
      openings: openingsOf(wallList, new Map(vertices.map((vertex) => [vertex.id, vertex])), r) as unknown as FloorPlanFloorV2["openings"],
      structures: [], annotations: [], dimensions: [],
    }],
  } as unknown as FloorPlanDocumentV2;
}

/** Up to three doors and windows on walls long enough for them, 200 mm or more from each end; none two on one wall. */
function openingsOf(walls: Array<{ id: string; path: { startVertexId: string; endVertexId: string } }>, at: Map<string, { xMm: number; zMm: number }>, r: Random) {
  const count = r.pick([0, 1, 1, 2, 3]), used = new Set<string>(), openings: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    const wall = r.pick(walls);
    const [from, to] = [at.get(wall.path.startVertexId)!, at.get(wall.path.endVertexId)!], length = Math.hypot(to.xMm - from.xMm, to.zMm - from.zMm);
    const kind = r.next() < 0.5 ? "door" : "window", widthMm = Math.round(kind === "door" ? r.between(700, 900) : r.between(600, 1500));
    if (used.has(wall.id) || length < widthMm + 400) continue;
    used.add(wall.id);
    const offsetMm = Math.round(r.between(200, length - widthMm - 200));
    openings.push({ id: `${kind}-${index}`, wallId: wall.id, kind, operation: kind === "door" ? "swing" : "fixed", offsetMm, widthMm,
      hinge: kind === "door" ? "start" : "none", handing: kind === "door" ? "left" : "none", provenance: prov() });
  }
  return openings;
}

const BACKINGS = [6, 9, 12, 18].flatMap((boardThicknessMm) => (["glued", "battens"] as const).map((fixing) => ({ board: "mdf" as const, boardThicknessMm, fixing })));

/** The plan's rooms finished: each wall a laminate (a third of them) or paint, and a recorded baseboard in some rooms. */
function finished(room: RoomSnapshot, r: Random, laminates: number, baseboards: readonly number[]): RoomSnapshot {
  const faces = Object.fromEntries((room.planEdgeWallIds ?? []).map((wallId) => [wallId, r.next() < laminates
    ? { materialId: "greenlam-woodgrains-5394", panelBacking: r.pick(BACKINGS) } : { paintColorHex: "#ffffff" }]));
  const baseboardDepth = r.next() < 0.35 ? r.pick(baseboards) : undefined;
  return { ...room, geometry: { ...room.geometry, baseboardDepth }, surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces } }, surfaceFinishes: undefined } as RoomSnapshot;
}

export type ImportedCase = {
  kind: string; placement: Placement; document: FloorPlanDocumentV2; rooms: RoomSnapshot[]; planRooms: Map<string, HousePlanRoom2D>;
  model: CanonicalFloorPlanRenderModel; floor: CanonicalFloorPlanFloorRenderModel;
};

/**
 * Plan `index` of a seed: a shape (in turn), laid axis-aligned (two in five), a quarter turn, 20° or any angle, mirrored half the
 * time, and finished; or as `options` give it.
 */
export function makeImportedCase(index: number, seed: number, options: { kind?: string; placement?: Partial<Placement>; laminates?: number; baseboards?: readonly number[] } = {}): ImportedCase {
  const r = seededRandom((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const kind = options.kind ?? IMPORTED_SHAPES[index % IMPORTED_SHAPES.length];
  const spec = SHAPES[kind](r);
  const roll = r.next();
  const turnDeg = roll < 0.4 ? 0 : roll < 0.5 ? r.pick([90, 180, 270]) : roll < 0.7 ? r.pick([20, -20]) : r.between(0, 360);
  const placement: Placement = { turnDeg, mirror: r.next() < 0.5, dx: Math.round(r.between(-4000, 4000)), dz: Math.round(r.between(-4000, 4000)), ...options.placement };
  const document = documentOf(`imported-${seed}-${index}`, spec, placement, r);
  const { snapshot } = canonicalFloorPlanToDesignSnapshot(document);
  const rooms = snapshot.rooms.map((room) => finished(room, r, options.laminates ?? 0.35, options.baseboards ?? [0.01, 0.015, 0.02, 0.03]));
  const planRooms = new Map(buildHousePlan2D(rooms, 8, 6).rooms.map((room) => [room.id, room]));
  const model = compileCanonicalFloorPlanRenderModel(snapshot.floorPlan?.canonicalDocument ?? document);
  return { kind, placement, document, rooms, planRooms, model, floor: model.floors[0] };
}

/** One slice of a wall as the 3D view extrudes it: its plan quad (room-local metres) and heights (mm above the floor). */
export type Slice = { wallId: string; quad: P[]; bottomMm: number; topMm: number };

export type ImportedRegion = Region & { slices: Slice[]; panels: P[][] };

/**
 * The room as the canonical 3D view draws it, room-local metres: inside its outline (the walls' centre lines, as the import
 * gives it), outside every slice of every wall on its floor and outside its laminate panels as drawn (from the bare face to
 * the finish's depth, cut at the room's corners). A paint or tile's 1.5 mm skin isn't measured (#256: the room stops at the
 * bare wall there). `room` is the plan's room, as the renderer reads it.
 */
export function importedRegionOf(snapshot: RoomSnapshot, room: HousePlanRoom2D, floor: CanonicalFloorPlanFloorRenderModel): ImportedRegion {
  const origin = snapshot.planPosition ?? { x: 0, z: 0 };
  const local = (point: { x: number; z: number }) => ({ x: point.x - origin.x, z: point.z - origin.z });
  const slices = floor.walls.flatMap((wall) => wall.solids.map((solid): Slice => ({
    wallId: wall.id, bottomMm: solid.bottomMm, topMm: solid.topMm,
    quad: [solid.footprint.startLeft, solid.footprint.endLeft, solid.footprint.endRight, solid.footprint.startRight].map(({ xMm, zMm }) => local({ x: xMm / 1000, z: zMm / 1000 })),
  })));
  const panels = floor.walls.flatMap((wall) => wall.roomSides.filter(({ roomId }) => roomId === room.id).flatMap(({ side }) => {
    const { depthMm } = getCanonicalRoomWallFinish(room, wall.id);
    if (!(depthMm > 0)) return [];
    return wall.solids.flatMap((solid) => {
      const trims = getCanonicalFaceTrimsMm(room, floor.walls, wall, solid, side);
      if (trims.hidden) return [];
      const [bare, front] = [trimmedFaceEdge(solid, side, 0, trims), trimmedFaceEdge(solid, side, depthMm, trims)];
      return [[bare.start, bare.end, front.end, front.start].map(local)];
    });
  }));
  const outline = (snapshot.planPolygon ?? []).map(({ x, z }) => ({ x, z }));
  const others = [...panels, ...(snapshot.planHoles ?? [])];
  const rings = [...slices.map(({ quad }) => quad), ...others];
  const edges = rings.flatMap((ring) => ring.map((a, index) => {
    const b = ring[(index + 1) % ring.length];
    return { a, b, bounds: [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z)] as [number, number, number, number] };
  }));
  const thickest = Math.max(...floor.walls.map((wall) => wall.thicknessMm)) / 1000;
  return {
    outline, bands: slices.map(({ quad }) => ({ outer: quad, holes: [] })), others, vertices: [...outline, ...rings.flat()], edges,
    thickness: thickest, filled: false, slices, panels,
  };
}
