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
import { createRoom, type DesignSnapshot } from "../lib/room-types";

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

console.log("Cabinet polygon host and placement tests passed.");
