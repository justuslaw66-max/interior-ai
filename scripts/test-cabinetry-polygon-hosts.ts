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
import { buildCabinetryAvailableSpaces, getCabinetCopyOffset, getCabinetPlacement } from "../features/cabinetry/roomCabinetHosts";
import { getCabinetAvailableSegments } from "../features/cabinetry/fitSegments";
import type { CabinetDefinition, CabinetHostSpace } from "../features/cabinetry/types";
import { canonicalFloorPlanToDesignSnapshot } from "../lib/floor-plan-legacy-adapters";
import { compileCanonicalFloorPlanRenderModel } from "../lib/floor-plan-render-model";
import { builtInFootprintFits, clampBuiltInToRoom, getBuiltInSnapTarget, getRoomBuiltInFaces } from "../lib/room-built-in-faces";
import { resizeCabinetToOverallWidth, setCabinetOverallWidthLocked } from "../features/cabinetry/automation";
import { validateCabinetDefinition } from "../features/cabinetry/validation";
import { isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";
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
      assert.ok(piece && Math.abs(piece.availableWidthMm - 1940) < 6, `${label}, panel on ${panelled}: wall-${index} is offered, about 1940 mm (${piece?.availableWidthMm})`);
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
assert.deepEqual(spikedHosts.map((space) => space.wallId), ["wall-0", "wall-3", "wall-4", "wall-5", "wall-6"], "the spike's two edges aren't offered");
assert.ok(getRoomBuiltInFaces(spiked).polygon.every((point) => point.z >= -1.44 - 1e-9), "and no face runs out along it");
const tiny = drawnRoom([{ x: 0, z: 0 }, { x: 0.1, z: 0 }, { x: 0.05, z: 0.08 }]);
const hostsOf = (room: RoomSnapshot) => buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.equal(getRoomBuiltInFaces(tiny).polygon.length, 0, "a 0.1 m triangle room has no exposed face");
assert.deepEqual(hostsOf(tiny), hostsOf({ ...tiny, floorElevationMm: 0 }), "so it has the line's hosts, as an imported plan's room");

// A nib narrower than its walls: an outward one 100 mm wide between 120 mm walls is filled by them, so it has no faces of its
// own and the wall's face runs on across it; an inward pilaster's sides are real faces.
const nibRoom = drawnRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: 0.05, z: 1.5 }, { x: 0.05, z: 1.6 }, { x: -0.05, z: 1.6 }, { x: -0.05, z: 1.5 }, { x: -2, z: 1.5 }]);
assert.deepEqual(buildCabinetryAvailableSpaces({ activeRoom: nibRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).map((space) => space.wallId),
  ["wall-0", "wall-1", "wall-2", "wall-6", "wall-7"], "the nib's three walls aren't offered");
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
// Wall cabinets hang above the baseboards: their ends keep the 10 mm from the end walls' faces (their back still stands off).
const [baseboardNorth] = buildCabinetryAvailableSpaces({ activeRoom: baseboardRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
const hung = getCabinetPlacement(fitCabinetToSpace(createCabinetPreset("wall", "hung"), { ...baseboardNorth, mountingHeightMm: 1450 }, { mode: "fit_width" }).definition, baseboardRoom);
const hungWidth = fitCabinetToSpace(createCabinetPreset("wall", "hung"), { ...baseboardNorth, mountingHeightMm: 1450 }, { mode: "fit_width" }).definition.totalWidth / 1000;
nearMm((hung.position[0] - hungWidth / 2 - (-2 + 0.06)) * 1000, 10, "wall cabinets: 10 mm from the west wall's face");

// A run made deeper after Fit: flagged only where Fit put it at a corner under 90°, not for a run far along the wall, and only
// once its front corner would cross the slanted wall (a 60° corner leaves it 10 mm, about 17 mm of depth).
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

console.log("Cabinet polygon host and placement tests passed.");
