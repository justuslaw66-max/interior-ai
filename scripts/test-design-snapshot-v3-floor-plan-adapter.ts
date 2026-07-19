import assert from "node:assert/strict";
import { designSnapshotV3ToFloorPlanDocumentV2 } from "@/lib/design-snapshot-v3-floor-plan-adapter";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { createRoom, type DesignSnapshot } from "@/lib/room-types";

const living = createRoom("living", "Living Room", "living", {
  width: 4,
  depth: 4,
  wallThickness: 0.2,
  height: 2.7,
  slabThickness: 0.15,
});
living.planPosition = { x: 2, z: 2 };
living.floorLevel = 1;
living.floorLabel = "Lower floor";
living.items = [
  {
    instanceId: "sofa-instance",
    productId: "sofa-product",
    variantId: "sofa-variant",
    position: [0.75, 0, -0.4],
    rotationY: 0.25,
    materialOverrides: { colorHex: "#334455", roughness: 0.6 },
  },
];
living.zones = [
  {
    id: "living-zone",
    type: "seating",
    itemIds: ["sofa-instance"],
    anchor: [0.5, 0, -0.25],
    source: "manual",
  },
];
living.savedViews = [
  {
    id: "living-view",
    name: "Sofa elevation",
    cameraPosition: [2, 1.6, 3],
    cameraTarget: [0, 0.8, 0],
    timestamp: 1234,
  },
];
living.layoutVersions = [
  {
    id: "living-version",
    name: "Preferred layout",
    source: "manual",
    timestamp: 5678,
    items: structuredClone(living.items),
    zones: structuredClone(living.zones),
    summary: { itemCount: 1, zoneCount: 1 },
  },
];
living.surfaces = {
  floor: { materialId: "oak-floor", pattern: "herringbone", rotationDeg: 90 },
  walls: {
    default: { paintColorHex: "#f5f0e8", paintName: "Warm white" },
    faces: { north: { materialId: "feature-wall" } },
  },
  ceiling: { paintColorHex: "#ffffff" },
};
living.surfaceFinishes = structuredClone(living.surfaces);
living.surfaceOpacity = { wall: 0.9, floor: 1, ceiling: 0.8 };
living.ceilingVisible = false;

const bedroom = createRoom("bedroom", "Bedroom", "bedroom", {
  width: 2,
  depth: 4,
  wallThickness: 0.2,
  height: 2.7,
  slabThickness: 0.15,
});
bedroom.planPosition = { x: 5, z: 2 };
bedroom.floorLevel = 1;
bedroom.floorLabel = "Lower floor";
bedroom.items = [
  {
    instanceId: "bed-instance",
    productId: "bed-product",
    variantId: "bed-variant",
    position: [-0.2, 0, 0.35],
    rotationY: Math.PI / 2,
  },
];
bedroom.zones = [];
bedroom.savedViews = [];
bedroom.layoutVersions = [];
bedroom.surfaceFinishes = {
  floor: { materialId: "bedroom-floor", pattern: "straight" },
};

const upperRoom = createRoom("upper-study", "Upper Study", "custom", {
  width: 3,
  depth: 3,
  wallThickness: 0.15,
  height: 2.6,
  slabThickness: 0.15,
});
upperRoom.planPosition = { x: 1.5, z: 1.5 };
upperRoom.floorLevel = 2;
upperRoom.floorLabel = "Upper floor";

const snapshot: DesignSnapshot = {
  version: 3,
  rooms: [living, bedroom, upperRoom],
  activeRoomId: "living",
  title: "Round-trip home",
  style: "warm minimal",
  budget: "mid",
  lightingPreset: "evening",
  notes: "Keep all room-local design state",
  floorPlan: {
    underlay: {
      id: "underlay-1",
      floorId: "floor-1",
      name: "Legacy plan scan",
      assetUrl: "/uploads/legacy-plan.webp",
      mimeType: "image/webp",
      sourceMimeType: "image/png",
      renderedPage: 1,
      pageCount: 1,
      widthPx: 1200,
      heightPx: 900,
      position: { x: 0, z: 0 },
      widthMeters: 6,
      depthMeters: 4,
      opacity: 0.5,
      rotationDeg: 0,
      locked: true,
      calibration: {
        pixelsPerMeter: 100,
        referenceLengthMeters: 4,
        referencePointsPx: [{ x: 10, y: 10 }, { x: 410, y: 10 }],
      },
    },
    sourceAssetSha256: "a".repeat(64),
    openings: [
      {
        id: "sliding-door",
        roomId: "living",
        wall: "east",
        offsetMm: 0,
        widthMm: 900,
        heightMm: 2100,
        bottomMm: 0,
        kind: "door",
        doorStyle: "sliding",
        operation: "sliding",
      },
      {
        id: "living-window",
        roomId: "living",
        wall: "north",
        offsetMm: 0,
        widthMm: 1200,
        heightMm: 1200,
        bottomMm: 900,
        kind: "window",
        operation: "fixed",
      },
      {
        id: "upper-window",
        roomId: "upper-study",
        wall: "north",
        offsetMm: 0,
        widthMm: 1000,
        kind: "window",
        operation: "fixed",
      },
    ],
    fixedElements: [
      {
        id: "service-strip",
        kind: "reference_zone",
        xMm: 6500,
        zMm: 2000,
        widthMm: 500,
        depthMm: 1800,
        rotationDeg: 0,
        label: "Service strip",
        locked: true,
        canonicalKind: "service_strip",
      },
    ],
  },
};

const migrated = designSnapshotV3ToFloorPlanDocumentV2(snapshot);
assert.equal(migrated.document.verification.tier, "needs_review");
assert.equal(migrated.document.verification.approvedBy, undefined);
assert.equal(migrated.document.verification.approvedAt, undefined);
assert.equal(migrated.document.floors.length, 2);
assert.deepEqual(
  migrated.document.floors.flatMap((floor) => floor.rooms.map((room) => room.id)),
  ["living", "bedroom", "upper-study"]
);
assert.ok(migrated.document.floors.every((floor) => floor.calibrations.length === 0));
assert.ok(
  migrated.reviewIssues.some(
    (issue) => issue.code === "SNAPSHOT_UNDERLAY_REGISTRATION_REQUIRES_REVIEW"
  ),
  "A legacy two-point calibration must not be promoted to verified registration."
);
assert.ok(
  migrated.document.floors[0].openings.some(
    (opening) =>
      opening.id === "sliding-door" &&
      opening.kind === "door" &&
      opening.operation === "sliding" &&
      opening.heightMm === 2100
  )
);
assert.ok(
  migrated.document.floors[0].openings.some(
    (opening) =>
      opening.id === "living-window" &&
      opening.kind === "window" &&
      opening.sillHeightMm === 900
  )
);
assert.deepEqual(
  migrated.document.floors[0].structures.map((structure) => [
    structure.id,
    structure.kind,
    structure.locked,
  ]),
  [["service-strip", "service_strip", true]]
);
assert.deepEqual(
  validateFloorPlanDocumentV2(migrated.document).filter(
    (issue) => issue.severity === "error"
  ),
  []
);

const roundTrip = canonicalFloorPlanToDesignSnapshot(migrated.document, {
  baseSnapshot: snapshot,
});
assert.equal(roundTrip.snapshot.rooms.length, snapshot.rooms.length);
assert.equal(roundTrip.snapshot.activeRoomId, snapshot.activeRoomId);
assert.equal(roundTrip.snapshot.title, snapshot.title);
assert.equal(roundTrip.snapshot.style, snapshot.style);
assert.equal(roundTrip.snapshot.budget, snapshot.budget);
assert.equal(roundTrip.snapshot.lightingPreset, snapshot.lightingPreset);
assert.equal(roundTrip.snapshot.notes, snapshot.notes);
assert.deepEqual(roundTrip.snapshot.floorPlan?.underlay, snapshot.floorPlan?.underlay);
assert.equal(
  roundTrip.snapshot.floorPlan?.orientationConfirmed,
  false,
  "A newly projected canonical plan must request non-blocking orientation confirmation."
);
for (const original of snapshot.rooms) {
  const projected = roundTrip.snapshot.rooms.find((room) => room.id === original.id);
  assert.ok(projected, `Room ${original.id} must survive the canonical round-trip.`);
  assert.deepEqual(projected.items, original.items, `${original.id} item coordinates changed.`);
  assert.deepEqual(projected.zones, original.zones, `${original.id} zones changed.`);
  assert.deepEqual(projected.savedViews, original.savedViews, `${original.id} views changed.`);
  assert.deepEqual(
    projected.layoutVersions,
    original.layoutVersions,
    `${original.id} layout versions changed.`
  );
  const originalSurfaces = original.surfaces ?? original.surfaceFinishes;
  const originalFaceIds = Object.keys(originalSurfaces?.walls?.faces ?? {});
  const compatibilityProjection = (
    surfaces: typeof projected.surfaces
  ) => {
    if (!surfaces?.walls?.faces) return surfaces;
    return {
      ...surfaces,
      walls: {
        ...surfaces.walls,
        faces: Object.fromEntries(
          originalFaceIds.flatMap((faceId) =>
            surfaces.walls?.faces?.[faceId]
              ? [[faceId, surfaces.walls.faces[faceId]]]
              : []
          )
        ),
      },
    };
  };
  assert.deepEqual(
    compatibilityProjection(projected.surfaces),
    originalSurfaces,
    `${original.id} legacy surface finish keys changed.`
  );
  assert.deepEqual(
    compatibilityProjection(projected.surfaceFinishes),
    original.surfaceFinishes ?? original.surfaces,
    `${original.id} compatibility finish keys changed.`
  );
  assert.deepEqual(projected.surfaceOpacity, original.surfaceOpacity);
  assert.equal(projected.ceilingVisible, original.ceilingVisible);
}

const projectedLiving = roundTrip.snapshot.rooms.find((room) => room.id === "living");
const livingCanonicalWallIds = migrated.document.floors[0].rooms
  .find((room) => room.id === "living")!
  .wallLoops.flatMap((loop) => loop.walls.map((reference) => reference.wallId));
assert.ok(
  livingCanonicalWallIds.some(
    (wallId) =>
      projectedLiving?.surfaces?.walls?.faces?.[wallId]?.materialId ===
      living.surfaces?.walls?.faces?.north?.materialId
  ),
  "A deterministic legacy cardinal finish must also be copied to its canonical wall ID."
);

const ambiguous = structuredClone(snapshot);
ambiguous.floorPlan!.openings!.push({
  id: "unhosted-opening",
  wall: "north",
  offsetMm: 0,
  widthMm: 900,
  kind: "door",
});
const ambiguousMigration = designSnapshotV3ToFloorPlanDocumentV2(ambiguous);
assert.ok(
  ambiguousMigration.reviewIssues.some(
    (issue) =>
      issue.code === "SNAPSHOT_OPENING_ROOM_AMBIGUOUS" &&
      issue.entityIds?.includes("unhosted-opening")
  )
);
assert.equal(ambiguousMigration.document.verification.tier, "needs_review");

const duplicateOpeningSnapshot = structuredClone(snapshot);
duplicateOpeningSnapshot.floorPlan!.openings!.find(
  (opening) => opening.id === "upper-window"
)!.id = "living-window";
const duplicateOpeningMigration = designSnapshotV3ToFloorPlanDocumentV2(
  duplicateOpeningSnapshot
);
assert.ok(
  duplicateOpeningMigration.reviewIssues.some(
    (issue) => issue.code === "SNAPSHOT_DUPLICATE_OPENING_ID"
  ),
  "Ambiguous legacy opening IDs across floors must become an explicit review issue."
);
assert.equal(
  new Set(
    duplicateOpeningMigration.document.floors.flatMap((floor) =>
      floor.openings.map((opening) => opening.id)
    )
  ).size,
  duplicateOpeningMigration.document.floors.reduce(
    (count, floor) => count + floor.openings.length,
    0
  ),
  "The needs-review candidate must still receive unambiguous canonical opening IDs."
);
assert.equal(
  validateFloorPlanDocumentV2(duplicateOpeningMigration.document).filter(
    (issue) => issue.code === "DUPLICATE_GLOBAL_ENTITY_ID"
  ).length,
  0
);

console.log("DesignSnapshot v3 to FloorPlanDocumentV2 migration checks passed.");
