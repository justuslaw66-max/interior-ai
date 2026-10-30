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
import { buildCabinetryAvailableSpaces, clampBuiltInToRoom } from "../features/cabinetry/roomCabinetHosts";
import type { CabinetHostSpace } from "../features/cabinetry/types";
import { canonicalFloorPlanToDesignSnapshot } from "../lib/floor-plan-legacy-adapters";
import { getCanonicalPlanModel } from "../lib/room-built-in-faces";
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

// Built-ins against the finished face (J, 29 Oct 2026: "Face, back flush"; features/cabinetry/roomCabinetHosts.ts).
const nearMm = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} ≠ ${expected}`);
type FittedRun = { x: number; z: number; width: number; depth: number; rotationY: number; fitX: number; fitZ: number };
/** Fit a base run along `space`, place it as the Studio does (the built-in clamp), and give where Fit put it too. */
function placeFittedRun(room: RoomSnapshot, space: CabinetHostSpace, canonicalDocument?: ReturnType<typeof authoredApartment>): FittedRun {
  const fitted = fitCabinetToSpace(createCabinetPreset("base", `run-${space.id}`), space, { mode: "fit_width" });
  assert.equal(fitted.ok, true, `${space.label} should fit`);
  const at = getCabinetFitPlacement(fitted.definition, room.geometry.width, room.geometry.depth)!;
  const width = fitted.definition.totalWidth / 1000, depth = fitted.definition.depth / 1000;
  const [x, z] = clampBuiltInToRoom(room, at.position[0], at.position[2], width, depth, at.rotationY, { canonicalDocument });
  return { x, z, width, depth, rotationY: at.rotationY, fitX: at.position[0], fitZ: at.position[2] };
}
/** How far the run's back stands in front of the line z (north) or x (west) etc., along its own inward normal. */
const backOffset = (run: FittedRun, faceX: number, faceZ: number) =>
  (run.x - Math.sin(run.rotationY) * run.depth / 2 - faceX) * Math.sin(run.rotationY) +
  (run.z - Math.cos(run.rotationY) * run.depth / 2 - faceZ) * Math.cos(run.rotationY);

// An imported plan: each wall's own face. The apartment's walls are 200 mm, but 100 mm where the living room and bedroom meet;
// the rooms carry only their walls' average (175 mm), which would stand a run 12.5 mm into a 200 mm wall and 37.5 mm off the
// 100 mm one.
const apartment = authoredApartment();
const apartmentModel = getCanonicalPlanModel(apartment);
const importedRooms = canonicalFloorPlanToDesignSnapshot(apartment).snapshot.rooms;
const living = importedRooms.find((room) => room.id === "living")!;
assert.equal(living.geometry.wallThickness, 0.175, "the fixture's living room carries its walls' average");
const livingSpaces = buildCabinetryAvailableSpaces({ activeRoom: living, activePlanRoom: null, planRoomCount: 2, planOpenings: [], canonicalDocument: apartment });
assert.deepEqual(livingSpaces.map((space) => Math.round(space.availableWidthMm)), [4000 - 100 - 50, 6000 - 200, 4000 - 100 - 50, 6000 - 200],
  "the living room's faces: half of each wall in, 50 mm at the shared wall");
const livingRuns = livingSpaces.map((space) => placeFittedRun(living, space, apartment));
nearMm(backOffset(livingRuns[0], 0, -3 + 0.1) * 1000, 0, "a run's back on the 200 mm north wall's face");
nearMm(backOffset(livingRuns[1], 2 - 0.05, 0) * 1000, 0, "a run's back on the 100 mm shared wall's face");
livingRuns.forEach((run, index) => {
  nearMm(run.x * 1000, run.fitX * 1000, `living wall-${index}: the clamp keeps the run where Fit put it`);
  nearMm(run.z * 1000, run.fitZ * 1000, `living wall-${index}: the clamp keeps the run where Fit put it`);
  const dims = { w: run.width * 1000, d: run.depth * 1000, h: 870 };
  const contained = (x: number, z: number) => isPlacementContainedInRoom({
    room: living, position: [x, 0, z], rotationY: run.rotationY, dimensions: dims, canonicalModel: apartmentModel, builtIn: true,
  });
  assert.equal(contained(run.x, run.z), true, `living wall-${index}: a fitted run touches the plan's walls but is inside`);
  // A 10 mm nudge along the wall, as the inspector's nudge does, after the clamp.
  const along = { x: Math.cos(run.rotationY) * 0.01, z: -Math.sin(run.rotationY) * 0.01 };
  const [nudgedX, nudgedZ] = clampBuiltInToRoom(living, run.x + along.x, run.z + along.z, run.width, run.depth, run.rotationY,
    { from: [run.x, run.z], canonicalDocument: apartment });
  assert.equal(contained(nudgedX, nudgedZ), true, `living wall-${index}: still inside after a 10 mm nudge`);
  nearMm(backOffset({ ...run, x: nudgedX, z: nudgedZ }, run.x - Math.sin(run.rotationY) * run.depth / 2, run.z - Math.cos(run.rotationY) * run.depth / 2) * 1000, 0,
    `living wall-${index}: the nudge keeps the back on the face`);
  assert.equal(isPlacementContainedInRoom({
    room: living, position: [run.x, 0, run.z], rotationY: run.rotationY, dimensions: dims, canonicalModel: apartmentModel,
  }), false, `living wall-${index}: furniture as large would be into the wall`);
});

// Angled corners: a run on a straight wall next to an obtuse corner is inside the faces as Fit places it, so it stays put.
// The furniture clamp grew its box by half the wall and moved runs 166–800 mm off their walls.
const angledRoom = (planPolygon: Array<{ x: number; z: number }>) => ({
  ...createRoom("angled", "Angled", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }),
  planShape: "custom_polygon" as const, planPolygon,
}) as RoomSnapshot;
for (const [label, outline] of [
  ["a 120° corner", [{ x: -2, z: -1.5 }, { x: 1.134, z: -1.5 }, { x: 2, z: 0 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]],
  ["a 0.3 m chamfer", [{ x: -2, z: -1.5 }, { x: 1.7, z: -1.5 }, { x: 2, z: -1.2 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]],
  ["a 1 m chamfer", [{ x: -2, z: -1.5 }, { x: 1, z: -1.5 }, { x: 2, z: -0.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]],
] as const) {
  const room = angledRoom(outline.map((point) => ({ ...point })));
  buildCabinetryAvailableSpaces({ activeRoom: room, activePlanRoom: null, planRoomCount: 1, planOpenings: [] })
    .filter((space) => space.wallId !== "wall-1")
    .forEach((space) => {
      const run = placeFittedRun(room, space);
      nearMm(Math.hypot(run.x - run.fitX, run.z - run.fitZ) * 1000, 0, `${label}, ${space.wallId}: the run stays where Fit put it`);
      assert.equal(isPlacementContainedInRoom({
        room, position: [run.x, 0, run.z], rotationY: run.rotationY, dimensions: { w: run.width * 1000, d: run.depth * 1000, h: 870 }, builtIn: true,
      }), true, `${label}, ${space.wallId}: and is inside`);
    });
}

// A nib narrower than its walls: an outward one 100 mm wide between 120 mm walls has no faces of its own (its sides' faces lie
// inside each other's wall); an inward pilaster's sides are real faces.
const nibRoom = angledRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: 0.05, z: 1.5 }, { x: 0.05, z: 1.6 }, { x: -0.05, z: 1.6 }, { x: -0.05, z: 1.5 }, { x: -2, z: 1.5 }]);
assert.deepEqual(buildCabinetryAvailableSpaces({ activeRoom: nibRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).map((space) => space.wallId),
  ["wall-0", "wall-1", "wall-2", "wall-6", "wall-7"], "the nib's three walls aren't offered");
const pilasterRoom = angledRoom([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: 0.05, z: 1.5 }, { x: 0.05, z: 1.4 }, { x: -0.05, z: 1.4 }, { x: -0.05, z: 1.5 }, { x: -2, z: 1.5 }]);
assert.equal(buildCabinetryAvailableSpaces({ activeRoom: pilasterRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] }).length, 8,
  "a pilaster's sides and front are faces");

// A recorded baseboard: the back stands off the face by it, and the ends keep the 10 mm allowance from the end walls' baseboards.
const baseboardRoom = createRoom("baseboard", "Baseboard", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 });
baseboardRoom.geometry.baseboardDepth = 0.015;
const [baseboardNorth] = buildCabinetryAvailableSpaces({ activeRoom: baseboardRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
const baseboardRun = placeFittedRun(baseboardRoom, baseboardNorth);
nearMm((baseboardRun.x - baseboardRun.width / 2 - (-2 + 0.06)) * 1000, 15 + 10, "10 mm from the west wall's baseboard");
nearMm(((2 - 0.06) - (baseboardRun.x + baseboardRun.width / 2)) * 1000, 15 + 10, "10 mm from the east wall's baseboard");
nearMm(backOffset(baseboardRun, 0, -1.5 + 0.06) * 1000, 15, "its back against the north wall's baseboard");

console.log("Cabinet polygon host and placement tests passed.");
