import assert from "node:assert/strict";

import {
  createCabinetPolygonWallSpaces,
  createCabinetRoomWallSpaces,
  fitCabinetToSpace,
  getCabinetFitPlacement,
  mapCabinetCardinalOpeningsToPolygonWalls,
} from "../features/cabinetry/fitToSpace";
import { createCabinetPreset } from "../features/cabinetry/presets";
import { resolveCabinetTemplateHostCompatibility } from "../features/cabinetry/hostCompatibility";
import {
  buildCabinetSourceDefinitionJson,
  parseCabinetSourceDefinitionJson,
} from "../features/cabinetry/generateCabinetDocumentation";
import { snapshotToStored, storedToSnapshot } from "../lib/room-persistence";
import { createRoom, type DesignSnapshot, type RoomSnapshot } from "../lib/room-types";
import { buildCabinetryAvailableSpaces, findCabinetHostForWall, getCabinetCopyOffset, getCabinetPlacement } from "../features/cabinetry/roomCabinetHosts";
import { getCabinetAvailableSegments } from "../features/cabinetry/fitSegments";
import type { CabinetDefinition, CabinetHostSpace } from "../features/cabinetry/types";
import { canonicalFloorPlanToDesignSnapshot } from "../lib/floor-plan-legacy-adapters";
import { compileCanonicalFloorPlanRenderModel } from "../lib/floor-plan-render-model";
import { builtInFootprintFits, clampBuiltInToRoom, getBuiltInSnapTarget, getRoomBuiltInFaces } from "../lib/room-built-in-faces";
import { resizeCabinetToOverallWidth, setCabinetOverallWidthLocked } from "../features/cabinetry/automation";
import { validateCabinetDefinition } from "../features/cabinetry/validation";
import type { HousePlanRoom2D } from "../lib/design-page-house-plan";
import { isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";
import { inRegion, regionOf } from "./built-in-faces-oracle-utils";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";

const polygonSpaces = createCabinetPolygonWallSpaces({
  roomId: "polygon-room",
  roomName: "Angled room",
  roomType: "kitchen",
  heightMm: 2700,
  baseboardOffsetMm: 15,
  polygon: [
    { x: -2, z: -1.5 },
    { x: 2, z: -1.5 },
    { x: 2.5, z: 1.5 },
    { x: -2, z: 1.5 },
  ],
  openings: [
    {
      id: "polygon-window",
      wallId: "wall-0",
      kind: "window",
      offsetMm: 0,
      widthMm: 900,
      heightMm: 1000,
      bottomMm: 900,
    },
  ],
});

assert.equal(polygonSpaces.length, 4, "one Fit host should be generated per polygon edge");
assert(
  polygonSpaces.every((space) => space.roomType === "kitchen"),
  "polygon Fit hosts should preserve the structured project room type"
);
assert.equal(
  polygonSpaces[0].wallId,
  "wall-0",
  "polygon host IDs should match the house-plan selected-wall convention"
);
assert.equal(polygonSpaces[0].availableWidthMm, 4000);
assert.equal(polygonSpaces[0].openings.length, 1);

const rectangularSpaces = createCabinetRoomWallSpaces({
  roomId: "rectangular-bedroom",
  roomName: "Guest suite",
  roomType: "bedroom",
  widthMm: 4200,
  depthMm: 3300,
  heightMm: 2700,
});
assert.equal(rectangularSpaces.length, 4);
assert(
  rectangularSpaces.every((space) => space.roomType === "bedroom"),
  "rectangular Fit hosts should preserve the structured project room type"
);
assert.equal(
  rectangularSpaces[0]?.roomName,
  "Guest suite",
  "structured room type propagation must not replace the editable room label"
);
const secondWall = polygonSpaces[1];
assert(secondWall, "the polygon should include a second wall");
assert.equal((secondWall.wallSegment?.inwardNormalX ?? 0) < 0, true);
assert.equal(
  resolveCabinetTemplateHostCompatibility("Floor", polygonSpaces[0]).status,
  "compatible",
  "a wall boundary can fit a floor-supported cabinet"
);
assert.equal(
  resolveCabinetTemplateHostCompatibility("Wall", polygonSpaces[0]).status,
  "compatible"
);
assert.equal(
  resolveCabinetTemplateHostCompatibility("Ceiling", polygonSpaces[0]).status,
  "incompatible",
  "a ceiling-hosted template must not silently fit to a wall"
);
assert.equal(
  resolveCabinetTemplateHostCompatibility("Ceiling", {
    ...polygonSpaces[0],
    id: "ceiling-area",
    label: "Measured ceiling area",
    kind: "rectangular_area",
    wallId: undefined,
    wallSegment: undefined,
  }).status,
  "compatible"
);

const base = createCabinetPreset("base", "polygon-fit-base");
assert.equal(base.sourcePresetId, "base");
assert.equal(base.requiredHostType, "Floor");
const wallPreset = createCabinetPreset("wall", "durable-wall-host");
const ceilingPreset = createCabinetPreset("ceiling_beams", "durable-ceiling-host");
assert.equal(wallPreset.requiredHostType, "Wall");
assert.equal(ceilingPreset.requiredHostType, "Ceiling");
const ceilingRoundTrip = parseCabinetSourceDefinitionJson(
  buildCabinetSourceDefinitionJson(ceilingPreset)
);
assert.equal(ceilingRoundTrip.sourcePresetId, "ceiling_beams");
assert.equal(
  ceilingRoundTrip.requiredHostType,
  "Ceiling",
  "source export/import must preserve the template host constraint"
);
const legacyHostEnvelope = JSON.parse(
  buildCabinetSourceDefinitionJson(base)
) as {
  cabinetDefinition: { sourcePresetId?: unknown; requiredHostType?: unknown };
  sourceDefinitionFingerprint?: string;
};
delete legacyHostEnvelope.cabinetDefinition.sourcePresetId;
delete legacyHostEnvelope.cabinetDefinition.requiredHostType;
delete legacyHostEnvelope.sourceDefinitionFingerprint;
const legacyHostRoundTrip = parseCabinetSourceDefinitionJson(
  JSON.stringify(legacyHostEnvelope)
);
assert.equal(legacyHostRoundTrip.sourcePresetId, undefined);
assert.equal(legacyHostRoundTrip.requiredHostType, undefined);

for (const malformedSourcePresetId of ["", "   ", 42, null]) {
  const malformedPresetSource = JSON.parse(
    buildCabinetSourceDefinitionJson(wallPreset)
  ) as { cabinetDefinition: { sourcePresetId?: unknown } };
  malformedPresetSource.cabinetDefinition.sourcePresetId = malformedSourcePresetId;
  assert.throws(
    () => parseCabinetSourceDefinitionJson(JSON.stringify(malformedPresetSource)),
    /sourcePresetId/,
    `malformed durable source preset ${JSON.stringify(malformedSourcePresetId)} must be rejected`
  );
}
const malformedHostSource = JSON.parse(
  buildCabinetSourceDefinitionJson(wallPreset)
) as { cabinetDefinition: { requiredHostType?: string } };
malformedHostSource.cabinetDefinition.requiredHostType = "Desk";
assert.throws(
  () => parseCabinetSourceDefinitionJson(JSON.stringify(malformedHostSource)),
  /requiredHostType/,
  "malformed durable host constraints must be rejected"
);
for (const malformedHostType of ["wall", "", 42, null]) {
  const malformedTypedHostSource = JSON.parse(
    buildCabinetSourceDefinitionJson(wallPreset)
  ) as { cabinetDefinition: { requiredHostType?: unknown } };
  malformedTypedHostSource.cabinetDefinition.requiredHostType = malformedHostType;
  assert.throws(
    () => parseCabinetSourceDefinitionJson(JSON.stringify(malformedTypedHostSource)),
    /requiredHostType/,
    `malformed durable host type ${JSON.stringify(malformedHostType)} must be rejected`
  );
}
const rejectedCeilingFit = fitCabinetToSpace(base, polygonSpaces[0], {
  mode: "fit_width",
  requiredHostType: "Ceiling",
});
assert.equal(rejectedCeilingFit.ok, false);
assert.equal(rejectedCeilingFit.issues[0]?.code, "incompatible_host");
assert.strictEqual(
  rejectedCeilingFit.definition,
  base,
  "host incompatibility should refuse without changing the definition"
);
const fit = fitCabinetToSpace(base, polygonSpaces[0], {
  mode: "fit_width",
  alignment: "left",
  requiredHostType: "Floor",
});
assert.equal(fit.ok, true, "polygon wall should participate in the normal Fit engine");
const placement = getCabinetFitPlacement(fit.definition, 5, 3);
assert(placement, "polygon wall fit should resolve an arbitrary-wall plan transform");
assert.equal(Number.isFinite(placement.position[0]), true);
assert.equal(Number.isFinite(placement.position[2]), true);
assert.equal(Number.isFinite(placement.rotationY), true);
assert(
  placement.position[2] > -1.5,
  "north polygon edge should inset the fitted cabinet toward the room interior"
);

const lShapePolygon = [
  { x: -2, z: -1.5 },
  { x: 2, z: -1.5 },
  { x: 2, z: 0.2 },
  { x: 0.4, z: 0.2 },
  { x: 0.4, z: 1.5 },
  { x: -2, z: 1.5 },
] as const;
const mappedCardinalOpenings = mapCabinetCardinalOpeningsToPolygonWalls({
  polygon: lShapePolygon,
  openings: [
    {
      id: "north-door",
      wall: "north",
      kind: "door",
      offsetMm: 0,
      widthMm: 900,
      heightMm: 2100,
      bottomMm: 0,
    },
    {
      id: "south-window",
      wall: "south",
      kind: "window",
      offsetMm: -1000,
      widthMm: 600,
      heightMm: 900,
      bottomMm: 1000,
    },
    {
      id: "ambiguous-notch-window",
      wall: "east",
      kind: "window",
      offsetMm: 900,
      widthMm: 500,
      heightMm: 900,
      bottomMm: 1000,
    },
  ],
});
assert.equal(mappedCardinalOpenings.length, 2);
assert.equal(mappedCardinalOpenings[0]?.wallId, "wall-0");
assert.equal(mappedCardinalOpenings[0]?.offsetMm, 0);
assert.equal(mappedCardinalOpenings[1]?.wallId, "wall-4");
assert.equal(
  mappedCardinalOpenings.some((opening) => opening.id === "ambiguous-notch-window"),
  false,
  "cardinal opening data should not be guessed onto an interior polygon notch"
);
const lShapeSpaces = createCabinetPolygonWallSpaces({
  roomId: "l-room",
  roomName: "L room",
  heightMm: 2600,
  polygon: lShapePolygon,
  openings: mappedCardinalOpenings,
  installationClearanceSideMm: 130,
});
assert.equal(lShapeSpaces[0]?.openings[0]?.id, "north-door");
assert.equal(lShapeSpaces[4]?.openings[0]?.id, "south-window");
assert.equal(lShapeSpaces[0]?.installationClearanceLeftMm, 130);

const persistedRoom = createRoom("baseboard-room", "Baseboard room");
persistedRoom.geometry.baseboardDepth = 0.018;
const baseboardSnapshot: DesignSnapshot = {
  version: 3,
  activeRoomId: persistedRoom.id,
  rooms: [persistedRoom],
};
const storedBaseboardSnapshot = snapshotToStored(baseboardSnapshot);
assert.equal(storedBaseboardSnapshot.rooms[0]?.geometry.baseboardDepth, 0.018);
assert.equal(
  storedToSnapshot(storedBaseboardSnapshot).rooms[0]?.geometry.baseboardDepth,
  0.018,
  "baseboard projection should survive the persisted room round trip used by Fit"
);

assert.deepEqual(
  createCabinetPolygonWallSpaces({
    roomId: "invalid",
    roomName: "Invalid",
    heightMm: 2400,
    polygon: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
  }),
  [],
  "fewer than three polygon points should not create misleading hosts"
);

// Built-ins against the finished face (J, 29 Oct 2026: "Face, back flush"; features/cabinetry/roomCabinetHosts.ts,
// lib/room-built-in-faces.ts and lib/room-built-in-region.ts). scripts/test-built-in-faces-oracle.ts checks thousands of
// random rooms against the region's definition; these are worked examples.
const nearMm = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} ≠ ${expected}`);
type FittedRun = { x: number; z: number; width: number; depth: number; rotationY: number; fitX: number; fitZ: number; space: CabinetHostSpace };
/** Fit a base run along `space`, place it as the Studio does (the built-in clamp), and give where Fit put it too. */
function placeFittedRun(room: RoomSnapshot, space: CabinetHostSpace): FittedRun {
  const fitted = fitCabinetToSpace(createCabinetPreset("base", `run-${space.id}`), space, { mode: "fit_width" });
  assert.equal(fitted.ok, true, `${space.label} should fit`);
  const at = getCabinetFitPlacement(fitted.definition, room.geometry.width, room.geometry.depth)!;
  const width = fitted.definition.totalWidth / 1000, depth = fitted.definition.depth / 1000;
  const [x, z] = clampBuiltInToRoom(room, at.position[0], at.position[2], width, depth, at.rotationY);
  return { x, z, width, depth, rotationY: at.rotationY, fitX: at.position[0], fitZ: at.position[2], space };
}
const runsOf = (room: RoomSnapshot) =>
  buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).map((space) => placeFittedRun(room, space));
const containedAt = (room: RoomSnapshot, run: FittedRun, x = run.x, z = run.z, rotationY = run.rotationY, builtIn = true) =>
  isPlacementContainedInRoom({ room, position: [x, 0, z], rotationY, dimensions: { w: run.width * 1000, d: run.depth * 1000, h: 870 }, builtIn });
/** A move as the inspector makes one: clamped from where the run stands, then checked as the move is. */
function moveRun(room: RoomSnapshot, run: FittedRun, dx: number, dz: number) {
  const [x, z] = clampBuiltInToRoom(room, run.x + dx, run.z + dz, run.width, run.depth, run.rotationY, { from: [run.x, run.z] });
  return { x, z, contained: containedAt(room, run, x, z) };
}
/** How far a point stands from the line through `start` and `end`. */
const distanceFromLine = (point: { x: number; z: number }, start: { x: number; z: number }, end: { x: number; z: number }) =>
  Math.abs((end.x - start.x) * (point.z - start.z) - (end.z - start.z) * (point.x - start.x)) / Math.hypot(end.x - start.x, end.z - start.z);
/** The middle of the run's back, which stands on its wall's face. */
const backMiddle = (run: FittedRun) => ({ x: run.x - Math.sin(run.rotationY) * run.depth / 2, z: run.z - Math.cos(run.rotationY) * run.depth / 2 });
const drawnRoom = (planPolygon: Array<{ x: number; z: number }>, extra: Partial<RoomSnapshot> = {}) => ({
  ...createRoom("drawn", "Drawn", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }),
  planShape: "custom_polygon" as const, planPolygon, ...extra,
}) as RoomSnapshot;

// Angled corners: a run on a straight wall next to an obtuse corner is in the region as Fit places it, so it stays put and
// moves. The furniture clamp grew its box by half the wall and moved runs 166–800 mm off their walls.
for (const [label, outline] of [
  ["a 120° corner", [{ x: -2, z: -1.5 }, { x: 1.134, z: -1.5 }, { x: 2, z: 0 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]],
  ["a 0.3 m chamfer", [{ x: -2, z: -1.5 }, { x: 1.7, z: -1.5 }, { x: 2, z: -1.2 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]],
  ["a 1 m chamfer", [{ x: -2, z: -1.5 }, { x: 1, z: -1.5 }, { x: 2, z: -0.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]],
  // Under 90°, a run stands back from the corner until its front corner keeps the 10 mm from the slanted face.
  ["a 60° corner", [{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2 - 3 / Math.tan(Math.PI / 3), z: 1.5 }, { x: -2, z: 1.5 }]],
  ["a 45° corner", [{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: -1, z: 1.5 }, { x: -2, z: 1.5 }]],
] as const) {
  const room = drawnRoom(outline.map((point) => ({ ...point })));
  for (const run of runsOf(room)) {
    const wall = run.space.wallId;
    nearMm(Math.hypot(run.x - run.fitX, run.z - run.fitZ) * 1000, 0, `${label}, ${wall}: the run stays where Fit put it`);
    assert.equal(containedAt(room, run), true, `${label}, ${wall}: and is inside`);
    const index = Number(String(wall).replace("wall-", ""));
    nearMm(distanceFromLine(backMiddle(run), outline[index], outline[(index + 1) % outline.length]) * 1000, 60, `${label}, ${wall}: its back on the face`);
    const along = { x: Math.cos(run.rotationY), z: -Math.sin(run.rotationY) };
    for (const step of [0.01, -0.01, 0.2]) {
      assert.equal(moveRun(room, run, along.x * step, along.z * step).contained, true, `${label}, ${wall}: a ${step * 1000} mm move along is kept`);
    }
  }
}
const acute = drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2 - 3 / Math.tan(Math.PI / 3), z: 1.5 }, { x: -2, z: 1.5 }]);
const [acuteNorth] = buildCabinetryAvailableSpaces({ activeRoom: acute, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
const acuteSegments = getCabinetAvailableSegments(acuteNorth, 870, 0, 580);
nearMm(acuteSegments[0].endMm, acuteNorth.availableWidthMm / 2 - 10 / Math.sin(Math.PI / 3) - 580 / Math.tan(Math.PI / 3),
  "a 580 mm deep run stops 335 mm more before a 60° corner, where Fit and the Space step's usable length agree");
/** How far a run's nearest corner stands from the line through `start` and `end` (its four corners, at floor level). */
const runCorners = (run: FittedRun, back = 0) => [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([side, front]) => {
  const along = side * run.width / 2, across = -run.depth / 2 + front * run.depth + (front ? 0 : -back);
  return { x: run.x + along * Math.cos(run.rotationY) + across * Math.sin(run.rotationY), z: run.z - along * Math.sin(run.rotationY) + across * Math.cos(run.rotationY) };
});
const nearestTo = (run: FittedRun, start: { x: number; z: number }, end: { x: number; z: number }, back = 0) =>
  Math.min(...runCorners(run, back).map((corner) => distanceFromLine(corner, start, end)));
// At a corner under 90° the 10 mm is measured from the next face to the run's nearest point, its front corner, not along the
// wall (10 × sin 60° = 8.7 mm): the slanted wall's face is 60 mm in from its centre line.
const acuteRuns = runsOf(acute);
const slantStart = { x: 2, z: -1.5 }, slantEnd = { x: 2 - 3 / Math.tan(Math.PI / 3), z: 1.5 };
// (Fit rounds a run's width to the millimetre, so within half of one.)
const nearHalfMm = (actual: number, expected: number, message: string) => assert.ok(Math.abs(actual - expected) < 0.5, `${message}: ${actual} ≠ ${expected}`);
nearHalfMm(nearestTo(acuteRuns[0], slantStart, slantEnd) * 1000, 60 + 10, "the north run's front corner is 10 mm from the slanted wall's face");
const acuteBaseboard = { ...acute, geometry: { ...acute.geometry, baseboardDepth: 0.015 } } as RoomSnapshot;
const [baseboardAcuteRun] = runsOf(acuteBaseboard);
nearHalfMm(nearestTo(baseboardAcuteRun, slantStart, slantEnd) * 1000, 60 + 15 + 10, "and 10 mm from its 15 mm baseboard");

// Two edges running straight on with different panels: each face stands at its own depth, and they step at the joint.
const split = drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: 0, z: 1.5 }, { x: -2, z: 1.5 }], {
  surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { "wall-2": { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf", boardThicknessMm: 18, fixing: "battens" } } } } },
});
const splitRuns = runsOf(split);
const [panelled, bare] = ["wall-2", "wall-3"].map((wall) => splitRuns.find((run) => run.space.wallId === wall)!);
nearMm(panelled.space.wallSegment!.startZmm, panelled.space.wallSegment!.endZmm, "the panelled piece's face is straight");
nearMm(panelled.space.wallSegment!.startZmm, 1500 - 60 - 44, "on its panel");
nearMm(bare.space.wallSegment!.startZmm, 1500 - 60, "the bare piece's face is its own");
splitRuns.forEach((run) => {
  nearMm(Math.hypot(run.x - run.fitX, run.z - run.fitZ) * 1000, 0, `split ${run.space.wallId}: the run stays where Fit put it`);
  assert.equal(containedAt(split, run), true, `split ${run.space.wallId}: and is inside`);
});

// Moves that stop at a face are kept: into the wall it stays, along past its end it stops at the end allowance's limit.
const [rectNorth] = runsOf(createRoom("rect", "Rect", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }));
const rect = createRoom("rect", "Rect", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 });
const intoWall = moveRun(rect, rectNorth, 0, -0.01);
assert.equal(intoWall.contained, true, "a nudge into the wall is kept");
assert.ok(Math.abs(intoWall.z - rectNorth.z) < 0.0001, "and leaves the run on the face, within 0.1 mm");
const pastEnd = moveRun(rect, rectNorth, 0.05, 0);
assert.equal(pastEnd.contained, true, "a nudge past the end is kept");
assert.ok(Math.abs((pastEnd.x - rectNorth.x) * 1000 - 10) < 0.1, "and goes as far as the face, 10 mm (within 0.1 mm)");
// Snap to wall: to the nearest face, here the panelled one.
const panelledRoom = { ...rect, surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { north: { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf", boardThicknessMm: 18, fixing: "battens" } } } } } } as RoomSnapshot;
const [snapX, snapZ] = getBuiltInSnapTarget(panelledRoom, [0, 0, -1], 0.6, 0.58, 0);
nearMm((snapZ - 0.29) * 1000, -1500 + 60 + 44, "snaps its back onto the north panel's face");
nearMm(snapX, 0, "without moving along");

// Placing, as the Studio places (getCabinetPlacement): an L kitchen's second run shares the corner with the first, wall
// cabinets hang over a base run, and a copy of a run lands beside it. Placing doesn't refuse an item in the way, as before.
const lShape = { ...createRoom("l", "L", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }), planShape: "l_shape" as const };
const lSpaces = buildCabinetryAvailableSpaces({ activeRoom: lShape, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
const placed = (room: RoomSnapshot, definition: ReturnType<typeof createCabinetPreset>, copy = false) => {
  const { position, rotationY } = getCabinetPlacement(definition, room, copy);
  const inside = isPlacementContainedInRoom({ room, position, rotationY, dimensions: { w: definition.totalWidth, d: definition.depth, h: definition.height }, builtIn: true });
  return { position, rotationY, inside };
};
const fitOn = (space: CabinetHostSpace, preset: "base" | "wall", options: Parameters<typeof fitCabinetToSpace>[2] = { mode: "fit_width" }) =>
  fitCabinetToSpace(createCabinetPreset(preset, `${preset}-${space.id}`), space, options).definition;
const [lNorth, lEast] = [lSpaces[0], lSpaces[1]].map((space) => placed(lShape, fitOn(space, "base")));
assert.equal(lNorth.inside && lEast.inside, true, "an L kitchen: a base run on the north wall, then one on the east, both placed");
const wallUnits = placed(lShape, fitOn({ ...lSpaces[0], mountingHeightMm: 1450 }, "wall"));
assert.equal(wallUnits.inside, true, "wall cabinets over the base run, placed");
nearMm(wallUnits.position[1] * 1000, 1450, "at 1.45 m");
const fullRun = fitOn(lSpaces[0], "base");
const fullCopy = placed(lShape, fullRun, true);
assert.equal(fullCopy.inside, true, "a copy of a run filling its wall is placed, on it");
assert.ok(Math.abs((fullCopy.position[0] - lNorth.position[0]) * 1000 - 10) < 0.1 && fullCopy.position[2] === lNorth.position[2],
  "it moves only into the 10 mm allowance, up to the east wall's face");
// A copy moves 15 cm along its wall, as far as it still fits. An L-shape's walls have no compass name; a copy moved 15 cm in x
// and z and stopped as soon as that line met a wall.
lSpaces.forEach((space) => {
  const single = fitOn(space, "base", { mode: "fit_height" });
  const original = placed(lShape, single), copy = placed(lShape, single, true);
  assert.equal(copy.inside, true, `L ${space.wallId}: the copy is placed`);
  const dx = copy.position[0] - original.position[0], dz = copy.position[2] - original.position[2];
  nearMm(Math.hypot(dx, dz) * 1000, 150, `L ${space.wallId}: the copy moves 15 cm`);
  nearMm(Math.abs(dx * Math.cos(original.rotationY) - dz * Math.sin(original.rotationY)) * 1000, 150, `L ${space.wallId}: along its wall`);
});

// A tiny edge at a corner (a 10 mm chamfer, a 5 mm jog): its band lies inside its neighbours', so it has no exposed face, and
// theirs meet past it. The north face ran 25 mm into the east wall, and its run 15 mm.
const chamfered = drawnRoom([{ x: -2, z: -1.5 }, { x: 1.99, z: -1.5 }, { x: 2, z: -1.49 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]);
const chamferedSpaces = buildCabinetryAvailableSpaces({ activeRoom: chamfered, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
nearMm(chamferedSpaces[0].availableWidthMm, 3880, "a 10 mm chamfer: the north face runs to the east wall's face");
assert.equal(chamferedSpaces.some((space) => space.wallId === "wall-1"), false, "and the chamfer isn't offered");
const chamferedRun = placeFittedRun(chamfered, chamferedSpaces[0]);
nearMm((2 - 0.06 - (chamferedRun.x + chamferedRun.width / 2)) * 1000, 10, "its run ends 10 mm from the east face");
assert.equal(containedAt(chamfered, chamferedRun), true, "and is inside");
for (const degrees of [1, 10, 45, 80, 89]) {
  const angle = (degrees * Math.PI) / 180, jogX = 2 + 0.005 * Math.sin(angle), jogZ = -1.5 + 0.005 * Math.cos(angle);
  const jogged = drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: jogX, z: jogZ }, { x: jogX, z: 1.5 }, { x: -2, z: 1.5 }]);
  const faces = getRoomBuiltInFaces(jogged).polygon;
  assert.ok(Math.max(...faces.map((point) => point.x)) <= jogX - 0.06 + 1e-9, `a 5 mm jog at ${degrees}°: no face reaches past the east wall's`);
  assert.ok(Math.min(...faces.map((point) => point.z)) >= -1.5 + 0.06 - 1e-9, `a 5 mm jog at ${degrees}°: nor past the north wall's`);
  runsOf(jogged).forEach((run) => assert.equal(containedAt(jogged, run), true, `a 5 mm jog at ${degrees}°: ${run.space.wallId}'s run is inside`));
}

// A wall bent a little (hand-drawn, a millimetre off) with a panel on one piece: the panelled face ends at the bend, the bare
// one runs to where the faces meet, as on a straight wall. Joined where their lines crossed, faces of different depths met
// 1.26 m along for a 2° bend; a 1 mm bend offered neither piece.
const panelOn = (wall: string): RoomSnapshot["surfaces"] => ({
  walls: { default: { paintColorHex: "#ffffff" }, faces: { [wall]: { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf", boardThicknessMm: 18, fixing: "battens" } } } },
});
for (const [label, middleZ] of [["bent 2°", -1.5 + 2 * Math.tan(Math.PI / 90)], ["1 mm in", -1.499], ["1 mm out", -1.501]] as const) {
  for (const panelled of ["wall-0", "wall-1"]) {
    const bent = drawnRoom([{ x: -2, z: -1.5 }, { x: 0, z: middleZ }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }], { surfaces: panelOn(panelled) });
    const hosts = buildCabinetryAvailableSpaces({ activeRoom: bent, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
    const pieces = ["wall-0", "wall-1"].map((wall) => hosts.find((space) => space.wallId === wall));
    pieces.forEach((piece, index) => {
      // Each wall's core runs on half the wall past the bend (as the 3D view draws it), so at an inward bend the other piece's
      // face starts there, up to 60 mm further on.
      assert.ok(piece && piece.availableWidthMm > 1870 && piece.availableWidthMm < 1946, `${label}, panel on ${panelled}: wall-${index} is offered, 1.88–1.94 m (${piece?.availableWidthMm})`);
    });
    const panelX = panelled === "wall-0" ? -1 : 1;
    const intoPanel = builtInFootprintFits(getRoomBuiltInFaces(bent), panelX, -1.42 + 0.29, 1, 0.58, 0);
    assert.equal(intoPanel, false, `${label}, panel on ${panelled}: a built-in 24 mm into the panel isn't inside`);
  }
}

// Degenerate outlines: a zero-area spike drawn out of a wall is no wall; a room narrower than its walls has no exposed face,
// so it keeps the line's rule (its hosts, clamp and snap are furniture's, as an imported plan's are).
const spiked = drawnRoom([{ x: -2, z: -1.5 }, { x: 0, z: -1.5 }, { x: 0, z: -2.5 }, { x: 0, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]);
const spikedHosts = buildCabinetryAvailableSpaces({ activeRoom: spiked, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.deepEqual(spikedHosts.map((space) => space.wallId), ["wall-0", "wall-4", "wall-5", "wall-6"], "the spike's two edges aren't offered, and the wall either side of it is one face, listed once");
assert.equal(Math.round(spikedHosts[0].availableWidthMm), 3880, "the whole north wall's");
assert.ok(getRoomBuiltInFaces(spiked).polygon.every((point) => point.z >= -1.44 - 1e-9), "and no face runs out along it");
const tiny = drawnRoom([{ x: 0, z: 0 }, { x: 0.1, z: 0 }, { x: 0.05, z: 0.08 }]);
const hostsOf = (room: RoomSnapshot) => buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.equal(getRoomBuiltInFaces(tiny).polygon.length, 0, "a 0.1 m triangle room has no exposed face");
assert.deepEqual(hostsOf(tiny), hostsOf({ ...tiny, floorElevationMm: 0 }), "so it has the line's hosts, as an imported plan's room");

// A nib narrower than its walls: an outward one 100 mm wide between 120 mm walls is filled by them, so it has no faces of its
// own and the wall's face runs on across it; an inward pilaster's sides are real faces.
const nibRoom = drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: 0.05, z: 1.5 }, { x: 0.05, z: 1.6 }, { x: -0.05, z: 1.6 }, { x: -0.05, z: 1.5 }, { x: -2, z: 1.5 }]);
assert.deepEqual(buildCabinetryAvailableSpaces({ activeRoom: nibRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).map((space) => space.wallId),
  ["wall-0", "wall-1", "wall-2", "wall-7"], "the nib's three walls aren't offered, and the south wall either side of it is one face, listed once");
const pilasterRoom = drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: 0.05, z: 1.5 }, { x: 0.05, z: 1.4 }, { x: -0.05, z: 1.4 }, { x: -0.05, z: 1.5 }, { x: -2, z: 1.5 }]);
assert.equal(buildCabinetryAvailableSpaces({ activeRoom: pilasterRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).length, 8,
  "a pilaster's sides and front are faces");

// A recorded baseboard: the back stands off the face by it, and the ends keep the 10 mm allowance from the end walls' baseboards.
const baseboardRoom = createRoom("baseboard", "Baseboard", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 });
baseboardRoom.geometry.baseboardDepth = 0.015;
const [baseboardRun] = runsOf(baseboardRoom);
nearMm((baseboardRun.x - baseboardRun.width / 2 - (-2 + 0.06)) * 1000, 15 + 10, "10 mm from the west wall's baseboard");
nearMm(((2 - 0.06) - (baseboardRun.x + baseboardRun.width / 2)) * 1000, 15 + 10, "10 mm from the east wall's baseboard");
nearMm((backMiddle(baseboardRun).z - (-1.5 + 0.06)) * 1000, 15, "its back against the north wall's baseboard");
// Wall cabinets hang above the baseboards: their ends keep the 10 mm from the end walls' faces, and their back is on the face.
const [baseboardNorth] = buildCabinetryAvailableSpaces({ activeRoom: baseboardRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
const hungFit = fitCabinetToSpace(createCabinetPreset("wall", "hung"), { ...baseboardNorth, mountingHeightMm: 1450 }, { mode: "fit_width" });
const hung = getCabinetPlacement(hungFit.definition, baseboardRoom);
const hungWidth = hungFit.definition.totalWidth / 1000, hungDepth = hungFit.definition.depth / 1000;
nearMm((hung.position[0] - hungWidth / 2 - (-2 + 0.06)) * 1000, 10, "wall cabinets: 10 mm from the west wall's face");
nearMm((hung.position[2] - hungDepth / 2 - (-1.5 + 0.06)) * 1000, 0, "wall cabinets: the back on the north wall's face, not the baseboard");
assert.ok(!hungFit.issues.some((issue) => issue.code === "baseboard_offset_applied"), "and Fit doesn't say it stands off for the baseboard");
assert.ok(!validateCabinetDefinition(hungFit.definition).issues.some((issue) => issue.code === "fit.baseboard.clearance"), "nor does validation");

// A run made deeper after Fit: flagged only where Fit put it at a corner under 90°, not for a run far along the wall, and only
// once its front corner would cross the slanted wall (10 mm off it at a 60° corner: about 20 mm deeper, 10 mm over cos 60°,
// plus the 1 mm holdsRun allows).
const tooDeep = (definition: CabinetDefinition) =>
  validateCabinetDefinition(definition).issues.some((issue) => issue.code === "fit.corner_depth");
const deeperBy = (definition: CabinetDefinition, mm: number) =>
  ({ ...definition, depth: definition.depth + mm, modules: definition.modules.map((module) => ({ ...module, depth: module.depth + mm })) });
const cornerRun = fitCabinetToSpace(createCabinetPreset("base", "corner-full"), acuteNorth, { mode: "fit_width" }).definition;
assert.equal(tooDeep(cornerRun), false, "a run fitted at a 60° corner is fine as fitted");
assert.equal(tooDeep(deeperBy(cornerRun, 2)), false, "made 2 mm deeper, it only uses the allowance");
assert.equal(tooDeep(deeperBy(cornerRun, 40)), true, "made 40 mm deeper, its front corner would cross the slanted wall");
const shortRun = fitCabinetToSpace(createCabinetPreset("base", "corner-short"), acuteNorth, { mode: "fit_height" }).definition;
assert.equal(tooDeep(deeperBy(shortRun, 40)), false, "a run fitted by height only stands far from the corner: deeper, it is still fine");
const narrowed = resizeCabinetToOverallWidth(setCabinetOverallWidthLocked(cornerRun, false), cornerRun.totalWidth - 600).definition;
assert.equal(tooDeep(deeperBy(narrowed, 40)), false, "nor is a full run narrowed by 60 cm and then deepened");

// A straight wall drawn in two pieces is one face, listed once, with the doors the plan draws on it: a cardinal door stands at
// the middle of the piece that holds it, plus its offset (one about the short piece would fall on the long one too, so the plan
// can't place it). Measured from the room's middle, as the line did, this door stood 0.5 m off where it is drawn.
const twoPiece = drawnRoom([{ x: -2, z: -1.5 }, { x: 1, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]);
const pieceDoor = { id: "door", roomId: twoPiece.id, wall: "north" as const, kind: "door" as const, offsetMm: -600, widthMm: 600, heightMm: 2100, bottomMm: 0 };
const twoPieceNorth = buildCabinetryAvailableSpaces({ activeRoom: twoPiece, activePlanRoom: null, planRoomCount: 1, planOpenings: [pieceDoor] })
  .filter((space) => space.wallId === "wall-0" || space.wallId === "wall-1");
assert.equal(twoPieceNorth.length, 1, "the north face is listed once");
assert.deepEqual(twoPieceNorth[0].openings.map((opening) => [Math.round(opening.offsetMm), opening.widthMm]), [[-1100, 600]], "with the door where it is drawn, 1.1 m west of the face's middle");
const pieceRun = placeFittedRun(twoPiece, twoPieceNorth[0]);
assert.ok(pieceRun.x - pieceRun.width / 2 >= -0.8 - 1e-9, "the run stays off it");
nearMm(pieceRun.width * 1000, 2730, "and fills the longer side");

// The Studio preselects a selected wall's host: its own, or the one whose face runs over it.
const twoPieceHosts = buildCabinetryAvailableSpaces({ activeRoom: twoPiece, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.deepEqual(["wall-0", "wall-1", "wall-2"].map((wall) => findCabinetHostForWall(twoPiece, twoPieceHosts, wall)?.wallId ?? null), ["wall-0", "wall-0", "wall-2"],
  "a straight wall's later piece preselects the whole wall's host");
const nibHosts = buildCabinetryAvailableSpaces({ activeRoom: nibRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.deepEqual(["wall-3", "wall-4", "wall-5", "wall-6"].map((wall) => findCabinetHostForWall(nibRoom, nibHosts, wall)?.wallId ?? null), [null, "wall-2", null, "wall-2"],
  "a nib's tip, and the south wall's other piece, preselect the south face its walls run over; the nib's sides none");

// A rectangle's hosts are its faces' lines, whatever a column in a corner does to the faces' outline; runs keep 10 mm off it.
const square = (x: number, z: number) => [{ x, z }, { x: x + 0.3, z }, { x: x + 0.3, z: z + 0.3 }, { x, z: z + 0.3 }];
for (const [corner, column] of [["north-west", square(-1.94, -1.44)], ["south-east", square(1.64, 1.14)]] as const) {
  const columned = { ...rect, planHoles: [column] } as RoomSnapshot;
  const runs = runsOf(columned);
  assert.deepEqual(runs.map((run) => [run.space.wall, Math.round(run.space.availableWidthMm)]), [["north", 3880], ["east", 2880], ["south", 3880], ["west", 2880]], `${corner} column: the four faces`);
  const ends = runs.map((run) => [-1, 1].map((side) => Math.round((run.rotationY % Math.PI === 0 ? run.x + side * Math.cos(run.rotationY) * run.width / 2 : run.z - side * Math.sin(run.rotationY) * run.width / 2) * 1000)).sort((a, b) => a - b));
  assert.deepEqual(ends, corner === "north-west" ? [[-1630, 1930], [-1430, 1430], [-1930, 1930], [-1130, 1430]] : [[-1930, 1930], [-1430, 1130], [-1930, 1630], [-1430, 1430]], `${corner} column: runs 10 mm off it and the walls`);
}

// A narrow room: its runs' ends keep the allowance, not their fronts, which may stand up to the wall across (585 mm away).
for (const narrow of [createRoom("narrow", "Narrow", "kitchen", { width: 3, depth: 0.705, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }),
  drawnRoom([{ x: -1.5, z: -0.3525 }, { x: 1.5, z: -0.3525 }, { x: 1.5, z: 0.3525 }, { x: -1.5, z: 0.3525 }], { geometry: { width: 3, depth: 0.705, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 } })]) {
  const north = buildCabinetryAvailableSpaces({ activeRoom: narrow, activePlanRoom: null, planRoomCount: 1, planOpenings: [] })[0];
  for (const preset of ["base", "wall"] as const) {
    const definition = fitOn(preset === "wall" ? { ...north, mountingHeightMm: 1450 } : north, preset);
    assert.equal(definition.totalWidth, 2860, `${narrow.planShape ?? "rectangle"}, ${preset}: fills the wall`);
  }
}

// A face ends where a solid stands in front of it even when that solid is lower than a run's raised back (a bend's corner under
// a run on a 20 mm baseboard): the run keeps the allowance from the face's end, 10 mm up on the wall and 30 mm on the floor.
const bentIn = drawnRoom([{ x: -1.15, z: -2.11 }, { x: 0.06, z: -1.975 }, { x: 1.15, z: -2.11 }, { x: 1.15, z: 2.11 }, { x: -1.15, z: 2.11 }],
  { geometry: { width: 2.3, depth: 4.22, wallThickness: 0.08, height: 2.6, slabThickness: 0.1, baseboardDepth: 0.02 } });
const bentFace = getRoomBuiltInFaces(bentIn).exposed[1]!;
const bentHost = buildCabinetryAvailableSpaces({ activeRoom: bentIn, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).find((space) => space.wallId === "wall-1")!;
for (const [preset, allowanceMm] of [["wall", 10], ["base", 30]] as const) {
  const definition = fitOn(preset === "wall" ? { ...bentHost, mountingHeightMm: 1450 } : bentHost, preset), run = placed(bentIn, definition);
  const along = (run.position[0] - bentFace.start.x) * Math.cos(run.rotationY) - (run.position[2] - bentFace.start.z) * Math.sin(run.rotationY);
  nearHalfMm(along * 1000 - definition.totalWidth / 2, allowanceMm, `${preset} run at the bend: its start from the face's end`);
  assert.equal(run.inside, true, `${preset} run at the bend: inside`);
}

// An imported plan's rooms keep the line's rule for now: their walls each have their own thickness (the apartment's are 200 mm,
// 100 mm between its rooms), which the room doesn't carry (175 mm, their average), and they can be angled or curved. Hosts on
// the outline a whole average wall plus 10 mm off each end, and furniture's clamp and containment; moves are kept.
const living = canonicalFloorPlanToDesignSnapshot(authoredApartment()).snapshot.rooms.find((room) => room.id === "living")!;
assert.equal(living.geometry.wallThickness, 0.175, "the fixture's living room carries its walls' average");
const livingSpaces = buildCabinetryAvailableSpaces({ activeRoom: living, activePlanRoom: null, planRoomCount: 2, planOpenings: [] });
assert.deepEqual(livingSpaces.map((space) => [Math.round(space.availableWidthMm), space.installationClearanceLeftMm]),
  [[4000, 185], [6000, 185], [4000, 185], [6000, 185]], "the line's hosts");
const livingModel = compileCanonicalFloorPlanRenderModel(authoredApartment());
livingSpaces.map((space) => placeFittedRun(living, space)).forEach((run) => {
  const dims = { w: run.width * 1000, d: run.depth * 1000, h: 870 };
  const check = (x: number, z: number, builtIn: boolean) => isPlacementContainedInRoom({
    room: living, position: [x, 0, z], rotationY: run.rotationY, dimensions: dims, canonicalModel: livingModel, builtIn,
  });
  assert.equal(check(run.x, run.z, true), true, `living ${run.space.wallId}: a fitted run is inside, by furniture's rule`);
  assert.equal(check(run.x, run.z, true), check(run.x, run.z, false), `living ${run.space.wallId}: the same as furniture's`);
  const along = { x: Math.cos(run.rotationY) * 0.01, z: -Math.sin(run.rotationY) * 0.01 };
  const [nudgedX, nudgedZ] = clampBuiltInToRoom(living, run.x + along.x, run.z + along.z, run.width, run.depth, run.rotationY, { from: [run.x, run.z] });
  assert.equal(check(nudgedX, nudgedZ, true), true, `living ${run.space.wallId}: still inside after a 10 mm nudge`);
  assert.deepEqual(getCabinetCopyOffset(run.space, living), [0.15, 0.15], `living ${run.space.wallId}: a copy moves 15 cm in x and z, as on the line`);
});

// Rooms next door (the plan's rooms): the 3D view draws every room's walls, each at its own thickness, so a thicker wall next
// door moves the face. Room A, 4 x 3 m with 120 mm walls; B to its north with 200 mm walls, sharing A's north wall.
const nextDoor = (bWidth: number, bX: number, shape: "rectangle" | "custom_polygon") => {
  const a = shape === "rectangle" ? createRoom("A", "A", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 })
    : drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]);
  const room = { ...a, id: "A" } as RoomSnapshot;
  const planRooms = new Map([
    ["A", { id: "A", name: "A", roomType: "kitchen" as const, shape, ...(shape === "rectangle" ? {} : { polygon: room.planPolygon }), x: 0, z: 0, w: 4, d: 3, wallThickness: 0.12 }],
    ["B", { id: "B", name: "B", roomType: "living" as const, shape: "rectangle" as const, x: bX, z: -3, w: bWidth, d: 3, wallThickness: 0.2 }],
  ]);
  return { room, planRooms };
};
const bDoor = { id: "b-door", roomId: "B", wall: "south" as const, kind: "door" as const, offsetMm: 500, widthMm: 900, heightMm: 2100, bottomMm: 0 };
for (const shape of ["rectangle", "custom_polygon"] as const) {
  const { room, planRooms } = nextDoor(4, 0, shape);
  const hostsNextDoor = (planOpenings: typeof bDoor[] = []) =>
    buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 2, planOpenings, planRooms });
  const north = hostsNextDoor()[0], run = placeFittedRun(room, north);
  nearMm(north.wallSegment!.startZmm, -1400, `${shape}: A's north face is B's wall's, 100 mm off the line (it was A's own, 60 mm)`);
  nearMm((backMiddle(run).z + 1.4) * 1000, 0, `${shape}: the run's back is on it`);
  const atOwnFace = { ...run, z: -1.44 + run.depth / 2 };
  assert.equal(isPlacementContainedInRoom({ room, position: [atOwnFace.x, 0, atOwnFace.z], rotationY: 0, dimensions: { w: run.width * 1000, d: run.depth * 1000, h: 870 }, builtIn: true, planRooms }),
    false, `${shape}: one at A's own face stands 40 mm in B's wall`);
  assert.deepEqual(hostsNextDoor([bDoor])[0].openings.map((opening) => opening.offsetMm), [500], `${shape}: B's door on the shared wall cuts A's host where it is drawn`);
  const [westOfDoor] = getCabinetAvailableSegments(hostsNextDoor([bDoor])[0], 870, 0, 580);
  nearMm(westOfDoor.endMm, 500 - 450, `${shape}: a run stops at it`);
  // B half as wide, west of the middle: A's face is B's wall's as far as B's wall runs (to x = 0.1 m), then nothing behind it.
  const half = nextDoor(2, -1, shape), halfRun = placeFittedRun(half.room, buildCabinetryAvailableSpaces({ activeRoom: half.room, activePlanRoom: null, planRoomCount: 2, planOpenings: [], planRooms: half.planRooms })[0]);
  nearMm((backMiddle(halfRun).z + 1.4) * 1000, 0, `${shape}, half: the run's back on B's wall's face`);
  nearMm((0.1 - (halfRun.x + halfRun.width / 2)) * 1000, 10, `${shape}, half: 10 mm short of where it ends`);
}

// Fit's hosts are kept while only the room's items change (a group drag's frames, which rebuild the plan's rooms and their
// surfaces too), and rebuilt when a wall, a door or the room's baseboard does.
{
  const { room, planRooms } = nextDoor(4, 0, "custom_polygon");
  const hosts = (activeRoom: RoomSnapshot, rooms = planRooms, planOpenings: typeof bDoor[] = []) =>
    buildCabinetryAvailableSpaces({ activeRoom, activePlanRoom: null, planRoomCount: 2, planOpenings, planRooms: rooms });
  const kept = hosts(room), replanned = new Map([...planRooms].map(([id, other]) => [id, { ...other, surfaces: {} }]));
  assert.equal(hosts({ ...room, items: [...room.items] }, replanned), kept, "a new snapshot with new items keeps Fit's hosts");
  assert.notEqual(hosts(room, planRooms, [bDoor]), kept, "a door next door rebuilds them");
  const thicker = new Map(planRooms).set("B", { ...planRooms.get("B")!, wallThickness: 0.24 });
  assert.notEqual(hosts(room, thicker), kept, "a thicker wall next door rebuilds them");
  const before = hosts(room);
  room.geometry.baseboardDepth = 0.02;
  assert.notEqual(hosts(room), before, "a baseboard recorded on the same geometry rebuilds them");
}

// A wall next door only 10 mm proud of the face, over the middle of it, under a run raised on a 20 mm baseboard: the run doesn't
// meet it, but doesn't stand over it either (it stops 30 mm short of each end of it).
{
  const { room, planRooms } = nextDoor(1.2, 0, "custom_polygon");
  planRooms.set("B", { ...planRooms.get("B")!, wallThickness: 0.14 });
  const raised = { ...room, geometry: { ...room.geometry, baseboardDepth: 0.02 } } as RoomSnapshot;
  const [north] = buildCabinetryAvailableSpaces({ activeRoom: raised, activePlanRoom: null, planRoomCount: 2, planOpenings: [], planRooms });
  nearMm(north.wallSegment!.startZmm, -1440, "a 140 mm wall next door over 1.34 m of it: the face is A's own");
  const run = placeFittedRun(raised, north), [from, to] = [run.x - run.width / 2, run.x + run.width / 2];
  assert.ok(to <= -0.67 - 0.03 + 1e-6 || from >= 0.67 + 0.03 - 1e-6, `the run (${from.toFixed(3)}..${to.toFixed(3)}) isn't over the wall next door`);
}

// A door centred exactly on a drawn rectangle's corner is on the wall it runs along (the plan's tangent), not the other.
const cornerRoom = drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]);
const cornerDoor = { id: "corner", roomId: cornerRoom.id, wall: "east" as const, kind: "door" as const, offsetMm: -1500, widthMm: 800, heightMm: 2100, bottomMm: 0 };
assert.deepEqual(buildCabinetryAvailableSpaces({ activeRoom: cornerRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [cornerDoor] })
  .map((space) => [space.wallId, space.openings.map((opening) => opening.offsetMm)]), [["wall-0", []], ["wall-1", [-1500]], ["wall-2", []], ["wall-3", []]],
  "a door at the east wall's north end is on the east wall");

// Turned on an angled wall, a built-in stays against it: moved out along the wall's normal as little as it must, touching.
const hexagon = drawnRoom(Array.from({ length: 6 }, (_, index) => ({ x: 2 * Math.cos((index * Math.PI) / 3), z: 2 * Math.sin((index * Math.PI) / 3) })));
const hexagonRun = placeFittedRun(hexagon, buildCabinetryAvailableSpaces({ activeRoom: hexagon, activePlanRoom: null, planRoomCount: 1, planOpenings: [] })[0]);
const hexagonFace = { start: { x: 2 - 0.06 * Math.cos(Math.PI / 6), z: -0.06 * Math.sin(Math.PI / 6) } };
const faceNormal = { x: -Math.cos(Math.PI / 6), z: -Math.sin(Math.PI / 6) }; // wall-0, from (2, 0) to (1, 1.732), into the room
const fromFace = (point: { x: number; z: number }) => (point.x - hexagonFace.start.x) * faceNormal.x + (point.z - hexagonFace.start.z) * faceNormal.z;
for (const degrees of [15, 45, 90]) {
  const rotationY = hexagonRun.rotationY + (degrees * Math.PI) / 180, [width, depth] = [0.6, 0.58];
  const [x, z] = clampBuiltInToRoom(hexagon, hexagonRun.fitX, hexagonRun.fitZ, width, depth, rotationY);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([along, out]) => ({
    x: x + (along * width / 2) * Math.cos(rotationY) + (out * depth / 2) * Math.sin(rotationY), z: z - (along * width / 2) * Math.sin(rotationY) + (out * depth / 2) * Math.cos(rotationY),
  }));
  assert.ok(Math.abs(Math.min(...corners.map(fromFace))) < 0.0001, `turned ${degrees}°: a corner touches wall-0's face (${(Math.min(...corners.map(fromFace)) * 1000).toFixed(3)} mm)`);
  const moved = { x: x - hexagonRun.fitX, z: z - hexagonRun.fitZ };
  assert.ok(Math.abs(moved.x * faceNormal.z - moved.z * faceNormal.x) < 1e-9, `turned ${degrees}°: moved along the wall's normal only`);
  assert.equal(isPlacementContainedInRoom({ room: hexagon, position: [x, 0, z], rotationY, dimensions: { w: 600, d: 580, h: 870 }, builtIn: true }), true, `turned ${degrees}°: contained`);
}

// A door of the room next door straddling the end of the shared part of a wall: a hallway 8 x 1.5 m north of A (x -2..2) and
// C (x 2..6), its door centred at x 2.1, 900 mm wide. The 3D view cuts it into A's north wall too (from x 1.65), so A's run
// stops there.
for (const drawn of [false, true]) {
  const a = { ...(drawn ? drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }])
    : createRoom("A", "A", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 })), id: "A" } as RoomSnapshot;
  const planRoom = (id: string, x: number, z: number, w: number, d: number): HousePlanRoom2D =>
    ({ id, name: id, roomType: "living", shape: "rectangle", x, z, w, d, wallThickness: 0.12 });
  const planRooms = new Map<string, HousePlanRoom2D>([["A", { ...planRoom("A", 0, 0, 4, 3), ...(drawn ? { shape: "custom_polygon" as const, polygon: a.planPolygon } : {}) }],
    ["B", planRoom("B", 2, -2.25, 8, 1.5)], ["C", planRoom("C", 4, 0, 4, 3)]]);
  const hallDoor = { id: "hall-door", roomId: "B", wall: "south" as const, kind: "door" as const, offsetMm: 100, widthMm: 900, heightMm: 2100, bottomMm: 0 };
  const [north] = buildCabinetryAvailableSpaces({ activeRoom: a, activePlanRoom: null, planRoomCount: 3, planOpenings: [hallDoor], planRooms });
  const run = placeFittedRun(a, north);
  nearMm((run.x + run.width / 2) * 1000, 1650, `${drawn ? "drawn" : "rectangle"}: A's run stops where the hallway's door is cut into its wall`);
}

// A two-piece wall whose face a thicker wall next door deepens: the second piece still preselects the face over it.
{
  const twoPieceA = { ...drawnRoom([{ x: -2, z: -1.5 }, { x: 0.5, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]), id: "A" } as RoomSnapshot;
  twoPieceA.geometry = { ...twoPieceA.geometry, wallThickness: 0.08 };
  const planRooms = new Map([["A", { id: "A", name: "A", roomType: "kitchen" as const, shape: "custom_polygon" as const, polygon: twoPieceA.planPolygon, x: 0, z: 0, w: 4, d: 3, wallThickness: 0.08 }],
    ["B", { id: "B", name: "B", roomType: "living" as const, shape: "rectangle" as const, x: 0, z: -3, w: 4, d: 3, wallThickness: 0.3 }]]);
  const spaces = buildCabinetryAvailableSpaces({ activeRoom: twoPieceA, activePlanRoom: null, planRoomCount: 2, planOpenings: [], planRooms });
  nearMm(spaces[0].wallSegment!.startZmm, -1350, "the north face is the 300 mm wall's");
  assert.equal(findCabinetHostForWall(twoPieceA, spaces, "wall-1")?.wallId, "wall-0", "selecting the second piece preselects it");
}

// A turn beside a solid on the face, or in a corner under 90°, goes to the nearest place where the turned unit fits: along and
// out from the face, touching what stops it (no place within 2 mm of where it stood fits, on a 2 mm grid), and it stands
// where the 3D view leaves room for it (its own walls, panels and columns: scripts/built-in-faces-oracle-utils.ts).
const inDrawnRoom = (room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY: number) => {
  const region = regionOf(room), [cos, sin] = [Math.cos(rotationY), Math.sin(rotationY)];
  const at = (along: number, out: number) => ({ x: x + along * cos + out * sin, z: z - along * sin + out * cos });
  const samples = Array.from({ length: 301 }, (_, step) => step / 300).flatMap((t) => [
    at(-width / 2 + 0.0006 + (width - 0.0012) * t, -depth / 2 + 0.0006), at(-width / 2 + 0.0006 + (width - 0.0012) * t, depth / 2 - 0.0006),
    at(-width / 2 + 0.0006, -depth / 2 + 0.0006 + (depth - 0.0012) * t), at(width / 2 - 0.0006, -depth / 2 + 0.0006 + (depth - 0.0012) * t),
  ]);
  return samples.every((point) => inRegion(region, point));
};
function checkTurn(room: RoomSnapshot, label: string, x0: number, z0: number, rotationY: number) {
  const [width, depth] = [0.6, 0.58], faces = getRoomBuiltInFaces(room);
  const [x, z] = clampBuiltInToRoom(room, x0, z0, width, depth, rotationY), moved = Math.hypot(x - x0, z - z0);
  assert.ok(builtInFootprintFits(faces, x, z, width, depth, rotationY) && inDrawnRoom(room, x, z, width, depth, rotationY), `${label}: it fits where it goes`);
  for (let dx = -moved; dx <= moved; dx += 0.002) for (let dz = -moved; dz <= moved; dz += 0.002) {
    if (Math.hypot(dx, dz) < moved - 0.002) assert.ok(!builtInFootprintFits(faces, x0 + dx, z0 + dz, width, depth, rotationY, 0.00005), `${label}: moved ${(moved * 1000).toFixed(0)} mm, but it fits ${(Math.hypot(dx, dz) * 1000).toFixed(0)} mm away`);
  }
  return moved;
}
for (const drawn of [false, true]) {
  // A 300 mm column against the north face at x 0.5–0.8; a 600 × 580 unit 10 mm west of it, against the face.
  const base = drawn ? drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }])
    : createRoom("column", "Column", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 });
  const columnRoom = { ...base, planHoles: [[{ x: 0.5, z: -1.44 }, { x: 0.8, z: -1.44 }, { x: 0.8, z: -1.14 }, { x: 0.5, z: -1.14 }]] } as RoomSnapshot;
  const name = drawn ? "drawn" : "rectangle";
  const besideColumn = checkTurn(columnRoom, `${name}, by a column, turned -10°`, 0.19, -1.15, (-10 * Math.PI) / 180) * 1000;
  assert.ok(Math.abs(besideColumn - 60) < 1, `${name}: ${besideColumn.toFixed(1)} mm to the nearest fit beside the column (it went 250 mm out)`);
  checkTurn(columnRoom, `${name}, by a column, turned 10°`, 0.19, -1.15, (10 * Math.PI) / 180);
}
const acuteCorner = drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2 - 3 / Math.tan(Math.PI / 3), z: 1.5 }, { x: -2, z: 1.5 }]);
const [acuteCornerNorth] = buildCabinetryAvailableSpaces({ activeRoom: acuteCorner, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
const acuteUnit = placeFittedRun(acuteCorner, acuteCornerNorth);
// A 600 mm unit moved along the north wall into the 60° corner, as far as it goes.
const [cornerX, cornerZ] = clampBuiltInToRoom(acuteCorner, acuteUnit.fitX + 3, acuteUnit.fitZ, 0.6, 0.58, acuteUnit.rotationY, { from: [acuteUnit.fitX, acuteUnit.fitZ] });
for (const [degrees, nearest] of [[10, 65], [45, 131], [90, 10]] as const) {
  const moved = checkTurn(acuteCorner, `in a 60° corner, turned ${degrees}°`, cornerX, cornerZ, acuteUnit.rotationY + (degrees * Math.PI) / 180);
  assert.ok(Math.abs(moved * 1000 - nearest) < 3, `turned ${degrees}° in a 60° corner: ${(moved * 1000).toFixed(1)} mm to the nearest fit (it went 532–643 mm)`);
}

// A recorded 15 mm baseboard: a floor-standing built-in keeps its back on it whatever moves it (the clamp, Snap to wall, a
// turn) and containment holds it there; a wall cabinet (its bottom above the floor) hangs above it, its back on the face.
for (const drawn of [false, true]) {
  const room = { ...(drawn ? drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }])
    : createRoom("baseboard", "Baseboard", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 })) } as RoomSnapshot;
  room.geometry = { ...room.geometry, baseboardDepth: 0.015 };
  const [north] = buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
  const run = placeFittedRun(room, north), name = drawn ? "drawn" : "rectangle", backOff = (z: number, depth = run.depth) => (z - depth / 2 + 1.44) * 1000;
  // A move stops within the clamp's 0.05 mm of where it would stop fitting.
  const nearClamp = (actual: number, expected: number, message: string) => assert.ok(Math.abs(actual - expected) <= 0.051, `${message}: ${actual} ≠ ${expected}`);
  nearMm(backOff(run.z), 15, `${name}: Fit stands the run's back on the baseboard`);
  // Snap to wall from half a metre out: its target is on the baseboard and fits as it is.
  const [snapX, snapZ] = getBuiltInSnapTarget(room, [run.x, 0, run.z + 0.5], 0.6, run.depth, run.rotationY);
  nearClamp(backOff(clampBuiltInToRoom(room, snapX, snapZ, 0.6, run.depth, run.rotationY, { from: [run.x, run.z + 0.5] })[1]), 15, `${name}: Snap to wall too`);
  // With a 300 mm column against the north face in its way, the target doesn't fit, so the snap goes from where the unit
  // stands towards it and stops with its back on the column (the baseboard runs along the walls, not round a column).
  const columnRoom = { ...room, planHoles: [[{ x: 0.5, z: -1.44 }, { x: 0.8, z: -1.44 }, { x: 0.8, z: -1.14 }, { x: 0.5, z: -1.14 }]] } as RoomSnapshot;
  const columnFaces = getRoomBuiltInFaces(columnRoom), outFrom: [number, number] = [0.65, -1.14 + 0.29 + 0.5];
  const [towardX, towardZ] = getBuiltInSnapTarget(columnRoom, [outFrom[0], 0, outFrom[1]], 0.6, 0.58, 0);
  assert.equal(builtInFootprintFits(columnFaces, towardX, towardZ, 0.6, 0.58, 0, undefined, 0.015), false, `${name}: the snap's target is behind the column`);
  const [byColumnX, byColumnZ] = clampBuiltInToRoom(columnRoom, towardX, towardZ, 0.6, 0.58, 0, { from: outFrom });
  nearClamp((byColumnZ - 0.29 + 1.14) * 1000, 0, `${name}: Snap to wall stops with its back on the column`);
  assert.ok(Math.abs(byColumnX - 0.65) < 1e-9, `${name}: and doesn't move along the wall`);
  assert.equal(isPlacementContainedInRoom({ room: columnRoom, position: [byColumnX, 0, byColumnZ], rotationY: 0, dimensions: { w: 600, d: 580, h: 870 }, builtIn: true }), true, `${name}: and is contained there`);
  const [, nudgedZ] = clampBuiltInToRoom(room, run.x, run.z - 0.01, run.width, run.depth, run.rotationY, { from: [run.x, run.z] });
  nearClamp(backOff(nudgedZ), 15, `${name}: a nudge into the wall stops on the baseboard`);
  const dims = { w: 600, d: run.depth * 1000, h: 870 };
  assert.equal(isPlacementContainedInRoom({ room, position: [0, 0, -1.44 + 0.005 + run.depth / 2], rotationY: 0, dimensions: dims, builtIn: true }), false, `${name}: 5 mm off the face is in the baseboard`);
  assert.equal(isPlacementContainedInRoom({ room, position: [0, 0, -1.44 + 0.015 + run.depth / 2], rotationY: 0, dimensions: dims, builtIn: true }), true, `${name}: 15 mm off is on it`);
  const [, hungZ] = clampBuiltInToRoom(room, 0, -1.44 - 0.005 + 0.175, 0.6, 0.35, 0, { from: [0, -1.44 + 0.015 + 0.175], bottom: 1.45 });
  nearClamp(backOff(hungZ, 0.35), 0, `${name}: a wall cabinet hangs above it, its back on the face`);
  assert.equal(isPlacementContainedInRoom({ room, position: [0, 1.45, -1.44 + 0.175], rotationY: 0, dimensions: { w: 600, d: 350, h: 720 }, builtIn: true }), true, `${name}: and is contained there`);
  const turned = (10 * Math.PI) / 180, [turnX, turnZ] = clampBuiltInToRoom(room, 0, -1.44 + 0.015 + 0.29, 0.6, 0.58, turned);
  const backCorners = [-0.3, 0.3].map((along) => turnZ - along * Math.sin(turned) - 0.29 * Math.cos(turned));
  // Turned, its corner may reach the clamp's 0.05 mm in along each of its sides.
  assert.ok(Math.abs((Math.min(...backCorners) + 1.44) * 1000 - 15) <= 0.05 * (Math.cos(turned) + Math.sin(turned)) + 0.001, `${name}: a turn keeps its nearest back corner on the baseboard`);
  assert.ok(Math.abs(turnX) < 0.05, `${name}: and moves it out from the wall, not along it`);
}

console.log("Cabinet polygon host and placement tests passed.");
