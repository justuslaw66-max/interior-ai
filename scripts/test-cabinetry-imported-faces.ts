import assert from "node:assert/strict";

import { fitCabinetToSpace, getCabinetFitPlacement } from "../features/cabinetry/fitToSpace";
import { getCabinetAvailableSegments } from "../features/cabinetry/fitSegments";
import { createCabinetPreset } from "../features/cabinetry/presets";
import {
  buildCabinetryAvailableSpaces, findCabinetHostForWall, getCabinetCopyOffset, getCabinetPlacement, isCabinetPlacementRefused,
} from "../features/cabinetry/roomCabinetHosts";
import type { CabinetDefinition, CabinetHostSpace } from "../features/cabinetry/types";
import { snapshotToStored, storedToSnapshot } from "../lib/room-persistence";
import { clampBuiltInToRoom, getBuiltInSnapTarget, usesFurnitureRuleForBuiltIns } from "../lib/room-built-in-faces";
import { createRoom, type DesignSnapshot, type RoomSnapshot } from "../lib/room-types";
import { isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";
import { inRegion, toWorld, type Run } from "./built-in-faces-oracle-utils";
import { importedCaseOf, importedDocument, importedRegionOf, laminate } from "./built-in-imported-oracle-utils";
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
const along = (run: Run, metres: number) => ({ ...run, x: run.x + Math.cos(run.rotationY) * metres, z: run.z - Math.sin(run.rotationY) * metres });
const outFrom = (run: Run, metres: number) => ({ ...run, x: run.x + Math.sin(run.rotationY) * metres, z: run.z + Math.cos(run.rotationY) * metres });

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
    `the stem's face is 50 mm off its line (the rooms average ${(west.geometry.wallThickness * 500).toFixed(1)} mm)`);
  assert.equal(inDrawnRoom(c, west, run), true, "its run stands against it, inside the 3D view's walls");
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

console.log("Cabinetry imported faces tests passed.");
