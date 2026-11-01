import assert from "node:assert/strict";

import { fitCabinetToSpace, getCabinetFitPlacement } from "../features/cabinetry/fitToSpace";
import { getCabinetAvailableSegments } from "../features/cabinetry/fitSegments";
import { createCabinetPreset } from "../features/cabinetry/presets";
import {
  buildCabinetryAvailableSpaces, findCabinetHostForWall, getCabinetCopyOffset, getCabinetPlacement, isCabinetPlacementRefused,
} from "../features/cabinetry/roomCabinetHosts";
import type { CabinetDefinition, CabinetHostSpace } from "../features/cabinetry/types";
import { snapshotToStored, storedToSnapshot } from "../lib/room-persistence";
import { builtInFootprintFits, clampBuiltInToRoom, getBuiltInDragPlace, getBuiltInSnapTarget, getRoomBuiltInFaces, usesFurnitureRuleForBuiltIns } from "../lib/room-built-in-faces";
import { createRoom, type DesignSnapshot, type RoomSnapshot } from "../lib/room-types";
import { isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";
import { inRegion, toWorld, type Run } from "./built-in-faces-oracle-utils";
import { importedCaseOf, importedDocument, importedRegionOf, laminate, makeImportedCase } from "./built-in-imported-oracle-utils";
import { getBuiltInRefusalNote } from "../lib/built-in-move-notes";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";

/**
 * Worked examples for built-ins in imported plans on the finished-face rule (J, 1 Nov 2026), one for each of the three bugs the
 * decision names, and the rule's other parts: hosts at each wall's own face past a T-junction and on a partition thinner than
 * the room's average, the plan's doors and windows, a run fitted under the old rule after a reload, a wall selected in the plan,
 * and a room its plan's model doesn't hold. scripts/test-built-in-imported-oracle.ts checks the rule on seeded plans.
 */

type Case = ReturnType<typeof importedCaseOf>;
type Placed = Run & { definition: CabinetDefinition; space: CabinetHostSpace; bottom: number; fitX: number; fitZ: number };

const hostsOf = (c: Case, room: RoomSnapshot, withModel = true) => buildCabinetryAvailableSpaces({
  activeRoom: room, activePlanRoom: null, planRoomCount: c.rooms.length, planOpenings: [], planRooms: c.planRooms, ...(withModel ? { canonicalModel: c.model } : {}),
});
function fitAndPlace(c: Case, room: RoomSnapshot, space: CabinetHostSpace, preset: "base" | "wall", withModel = true, mode: "fit_width" | "fit_height" = "fit_width"): Placed {
  const fitted = fitCabinetToSpace(createCabinetPreset(preset, `${preset}-${space.id}`), preset === "wall" ? { ...space, mountingHeightMm: 1450 } : space, { mode });
  assert.equal(fitted.ok, true, `${room.id} ${space.wallId} ${preset}: Fit fits`);
  if (!fitted.ok) throw new Error("unreachable");
  const at = getCabinetFitPlacement(fitted.definition, room.geometry.width, room.geometry.depth)!;
  const placed = getCabinetPlacement(fitted.definition, room, false, c.planRooms, withModel ? c.model : undefined);
  return { x: placed.position[0], z: placed.position[2], width: fitted.definition.totalWidth / 1000, depth: fitted.definition.depth / 1000, rotationY: placed.rotationY,
    definition: fitted.definition, space, bottom: placed.position[1], fitX: at.position[0], fitZ: at.position[2] };
}
const contains = (c: Case, room: RoomSnapshot, run: Run & { bottom: number }, builtIn = true) => isPlacementContainedInRoom({
  room, position: [run.x, run.bottom, run.z], rotationY: run.rotationY, dimensions: { w: run.width * 1000, d: run.depth * 1000, h: 870 }, builtIn, planRooms: c.planRooms, canonicalModel: c.model,
});
/** The run's footprint, 0.6 mm in, every 5 mm round its edge, in the room as the canonical 3D view draws it. */
function inDrawnRoom(c: Case, room: RoomSnapshot, run: Run): boolean {
  const region = importedRegionOf(room, c.planRooms.get(room.id)!, c.floor, true), [w, d] = [run.width / 2 - 0.0006, run.depth / 2 - 0.0006];
  const points = [];
  for (let along = -w; along <= w + 1e-9; along += 0.005) points.push(toWorld(run, along, -d), toWorld(run, along, d));
  for (let across = -d; across <= d + 1e-9; across += 0.005) points.push(toWorld(run, -w, across), toWorld(run, w, across));
  return points.every((point) => inRegion(region, point));
}
const along = <T extends Run>(run: T, metres: number): T => ({ ...run, x: run.x + Math.cos(run.rotationY) * metres, z: run.z - Math.sin(run.rotationY) * metres });
const outFrom = <T extends Run>(run: T, metres: number): T => ({ ...run, x: run.x + Math.sin(run.rotationY) * metres, z: run.z + Math.cos(run.rotationY) * metres });

/** A 4.2 × 3 m kitchen: its north wall 250 mm with a window, east 100 mm laminated, south 200 mm with a door, west 150 mm. */
const kitchen = (turnDeg: number, baseboardDepth?: number) => importedCaseOf(importedDocument(`kitchen-${turnDeg}`, {
  vertices: { a: [0, 0], b: [4200, 0], c: [4200, 3000], e: [0, 3000] }, rooms: { K: ["a", "b", "c", "e"] }, thicknessMm: 200,
  walls: { "a>b": 250, "b>c": 100, "c>e": 200, "e>a": 150 },
  openings: [{ edge: "a>b", kind: "window", offsetMm: 1500, widthMm: 1200 }, { edge: "c>e", kind: "door", offsetMm: 600, widthMm: 900 }],
}, { turnDeg, dx: 1234, dz: -567 }), (room) => ({
  ...room, geometry: { ...room.geometry, baseboardDepth },
  surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { "w-b-c": laminate(18) } } },
}) as RoomSnapshot);

// 1. In a turned imported plan, Place landed every fitted run overlapping a wall, and containment then refused every move.
{
  const c = kitchen(20), room = c.rooms[0];
  assert.equal(room.geometry.wallThickness, 0.175, "the kitchen carries its walls' average, 175 mm");
  // Before: the line's hosts and Place (furniture's rule), checked as the line checked an imported built-in (furniture's
  // containment with the plan's walls, which takes a turned run by the box around it).
  const before = hostsOf(c, room, false).flatMap((space) => (["base", "wall"] as const).map((preset) => fitAndPlace(c, room, space, preset, false)));
  assert.equal(before.filter((run) => contains(c, room, run, false)).length, 0, "before: none of the kitchen's fitted runs is contained where Place puts it");
  const runs = hostsOf(c, room).flatMap((space) => (["base", "wall"] as const).map((preset) => fitAndPlace(c, room, space, preset)));
  assert.equal(runs.length, 8, "a base and a wall run on each of its four walls");
  for (const run of runs) {
    const what = `turned kitchen ${run.space.wallId} ${run.bottom > 0 ? "wall" : "base"}`;
    assert.ok(Math.hypot(run.x - run.fitX, run.z - run.fitZ) < 1e-9, `${what}: Place puts it where Fit did`);
    assert.equal(contains(c, room, run), true, `${what}: contained there`);
    assert.equal(inDrawnRoom(c, room, run), true, `${what}: inside the walls and panels the 3D view draws`);
    for (const [label, target] of [["10 mm along", along(run, 0.01)], ["10 mm back", along(run, -0.01)], ["10 mm out", outFrom(run, 0.01)]] as const) {
      const [x, z] = clampBuiltInToRoom(room, target.x, target.z, run.width, run.depth, run.rotationY, { from: [run.x, run.z], planRooms: c.planRooms, canonical: c.model, bottom: run.bottom });
      const kept = { ...run, x, z };
      assert.equal(contains(c, room, kept), true, `${what}: a nudge ${label} is contained`);
      if (label === "10 mm out") assert.ok(Math.hypot(x - target.x, z - target.z) < 1e-12, `${what}: a nudge out is kept`);
    }
    // A drag out into the room and back along the wall, as the 3D view checks each frame.
    for (const out of [0.05, 0.2]) assert.equal(contains(c, room, outFrom(run, out)), true, `${what}: dragged ${out * 1000} mm out, contained`);
  }
}

// 2. Snap to wall aimed from the room's average wall, so a run could land up to 50 mm off where Fit put it. It lands there now:
// a unit Fit stood on each wall (fitted by height, so it keeps its width and the wall is the nearest side), snapped from there
// and from 0.4 m out. The room's walls are 300, 200, 200 and 100 mm (averaging 200), with a 15 mm baseboard.
{
  const c = importedCaseOf(importedDocument("snap", {
    vertices: { a: [0, 0], b: [4200, 0], c: [4200, 3000], e: [0, 3000] }, rooms: { K: ["a", "b", "c", "e"] }, thicknessMm: 200, walls: { "a>b": 300, "e>a": 100 },
  }), (room) => ({ ...room, geometry: { ...room.geometry, baseboardDepth: 0.015 } }) as RoomSnapshot), room = c.rooms[0];
  const snapFrom = (run: Placed, start: Run, withModel: boolean) => {
    const canonical = withModel ? c.model : undefined;
    const [toX, toZ] = getBuiltInSnapTarget(room, [start.x, run.bottom, start.z], run.width, run.depth, run.rotationY, c.planRooms, canonical);
    return clampBuiltInToRoom(room, toX, toZ, run.width, run.depth, run.rotationY, { from: [start.x, start.z], planRooms: c.planRooms, canonical, bottom: run.bottom });
  };
  const offBefore = hostsOf(c, room, false).flatMap((space) => (["base", "wall"] as const).map((preset) => {
    const run = fitAndPlace(c, room, space, preset, false, "fit_height"), [x, z] = snapFrom(run, outFrom(run, 0.4), false);
    return Math.hypot(x - run.x, z - run.z);
  }));
  assert.ok(Math.max(...offBefore) > 0.049, `before: a snap landed ${(Math.max(...offBefore) * 1000).toFixed(1)} mm off where Fit put the run`);
  for (const space of hostsOf(c, room)) for (const preset of ["base", "wall"] as const) {
    const run = fitAndPlace(c, room, space, preset, true, "fit_height");
    for (const start of [run, outFrom(run, 0.4)]) {
      const [x, z] = snapFrom(run, start, true);
      assert.ok(Math.hypot(x - run.x, z - run.z) < 1e-6, `${space.wallId} ${preset}: Snap to wall from ${start === run ? "where Fit put it" : "0.4 m out"} lands where Fit put it (${(Math.hypot(x - run.x, z - run.z) * 1000).toFixed(3)} mm off)`);
    }
  }
}

// Snap to wall in a turned room goes straight back to the nearest face, along its normal (J's delegate, 1 Nov 2026): a unit 0.4 m
// out from the middle of each wall of the 20°-turned kitchen, and of a drawn 4 × 3 m room turned 20°, lands back on that wall. It went along
// the plan's x or z to the faces' bounding box and stopped where it first touched a face, slid along it.
{
  const c = kitchen(20, 0.015), turn = (20 * Math.PI) / 180;
  const drawn = { ...createRoom("turned", "Turned", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }), planShape: "custom_polygon",
    planPolygon: [[-2, -1.5], [2, -1.5], [2, 1.5], [-2, 1.5]].map(([x, z]) => ({ x: x * Math.cos(turn) - z * Math.sin(turn), z: x * Math.sin(turn) + z * Math.cos(turn) })) } as RoomSnapshot;
  const noPlan: Case = { ...c, planRooms: new Map(), model: undefined as never };
  for (const [label, at, room] of [["turned kitchen", c, c.rooms[0]], ["turned drawn room", noPlan, drawn]] as const) {
    const withModel = label === "turned kitchen";
    for (const space of hostsOf(at, room, withModel)) for (const preset of ["base", "wall"] as const) {
      // The unit at its wall's middle, where its own face is the nearest (at a corner, the end wall is).
      const fitted = fitAndPlace(at, room, space, preset, withModel, "fit_height"), segment = space.wallSegment!;
      const shift = ((segment.startXmm + segment.endXmm) / 2000 - fitted.x) * Math.cos(fitted.rotationY) - ((segment.startZmm + segment.endZmm) / 2000 - fitted.z) * Math.sin(fitted.rotationY);
      const run = along(fitted, shift), start = outFrom(run, 0.4);
      const o = { planRooms: at.planRooms, canonical: at.model, bottom: run.bottom };
      const [toX, toZ] = getBuiltInSnapTarget(room, [start.x, run.bottom, start.z], run.width, run.depth, run.rotationY, at.planRooms, at.model);
      const [x, z] = clampBuiltInToRoom(room, toX, toZ, run.width, run.depth, run.rotationY, { ...o, from: [start.x, start.z] });
      assert.ok(Math.hypot(x - run.x, z - run.z) < 1e-6, `${label} ${space.wallId} ${preset}: Snap to wall from 0.4 m out lands where Fit put it (${(Math.hypot(x - run.x, z - run.z) * 1000).toFixed(2)} mm off)`);
    }
  }
}

// 3. A baseboard deeper than 20 mm: a built-in could be dragged up to the baseboard less 20 mm into it, where furniture's rule
// let furniture of its size stand. No built-in is accepted 1–10 mm into a 30 mm one now, in a drawn room or an imported one.
{
  const drawnRooms: RoomSnapshot[] = [
    { ...createRoom("rect", "Rectangle", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }) },
    { ...createRoom("drawn", "Drawn", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }), planShape: "custom_polygon",
      planPolygon: [{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 1.6, z: 1.5 }, { x: -2, z: 1.5 }] },
  ].map((room) => ({ ...room, geometry: { ...room.geometry, baseboardDepth: 0.03 } }) as RoomSnapshot);
  const imported = kitchen(0, 0.03), noPlan: Case = { ...imported, planRooms: new Map(), model: undefined as never };
  for (const [label, c, room] of [...drawnRooms.map((entry) => [entry.id, noPlan, entry] as const), ["imported", imported, imported.rooms[0]] as const]) {
    const spaces = label === "imported" ? hostsOf(c, room) : buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
    let furnitureWouldTake = 0;
    for (const space of spaces) {
      const run = fitAndPlace(c, room, space, "base", label === "imported");
      assert.equal(contains(c, room, run), true, `${label} ${space.wallId}: the base run Fit stands 30 mm off the face is contained`);
      for (const into of [0.001, 0.005, 0.01]) {
        const moved = outFrom(run, -into);
        assert.equal(contains(c, room, moved), false, `${label} ${space.wallId}: ${into * 1000} mm into the baseboard isn't`);
        if (contains(c, room, moved, false)) furnitureWouldTake += 1;
      }
      const wall = fitAndPlace(c, room, space, "wall", label === "imported");
      assert.equal(contains(c, room, wall), true, `${label} ${space.wallId}: a wall cabinet hangs above it, its back on the face`);
    }
    assert.ok(furnitureWouldTake > 0, `${label}: furniture of a run's size may stand there, where the line let a built-in follow`);
  }
}

// A T-junction, and a partition thinner than the rooms' average: a room along a 250 mm through wall, and two under it split by a
// 100 mm stem. The north room's face runs on past the stem as one host; the stem's faces stand 50 mm off its line, not the
// rooms' average.
{
  const c = importedCaseOf(importedDocument("t", {
    vertices: { p1: [-3000, -3000], p2: [3000, -3000], p3: [3000, 0], j: [0, 0], p4: [3000, 3000], p5: [0, 3000], p6: [-3000, 3000], p7: [-3000, 0] },
    rooms: { N: ["p1", "p2", "p3", "j", "p7"], W: ["p7", "j", "p5", "p6"], E: ["j", "p3", "p4", "p5"] }, thicknessMm: 250, walls: { "j>p5": 100 },
  }));
  const north = c.rooms.find(({ id }) => id === "N")!, west = c.rooms.find(({ id }) => id === "W")!;
  const through = hostsOf(c, north).filter((space) => space.wallSegment && Math.abs(space.wallSegment.startZmm - space.wallSegment.endZmm) < 1e-6 && space.wallSegment.startZmm > 0);
  assert.equal(through.length, 1, "the through wall's face is one host over both its pieces");
  assert.ok(Math.abs(through[0].availableWidthMm - (6000 - 250)) < 0.01, `it runs from face to face, 5750 mm (${through[0].availableWidthMm})`);
  assert.equal(findCabinetHostForWall(north, hostsOf(c, north), "w-j-p7")?.id, through[0].id, "selecting either piece in the plan preselects it");
  const stemIndex = west.planEdgeWallIds!.indexOf("w-j-p5"), stem = hostsOf(c, west).find((space) => space.wallId === `wall-${stemIndex}`)!;
  const run = fitAndPlace(c, west, stem, "base");
  assert.ok(Math.abs(Math.abs(run.x - Math.sin(run.rotationY) * run.depth / 2 + west.planPosition!.x) - 0.05) < 1e-6,
    `the stem's face is 50 mm off its line (the rooms average ${((west.geometry.wallThickness ?? 0) * 500).toFixed(1)} mm)`);
  assert.equal(inDrawnRoom(c, west, run), true, "its run stands against it, inside the 3D view's walls");
}

// The same T turned 20°, its stem 701 mm off the middle: the plan's whole-millimetre vertices bend the through wall at the T by
// 0.006°, so its pieces' faces were two hosts, each running about 100 mm past the T, and no run could span the wall. Pieces
// within 0.05° whose faces meet are one host (J's delegate, 1 Nov 2026: "Treat collinear pieces as one host"): over both, square
// to its face, and a run filling it stands inside the 3D view's walls, contained.
{
  const c = importedCaseOf(importedDocument("t-turned", {
    vertices: { p1: [-3000, -3000], p2: [3000, -3000], p3: [3000, 0], j: [701, 0], p4: [3000, 3000], p5: [701, 3000], p6: [-3000, 3000], p7: [-3000, 0] },
    rooms: { N: ["p1", "p2", "p3", "j", "p7"], W: ["p7", "j", "p5", "p6"], E: ["j", "p3", "p4", "p5"] }, thicknessMm: 250, walls: { "j>p5": 100 },
  }, { turnDeg: 20, dx: 1234, dz: -567 }));
  const north = c.rooms.find(({ id }) => id === "N")!, faces = getRoomBuiltInFaces(north, undefined, c.planRooms, c.model);
  const bend = Math.asin(Math.abs(faces.walls[2].dx * faces.walls[3].dz - faces.walls[2].dz * faces.walls[3].dx)) * 180 / Math.PI;
  assert.ok(bend > 0.001 && bend < 0.05, `the through wall's pieces are ${bend.toFixed(4)}° apart`);
  const spaces = hostsOf(c, north), through = spaces.filter((space) => space.wallId === "wall-2" || space.wallId === "wall-3");
  assert.deepEqual(through.map((space) => space.wallId), ["wall-2"], "the through wall is one host, listed as its first piece");
  assert.ok(Math.abs(through[0].availableWidthMm - 5750) < 0.5, `from face to face, 5750 mm (${through[0].availableWidthMm.toFixed(2)})`);
  const segment = through[0].wallSegment!, length = Math.hypot(segment.endXmm - segment.startXmm, segment.endZmm - segment.startZmm);
  assert.ok(Math.abs((segment.endXmm - segment.startXmm) * segment.inwardNormalX + (segment.endZmm - segment.startZmm) * segment.inwardNormalZ) / length < 1e-9, "square to its face");
  const run = fitAndPlace(c, north, through[0], "base");
  assert.ok(Math.abs(run.width * 1000 - 5730) < 0.5, `a base run fills it (${(run.width * 1000).toFixed(1)} mm)`);
  assert.equal(contains(c, north, run), true, "contained");
  assert.equal(inDrawnRoom(c, north, run), true, "inside the 3D view's walls");
  for (const wallId of ["w-p3-j", "w-j-p7"]) assert.equal(findCabinetHostForWall(north, spaces, wallId)?.id, through[0].id, `selecting ${wallId} in the plan preselects it`);
}

// The plan's doors and windows: the kitchen's door cuts its south host where the 3D view draws it, and a base run fits under its
// north window (900 mm sill) where a wall cabinet doesn't.
{
  const c = kitchen(0), room = c.rooms[0], spaces = hostsOf(c, room);
  const south = spaces.find((space) => space.wallId === "wall-2")!, north = spaces.find((space) => space.wallId === "wall-0")!;
  assert.deepEqual(south.openings.map(({ kind, widthMm }) => [kind, widthMm]), [["door", 900]], "the door is on the south host");
  // The door's middle, 600 + 450 mm along the south wall from its east end: 1050 mm east of the room's middle, along the face.
  const segment = south.wallSegment!, length = Math.hypot(segment.endXmm - segment.startXmm, segment.endZmm - segment.startZmm);
  const fromMiddle = (1050 - (segment.startXmm + segment.endXmm) / 2) * (segment.endXmm - segment.startXmm) / length;
  assert.ok(Math.abs(south.openings[0].offsetMm - fromMiddle) < 0.01, `the door is where the plan draws it (${south.openings[0].offsetMm} mm from the face's middle, ${fromMiddle})`);
  const base = getCabinetAvailableSegments(south, 870, 0, 580);
  assert.equal(base.length, 2, "a base run fits either side of the door");
  assert.deepEqual(getCabinetAvailableSegments(north, 870, 0, 580).length, 1, "and under the window");
  assert.equal(getCabinetAvailableSegments(north, 720, 1450, 350).length, 2, "a wall cabinet only beside it");
}

// A run fitted under the old rule (furniture's hosts) keeps its place through a save and reload, its host has the same id as the
// new rule's, and Place or Save as copy of it goes to the nearest place it fits.
{
  const c = kitchen(20), room = c.rooms[0];
  const old = fitAndPlace(c, room, hostsOf(c, room, false)[0], "base", false);
  const item = { id: "old-run", instanceId: "old-run", productId: "parametric-cabinet", variantId: old.definition.id, assetType: "parametric_cabinet" as const,
    name: old.definition.name, cabinetDefinition: old.definition, position: [old.x, 0, old.z] as [number, number, number], rotationY: old.rotationY, qty: 1, includeInCheckout: false };
  const design: DesignSnapshot = { ...c.snapshot, rooms: [{ ...room, items: [item] }] };
  const reloaded = storedToSnapshot(snapshotToStored(design)).rooms[0], kept = reloaded.items.find(({ instanceId }) => instanceId === "old-run");
  assert.deepEqual(reloaded.planEdgeWallIds, room.planEdgeWallIds, "the reloaded room keeps its edges");
  assert.deepEqual([kept?.position, kept?.rotationY, kept?.cabinetDefinition?.fitState?.host], [item.position, item.rotationY, old.definition.fitState?.host],
    "the old run loads where it was saved, with its old host: loading moves nothing and saves nothing new");
  assert.ok(hostsOf(c, room).some((space) => space.id === old.space.id), "the new hosts have its host's id, so the Studio refreshes it");
  for (const copy of [false, true]) {
    const placed = getCabinetPlacement(old.definition, room, copy, c.planRooms, c.model), run = { ...old, x: placed.position[0], z: placed.position[2] };
    assert.equal(contains(c, room, run), true, `the old run's ${copy ? "copy" : "Place"} is contained`);
    assert.equal(inDrawnRoom(c, room, run), true, `the old run's ${copy ? "copy" : "Place"} stands inside the 3D view's walls`);
    assert.equal(isCabinetPlacementRefused(room, placed, { w: old.definition.totalWidth, d: old.definition.depth },
      (target, position, rotationY, size, builtIn) => isPlacementContainedInRoom({ room: target, position, rotationY, dimensions: size, builtIn, planRooms: c.planRooms, canonicalModel: c.model }), c.planRooms, c.model), false, "and isn't refused");
  }
  const run = fitAndPlace(c, room, hostsOf(c, room)[0], "base"), offset = getCabinetCopyOffset(run.space, room, c.planRooms, c.model);
  assert.ok(Math.abs(Math.hypot(...offset) - 0.15) < 1e-9 && Math.abs(offset[0] * -Math.sin(run.rotationY) - offset[1] * Math.cos(run.rotationY)) < 1e-9, "a copy moves 15 cm along its wall");
}

// A move from a place that doesn't fit goes to the nearest place that does (J's delegate, 1 Nov 2026), in every room: a run saved
// before its room's rule, overlapping its wall, comes free on its first nudge, turn, snap or drag, where it was stuck before
// (each move went from where it stood, and containment refused it). From a place that fits, moves are as before.
{
  const c = kitchen(20), room = c.rooms[0], opts = { planRooms: c.planRooms, canonical: c.model, bottom: 0 };
  const drawn = { ...createRoom("stuck", "Stuck", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }), planShape: "custom_polygon",
    planPolygon: [{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 1.6, z: 1.5 }, { x: -2, z: 1.5 }] } as RoomSnapshot;
  const noPlan: Case = { ...c, planRooms: new Map(), model: undefined as never };
  for (const [label, at, target] of [["the turned kitchen", c, room], ["a drawn room", noPlan, drawn]] as const) {
    const fitted = fitAndPlace(at, target, hostsOf(at, target, label !== "a drawn room").find((space) => space.availableWidthMm > 2000)!, "base", label !== "a drawn room", "fit_height");
    const stuck = { ...fitted, ...outFrom(fitted, -0.03) }, faces = getRoomBuiltInFaces(target, undefined, at.planRooms, at.model);
    const o = { ...opts, planRooms: at.planRooms, canonical: at.model };
    assert.equal(builtInFootprintFits(faces, stuck.x, stuck.z, stuck.width, stuck.depth, stuck.rotationY), false, `${label}: 30 mm into its wall, it doesn't fit`);
    const moves: Array<[string, [number, number], number]> = [
      ["a 10 mm nudge along", clampBuiltInToRoom(target, along(stuck, 0.01).x, along(stuck, 0.01).z, stuck.width, stuck.depth, stuck.rotationY, { ...o, from: [stuck.x, stuck.z] }), stuck.rotationY],
      ["a turn of 5°", clampBuiltInToRoom(target, stuck.x, stuck.z, stuck.width, stuck.depth, stuck.rotationY + 0.087, { ...o, turnedFrom: stuck.rotationY }), stuck.rotationY + 0.087],
      ["Snap to wall", clampBuiltInToRoom(target, ...getBuiltInSnapTarget(target, [stuck.x, 0, stuck.z], stuck.width, stuck.depth, stuck.rotationY, at.planRooms, at.model), stuck.width, stuck.depth, stuck.rotationY, { ...o, from: [stuck.x, stuck.z] }), stuck.rotationY],
      ["a drag 20 mm along", getBuiltInDragPlace(target, [stuck.x, stuck.z], along(stuck, 0.02).x, along(stuck, 0.02).z, stuck.width, stuck.depth, stuck.rotationY, o), stuck.rotationY],
    ];
    for (const [move, [x, z], rotationY] of moves) {
      assert.equal(contains(at, target, { ...stuck, x, z, rotationY }), true, `${label}: ${move} frees it`);
      // Out of the wall (30 mm and its 10 mm nudge or 20 mm drag), or as far as a 5° turn swings its corners.
      const near = move.includes("turn") ? Math.hypot(stuck.width, stuck.depth) * Math.sin(0.0435) + 0.03 : 0.06;
      assert.ok(Math.hypot(x - stuck.x, z - stuck.z) < near, `${label}: ${move} moves it to a place nearby (${(Math.hypot(x - stuck.x, z - stuck.z) * 1000).toFixed(1)} mm)`);
    }
    // From where Fit put it, a nudge into the wall stops at the face, and a drag into it is left where dropped (and refused).
    const [nx, nz] = clampBuiltInToRoom(target, outFrom(fitted, -0.01).x, outFrom(fitted, -0.01).z, fitted.width, fitted.depth, fitted.rotationY, { ...o, from: [fitted.x, fitted.z] });
    assert.ok(Math.hypot(nx - fitted.x, nz - fitted.z) < 0.0001, `${label}: from where it fits, a nudge into the wall stops at the face`);
    assert.deepEqual(getBuiltInDragPlace(target, [fitted.x, fitted.z], outFrom(fitted, -0.01).x, outFrom(fitted, -0.01).z, fitted.width, fitted.depth, fitted.rotationY, o),
      [outFrom(fitted, -0.01).x, outFrom(fitted, -0.01).z], `${label}: from where it fits, a drag isn't moved (containment refuses it)`);
  }
}

// The repo's test apartment (#256's): its living room's walls are 200 mm and, to the bedroom, 100 mm, averaging 175 mm. Its hosts
// run face to face, 3850 and 5800 mm, where the line's outline gave 4025 and 5975 mm (a whole average wall plus 10 mm off each
// end), and the door to the bedroom cuts the shared wall's host.
{
  const c = importedCaseOf(authoredApartment()), living = c.rooms.find(({ id }) => id === "living")!;
  assert.deepEqual(hostsOf(c, living).map((space) => [space.wallId, Math.round(space.availableWidthMm * 10) / 10, space.openings.length]),
    [["wall-0", 3850, 0], ["wall-1", 5800, 1], ["wall-2", 3850, 0], ["wall-3", 5800, 0]], "the living room's faces, and the door on the shared wall");
  assert.deepEqual(hostsOf(c, living, false).map((space) => Math.round(space.availableWidthMm)), [4025, 5975, 4025, 5975], "without its plan's model, the line's hosts");
  for (const space of hostsOf(c, living)) for (const preset of ["base", "wall"] as const) {
    const run = fitAndPlace(c, living, space, preset);
    assert.equal(contains(c, living, run) && inDrawnRoom(c, living, run), true, `living ${space.wallId} ${preset}: inside the 3D view's walls`);
  }
}

// A room its plan's model doesn't hold (no model, or edges not named) keeps furniture's rule, as on the line.
{
  const c = kitchen(20), room = c.rooms[0];
  assert.equal(usesFurnitureRuleForBuiltIns(room, undefined, c.planRooms), true, "without the plan's model");
  assert.equal(usesFurnitureRuleForBuiltIns({ ...room, planEdgeWallIds: undefined }, undefined, c.planRooms, c.model), true, "with its edges unnamed");
  assert.equal(usesFurnitureRuleForBuiltIns(room, undefined, c.planRooms, c.model), false, "with both, the faces' rule");
}

// Review, 2 Nov 2026: in a turned T the stem, joined to the through wall's far face, stands 0.01-0.02 mm proud of the room's
// face. That split the one host over the through wall at the stem (a full-depth obstacle there), so a run filled one side
// only (2454 mm of a 4749 mm host; the line's two hosts gave 2143 and 1972). An imported plan's walls stand true to 0.05 mm
// (PLAN_FLUSH_MM): the stem is flush, and one run spans the wall.
{
  const c = makeImportedCase(4, 4242, { kind: "t", placement: { turnDeg: 149.2 } }) as unknown as Case, north = c.rooms.find(({ id }) => id === "N")!;
  const through = hostsOf(c, north).find((space) => space.wallId === `wall-${north.planEdgeWallIds!.indexOf("w-p3-j")}`)!;
  assert.ok(Math.abs(through.availableWidthMm - 4749) < 1, `one host over the through wall (${through.availableWidthMm.toFixed(1)} mm)`);
  assert.equal(through.wallSegment!.obstacles!.some((points) => points.every(([along]) => Math.abs(along) < through.availableWidthMm / 2 - 300)), false, "nothing stands on it at the stem");
  const run = fitAndPlace(c, north, through, "base"), baseboard = through.wallSegment!.startBaseboardClearanceMm ?? 0;
  assert.ok(Math.abs(run.width * 1000 - (through.availableWidthMm - 20 - 2 * baseboard)) < 1, `a base run fills it, over the stem (${(run.width * 1000).toFixed(0)} mm)`);
  assert.equal(contains(c, north, run), true, "contained");
  assert.equal(inDrawnRoom(c, north, run), true, "inside the 3D view's walls");
}

// An opening up to its wall's top leaves no slice over it, so the wall's face is two stretches with nothing behind between:
// the host was the longer side only (1700 of 4000 mm). It spans both sides now, carrying the opening, as a door's does.
for (const heightMm of [2100, 2600]) {
  const document = importedDocument(`opening-${heightMm}`, { vertices: { a: [0, 0], b: [4200, 0], c: [4200, 3000], e: [0, 3000] }, rooms: { K: ["a", "b", "c", "e"] }, thicknessMm: 200,
    openings: [{ edge: "a>b", kind: "door", offsetMm: 1800, widthMm: 900 }] });
  Object.assign((document.floors[0].openings as unknown as Array<Record<string, unknown>>)[0], { heightMm, heightEvidence: "assumed" });
  const c = importedCaseOf(document), room = c.rooms[0], wall = `wall-${room.planEdgeWallIds!.indexOf("w-a-b")}`;
  const host = hostsOf(c, room).find((space) => space.wallId === wall)!;
  assert.deepEqual([Math.round(host.availableWidthMm), host.openings.length], [4000, 1], `${heightMm} mm opening: one 4000 mm host carrying it`);
  assert.equal(getCabinetAvailableSegments(host, 870, 0, 580).length, 2, `${heightMm} mm opening: a base run fits either side`);
}

// An L's inner corner where the next wall's panel is cut at a slant across this wall's face (the imported oracle's full set at
// seed 123457, plan 3: turned 293.7° and mirrored). The two walls' mitres meet 0.0007 mm apart behind the face, which split
// it there, and the face stopped at 1134.8 mm, short of where the panel's end stands 0.05 mm proud. They meet within the flush.
{
  const c = makeImportedCase(3, 123457) as unknown as Case, room = c.rooms.find(({ id }) => id === "R")!, outline = room.planPolygon!;
  const edge = room.planEdgeWallIds!.indexOf("w-c-e"), face = getRoomBuiltInFaces(room, undefined, c.planRooms, c.model).exposed[edge]!;
  const [start, end] = [outline[edge], outline[(edge + 1) % outline.length]], length = Math.hypot(end.x - start.x, end.z - start.z);
  const alongMm = ({ x, z }: { x: number; z: number }) => (((x - start.x) * (end.x - start.x) + (z - start.z) * (end.z - start.z)) / length) * 1000;
  assert.ok(Math.abs(alongMm(face.end) - 1136.04) < 0.05, `the L's inner face runs on under the panel's end (to ${alongMm(face.end).toFixed(2)} mm)`);
}

// A move from a place a run doesn't fit stays near it, its back on its face (J's delegate, 2 Nov 2026): a 3.86 m run fitted on
// a drawn L kitchen's 4 m top wall, then cut into by a laminate on its end wall, fits nowhere along that wall. Its nudge, Snap
// and drag are refused, where round 2 threw it 2 m off the wall into the middle of the L, and the refusal says to fit it again.
// The same in an imported L kitchen. Place still takes it to the nearest place anywhere in the room.
{
  const L = [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 2 }, { x: -3, z: 2 }];
  const kitchenL = (faces: RoomSnapshot["surfaces"]) => ({ ...createRoom("l", "Kitchen", "kitchen", { width: 6, depth: 4, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }),
    planShape: "custom_polygon" as const, planPolygon: L, surfaces: faces }) as RoomSnapshot;
  const bare = kitchenL(undefined), panelled = kitchenL({ walls: { default: { paintColorHex: "#ffffff" }, faces: { "wall-5": { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf", boardThicknessMm: 18, fixing: "battens" } } } } } as RoomSnapshot["surfaces"]);
  const top = buildCabinetryAvailableSpaces({ activeRoom: bare, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).find((space) => space.wallId === "wall-4")!;
  const fitted = fitCabinetToSpace(createCabinetPreset("base", "top"), top, { mode: "fit_width" });
  assert.ok(fitted.ok && fitted.definition.totalWidth === 3860, "a 3.86 m run fills the top wall");
  if (!fitted.ok) throw new Error("unreachable");
  const at = getCabinetFitPlacement(fitted.definition, 6, 4)!, [w, d, r] = [3.86, fitted.definition.depth / 1000, at.rotationY];
  const from: [number, number] = [at.position[0], at.position[2]];
  const inside = ([x, z]: [number, number]) => isPlacementContainedInRoom({ room: panelled, position: [x, 0, z], rotationY: r, dimensions: { w: 3860, d: d * 1000, h: 870 }, builtIn: true });
  assert.equal(inside(from), false, "the panel cuts into it where it stands");
  const snap = getBuiltInSnapTarget(panelled, [from[0], 0, from[1]], w, d, r);
  for (const [move, [x, z]] of [
    ["a 10 mm nudge", clampBuiltInToRoom(panelled, from[0] + 0.01, from[1], w, d, r, { from, bottom: 0 })],
    ["Snap to wall", clampBuiltInToRoom(panelled, snap[0], snap[1], w, d, r, { from, bottom: 0 })],
    ["a 0.2 m drag", getBuiltInDragPlace(panelled, from, from[0] + 0.2, from[1], w, d, r, { bottom: 0 })],
  ] as const) {
    assert.equal(inside([x, z]), false, `drawn L: ${move} is refused`);
    assert.ok(Math.abs(z - from[1]) < 1e-9, `drawn L: ${move} doesn't take it off its wall`);
  }
  assert.match(getBuiltInRefusalNote(true, "Kitchen", "Place fully inside Kitchen"), /Fit to Space again/, "the refusal says to use Fit to Space again");
  const placed = getCabinetPlacement(fitted.definition, panelled, false);
  assert.equal(inside([placed.position[0], placed.position[2]]), true, "Place takes it to the nearest place it fits in the room");
}
// Snap to wall from a place a run doesn't fit aims back onto the face it stands against. In an axis-aligned room Snap goes to
// its faces' outline: from a run stuck on a stub's end that is 0.2 m out, where it fits, off its wall (the drawn oracle's full
// set at seed 123457, room 1123).
{
  const stub = [{ x: -2.8, z: 0.64 }, { x: 2.8, z: 0.64 }, { x: 2.8, z: -0.64 }, { x: -1.09, z: -0.64 }, { x: -1.09, z: -0.35 }, { x: -1.31, z: -0.35 }, { x: -1.31, z: -0.64 }, { x: -2.8, z: -0.64 }];
  const room = { ...createRoom("s", "Kitchen", "kitchen", { width: 5.6, depth: 1.28, wallThickness: 0.2, height: 2.6, slabThickness: 0.1 }), planShape: "custom_polygon" as const, planPolygon: stub } as RoomSnapshot;
  const end = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).find((space) => space.wallId === "wall-4")!;
  const fitted = fitCabinetToSpace(createCabinetPreset("base", "stub"), end, { mode: "fit_width" });
  if (!fitted.ok) throw new Error("a base run fits the stub's end");
  const at = getCabinetFitPlacement(fitted.definition, 5.6, 1.28)!, [w, d, r] = [fitted.definition.totalWidth / 1000, fitted.definition.depth / 1000, at.rotationY];
  const run = { x: at.position[0], z: at.position[2], width: w, depth: d, rotationY: r }, stuck = outFrom(run, -0.03);
  assert.equal(builtInFootprintFits(getRoomBuiltInFaces(room), stuck.x, stuck.z, w, d, r), false, "stub: 30 mm into its wall it doesn't fit");
  const aim = getBuiltInSnapTarget(room, [stuck.x, 0, stuck.z], w, d, r), [x, z] = clampBuiltInToRoom(room, aim[0], aim[1], w, d, r, { from: [stuck.x, stuck.z], bottom: 0 });
  assert.ok(Math.hypot(x - run.x, z - run.z) < 1e-6, `stub: Snap to wall puts it back where Fit put it (${(Math.hypot(x - run.x, z - run.z) * 1000).toFixed(0)} mm off)`);
}
// The face a stuck run stands against is the one where it stands: a run stuck in a panelled piece of a two-piece wall, dragged
// toward the bare piece 13 mm behind it, stays on its own face's line (the drawn oracle's full set at seed 20261102, room 2285).
{
  const twoPiece = [{ x: -0.9, z: -0.7 }, { x: -0.38, z: -0.7 }, { x: 0.9, z: -0.7 }, { x: 0.9, z: 0.7 }, { x: -0.9, z: 0.7 }];
  const room = { ...createRoom("t", "Kitchen", "kitchen", { width: 1.8, depth: 1.4, wallThickness: 0.25, height: 2.6, slabThickness: 0.1 }), planShape: "custom_polygon" as const, planPolygon: twoPiece,
    geometry: { width: 1.8, depth: 1.4, wallThickness: 0.25, height: 2.6, slabThickness: 0.1, baseboardDepth: 0.015 },
    surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { "wall-0": laminate(12) } } } } as RoomSnapshot;
  const panelled = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).find((space) => space.wallId === "wall-0")!;
  const fitted = fitCabinetToSpace(createCabinetPreset("base", "piece"), panelled, { mode: "fit_width" });
  if (!fitted.ok) throw new Error("a base run fits the panelled piece");
  const at = getCabinetFitPlacement(fitted.definition, 1.8, 1.4)!, [w, d, r] = [fitted.definition.totalWidth / 1000, fitted.definition.depth / 1000, at.rotationY];
  const run = { x: at.position[0], z: at.position[2], width: w, depth: d, rotationY: r }, stuck = outFrom(run, -0.03), aim = along(stuck, 0.2);
  const [x, z] = getBuiltInDragPlace(room, [stuck.x, stuck.z], aim.x, aim.z, w, d, r, { bottom: 0 });
  const across = (x - run.x) * Math.sin(r) + (z - run.z) * Math.cos(r);
  assert.ok(Math.abs(across) < 0.001, `two-piece wall: a drag from the stuck run keeps it on its own face (${(across * 1000).toFixed(1)} mm off)`);
}
for (const turnDeg of [0, 20]) {
  const document = importedDocument(`l-${turnDeg}`, { vertices: { a: [0, 0], b: [6000, 0], c: [6000, 2000], d: [4000, 2000], e: [4000, 4000], f: [0, 4000] }, rooms: { K: ["a", "b", "c", "d", "e", "f"] }, thicknessMm: 200 }, { turnDeg });
  const plain = importedCaseOf(document), panelled = importedCaseOf(document, (room) => ({ ...room, surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { "w-f-a": { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf", boardThicknessMm: 18, fixing: "battens" } } } } } }) as RoomSnapshot);
  const before = plain.rooms[0], after = panelled.rooms[0];
  const run = fitAndPlace(plain, before, hostsOf(plain, before).find((space) => space.wallId === `wall-${before.planEdgeWallIds!.indexOf("w-e-f")}`)!, "base");
  const opts = { planRooms: panelled.planRooms, canonical: panelled.model, bottom: 0 }, from: [number, number] = [run.x, run.z];
  const [ax, az] = [Math.cos(run.rotationY), -Math.sin(run.rotationY)], snap = getBuiltInSnapTarget(after, [run.x, 0, run.z], run.width, run.depth, run.rotationY, opts.planRooms, opts.canonical);
  assert.equal(contains(panelled, after, run), false, `imported L ${turnDeg}°: the panel cuts into it where it stands`);
  for (const [move, [x, z]] of [
    ["a 10 mm nudge", clampBuiltInToRoom(after, run.x + ax * 0.01, run.z + az * 0.01, run.width, run.depth, run.rotationY, { ...opts, from })],
    ["Snap to wall", clampBuiltInToRoom(after, snap[0], snap[1], run.width, run.depth, run.rotationY, { ...opts, from })],
    ["a 0.2 m drag", getBuiltInDragPlace(after, from, run.x + ax * 0.2, run.z + az * 0.2, run.width, run.depth, run.rotationY, opts)],
  ] as const) {
    assert.equal(contains(panelled, after, { ...run, x, z }), false, `imported L ${turnDeg}°: ${move} is refused`);
    assert.ok(Math.abs((x - run.x) * Math.sin(run.rotationY) + (z - run.z) * Math.cos(run.rotationY)) < 1e-9, `imported L ${turnDeg}°: ${move} doesn't take it off its wall`);
  }
}

console.log("Cabinetry imported faces tests passed.");
