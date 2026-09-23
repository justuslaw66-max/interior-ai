import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
  FloorPlanVertexV2,
} from "@/lib/floor-plan-document-v2";
import {
  buildCanonicalOpeningUpdateMutationV2,
  CanonicalOpeningProjectionErrorV2,
  commitCanonicalTopologyMutationToSnapshotV2,
  projectCanonicalOpeningToStraightWallV2,
  projectLegacyOpeningGestureToCanonicalWallV2,
} from "@/lib/floor-plan-topology-editor";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import {
  applyFloorPlanTopologyMutationV2,
  FloorPlanTopologyMutationErrorV2,
  type FloorPlanTopologyMutationContextV2,
} from "@/lib/floor-plan-topology-mutations";
import { HistoryManager } from "@/lib/historyManager";
import {
  applyConfirmedConsumerWallEditV2,
  ConsumerWallEditErrorV2,
  isConsumerWallEditLocalForkV2,
} from "@/lib/floor-plan-consumer-wall-edit";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import type { DesignSnapshot } from "@/lib/room-types";

const sourceId = "source-editor-fixture";

function provenance(
  basis: FloorPlanEntityProvenanceV2["evidence"][number]["basis"] = "vector_traced"
): FloorPlanEntityProvenanceV2 {
  return {
    confidence: basis === "inferred" ? 0.4 : 0.98,
    extractionVersion: "editor-fixture-v1",
    evidence: [
      {
        sourceId,
        basis,
        confidence: basis === "inferred" ? 0.4 : 0.98,
        extractorVersion: "editor-fixture-v1",
        pageNumber: 1,
      },
    ],
    reviewHistory: [],
  };
}

function vertex(id: string, xMm: number, zMm: number): FloorPlanVertexV2 {
  return { id, xMm, zMm, provenance: provenance() };
}

function floor(): FloorPlanFloorV2 {
  return {
    id: "floor-1",
    name: "Level 1",
    levelIndex: 0,
    elevationMm: 0,
    storeyHeightMm: 2800,
    slabThicknessMm: 150,
    defaults: {
      wallHeight: {
        valueMm: 2600,
        evidence: "assumed",
        provenance: provenance("inferred"),
      },
      doorHeight: {
        valueMm: 2100,
        evidence: "assumed",
        provenance: provenance("inferred"),
      },
      windowHeight: {
        valueMm: 1200,
        evidence: "assumed",
        provenance: provenance("inferred"),
      },
      windowSillHeight: {
        valueMm: 900,
        evidence: "assumed",
        provenance: provenance("inferred"),
      },
    },
    calibrations: [],
    vertices: [
      vertex("north-west", 0, 0),
      vertex("north-east", 4000, 0),
      vertex("south-east", 4000, 3000),
      vertex("south-west", 0, 3000),
    ],
    walls: [
      {
        id: "north-wall",
        path: {
          kind: "line",
          startVertexId: "north-west",
          endVertexId: "north-east",
        },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["living"],
        provenance: provenance(),
      },
      {
        id: "east-wall",
        path: {
          kind: "line",
          startVertexId: "north-east",
          endVertexId: "south-east",
        },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["living"],
        provenance: provenance(),
      },
      {
        id: "south-wall",
        path: {
          kind: "line",
          startVertexId: "south-east",
          endVertexId: "south-west",
        },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["living"],
        provenance: provenance(),
      },
      {
        id: "west-wall",
        path: {
          kind: "line",
          startVertexId: "south-west",
          endVertexId: "north-west",
        },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["living"],
        provenance: provenance(),
      },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        wallLoops: [
          {
            kind: "outer",
            walls: [
              { wallId: "north-wall", direction: "forward" },
              { wallId: "east-wall", direction: "forward" },
              { wallId: "south-wall", direction: "forward" },
              { wallId: "west-wall", direction: "forward" },
            ],
          },
        ],
        provenance: provenance(),
      },
    ],
    openings: [
      {
        id: "living-window",
        wallId: "north-wall",
        kind: "window",
        operation: "fixed",
        offsetMm: 800,
        widthMm: 800,
        heightMm: 1200,
        sillHeightMm: 900,
        hinge: "none",
        handing: "none",
        provenance: provenance(),
      },
      {
        id: "living-door",
        wallId: "north-wall",
        kind: "door",
        operation: "swing",
        offsetMm: 2600,
        widthMm: 600,
        heightMm: 2100,
        sillHeightMm: 0,
        hinge: "start",
        handing: "left",
        provenance: provenance(),
      },
    ],
    structures: [],
    annotations: [],
    dimensions: [],
  };
}

function document(): FloorPlanDocumentV2 {
  return {
    schemaVersion: 2,
    units: "mm",
    id: "editor-fixture",
    revisionId: "published-revision-1",
    createdAt: "2026-07-16T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [
      {
        id: sourceId,
        kind: "pdf",
        name: "Editor fixture",
        mimeType: "application/pdf",
        sha256: "c".repeat(64),
        pageCount: 1,
      },
    ],
    floors: [floor()],
  };
}

function context(id: string): FloorPlanTopologyMutationContextV2 {
  return {
    mutationId: `editor-${id}`,
    nextRevisionId: `local-${id}`,
    actorId: "design-editor-test",
    mutatedAt: "2026-07-16T03:00:00.000Z",
    note: "Editor regression fixture",
  };
}

function expectProjectionError(
  callback: () => unknown,
  code: CanonicalOpeningProjectionErrorV2["code"]
) {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof CanonicalOpeningProjectionErrorV2);
    assert.equal(error.code, code);
    return true;
  });
}

const canonical = document();
compileFloorPlanDocumentV2(canonical);
const initialProjection = canonicalFloorPlanToDesignSnapshot(canonical, {
  addressTransform: "normal",
  sourceRevisionGeometryHash: "source-geometry-1",
});
const baseRoom = initialProjection.snapshot.rooms[0];
const baseSnapshot: DesignSnapshot = {
  ...initialProjection.snapshot,
  rooms: [
    {
      ...baseRoom,
      surfaces: {
        floor: { materialId: "surface-floor-fixture" },
        walls: { faces: { "north-wall": { paintColorHex: "#123456" } } },
      },
      surfaceFinishes: {
        floor: { materialId: "surface-floor-fixture" },
        walls: { faces: { "north-wall": { paintColorHex: "#123456" } } },
      },
      items: [
        {
          instanceId: "sofa-1",
          productId: "fixture-sofa",
          variantId: "default",
          position: [0.4, 0, 0.2],
          rotationY: 0.5,
        },
      ],
      zones: [
        { id: "zone-1", type: "seating", itemIds: ["sofa-1"], source: "manual" },
      ],
      savedViews: [
        {
          id: "view-1",
          name: "Living view",
          cameraPosition: [4, 3, 4],
          cameraTarget: [0, 0, 0],
        },
      ],
    },
  ],
  floorPlan: {
    ...initialProjection.snapshot.floorPlan,
    revisionId: "published-revision-1",
    sourceRevisionGeometryHash: "source-geometry-1",
    addressTransform: "mirror_x",
    addressBinding: {
      bindingId: "binding-1",
      countryCode: "SG",
      addressNormalized: "810A CHAI CHEE STREET",
      block: "810A",
      street: "Chai Chee Street",
      postalCode: null,
      stack: "509",
      floorMin: 2,
      floorMax: 15,
      transform: "mirror_x",
      unitFloor: 12,
      unitStack: "509",
    },
    orientationConfirmed: true,
  },
};

const projected = projectCanonicalOpeningToStraightWallV2({
  document: canonical,
  openingId: "living-window",
  centerMm: { xMm: 2000, zMm: 0 },
  widthMm: 1200,
});
assert.equal(projected.offsetMm, 1400);
assert.deepEqual(projected.projectedCenterMm, { xMm: 2000, zMm: 0 });
assert.equal(projected.distanceFromWallMm, 0);

expectProjectionError(
  () =>
    projectCanonicalOpeningToStraightWallV2({
      document: canonical,
      openingId: "living-window",
      centerMm: { xMm: 2000, zMm: 500 },
      widthMm: 1200,
    }),
  "POINT_OFF_WALL"
);

const legacyWindow = baseSnapshot.floorPlan!.openings!.find(
  (opening) => opening.id === "living-window"
)!;
assert.equal(legacyWindow.canonicalWallId, "north-wall");
const legacyProjected = projectLegacyOpeningGestureToCanonicalWallV2({
  snapshot: baseSnapshot,
  opening: legacyWindow,
  centerOffsetMm: 0,
  widthMm: 1200,
});
assert.equal(legacyProjected.offsetMm, 1400);

const operation = buildCanonicalOpeningUpdateMutationV2({
  snapshot: baseSnapshot,
  opening: legacyWindow,
  centerOffsetMm: 0,
  widthMm: 1200,
});
const originalJson = JSON.stringify(baseSnapshot);
const result = applyFloorPlanTopologyMutationV2(canonical, operation, context("move-window"));
const committed = commitCanonicalTopologyMutationToSnapshotV2(baseSnapshot, result);
assert.equal(JSON.stringify(baseSnapshot), originalJson, "Editor commit must be immutable.");
assert.equal(committed.snapshot.floorPlan?.canonicalGeometryHash, result.scene.geometryHash);
assert.equal(committed.snapshot.floorPlan?.canonicalDocument?.revisionId, "local-move-window");
assert.equal(
  committed.snapshot.floorPlan?.canonicalDocument?.parentRevisionId,
  "published-revision-1",
  "A saved gesture must not point at an unsaved pointer-move revision."
);
assert.equal(
  committed.snapshot.floorPlan?.revisionId,
  "published-revision-1",
  "A local child edit must retain the published revision used by update discovery."
);
assert.equal(committed.snapshot.floorPlan?.sourceRevisionGeometryHash, "source-geometry-1");
assert.equal(committed.snapshot.floorPlan?.addressTransform, "mirror_x");
assert.equal(committed.snapshot.floorPlan?.addressBinding?.bindingId, "binding-1");
assert.equal(committed.snapshot.floorPlan?.orientationConfirmed, true);
assert.equal(
  committed.snapshot.floorPlan?.openings?.find(({ id }) => id === "living-window")?.offsetMm,
  0
);
assert.equal(
  committed.snapshot.floorPlan?.openings?.find(({ id }) => id === "living-window")?.widthMm,
  1200
);
assert.deepEqual(committed.snapshot.rooms[0].items, baseSnapshot.rooms[0].items);
assert.deepEqual(committed.snapshot.rooms[0].zones, baseSnapshot.rooms[0].zones);
assert.deepEqual(committed.snapshot.rooms[0].savedViews, baseSnapshot.rooms[0].savedViews);
assert.equal(
  committed.snapshot.rooms[0].surfaces?.walls?.faces?.["north-wall"]?.paintColorHex,
  "#123456"
);

const reloaded = storedToSnapshot(
  JSON.parse(JSON.stringify(snapshotToStored(committed.snapshot)))
);
assert.equal(reloaded.floorPlan?.canonicalGeometryHash, result.scene.geometryHash);
assert.equal(reloaded.floorPlan?.revisionId, "published-revision-1");
assert.equal(reloaded.floorPlan?.canonicalDocument?.revisionId, "local-move-window");
assert.equal(reloaded.floorPlan?.canonicalDocument?.parentRevisionId, "published-revision-1");
assert.deepEqual(reloaded.rooms[0].items, baseSnapshot.rooms[0].items);

type EditorHistoryState = {
  snapshot: DesignSnapshot;
  openings: typeof committed.openings;
  fixedElements: typeof committed.fixedElements;
};
let historyState: EditorHistoryState = {
  snapshot: baseSnapshot,
  openings: initialProjection.openings,
  fixedElements: initialProjection.fixedElements,
};
const history = new HistoryManager<EditorHistoryState>(
  () => historyState,
  (next) => {
    historyState = next;
  }
);
history.begin("Move canonical opening");
historyState = {
  snapshot: committed.snapshot,
  openings: committed.openings,
  fixedElements: committed.fixedElements,
};
history.commit();
assert.equal(history.undo(), "Move canonical opening");
assert.equal(historyState.snapshot.floorPlan?.canonicalDocument?.revisionId, "published-revision-1");
assert.equal(history.redo(), "Move canonical opening");
assert.equal(historyState.snapshot.floorPlan?.canonicalDocument?.revisionId, "local-move-window");

assert.throws(
  () =>
    applyFloorPlanTopologyMutationV2(
      canonical,
      buildCanonicalOpeningUpdateMutationV2({
        snapshot: baseSnapshot,
        opening: legacyWindow,
        centerOffsetMm: 700,
        widthMm: 1000,
      }),
      context("overlap")
    ),
  (error: unknown) => {
    assert.ok(error instanceof FloorPlanTopologyMutationErrorV2);
    assert.ok(error.validationIssues.some((issue) => issue.code === "OVERLAPPING_OPENINGS"));
    return true;
  }
);

const deleteResult = applyFloorPlanTopologyMutationV2(
  canonical,
  { kind: "remove_opening", floorId: "floor-1", openingId: "living-window" },
  context("delete-window")
);
const deleted = commitCanonicalTopologyMutationToSnapshotV2(baseSnapshot, deleteResult);
assert.equal(
  deleted.snapshot.floorPlan?.canonicalDocument?.floors[0].openings.some(
    ({ id }) => id === "living-window"
  ),
  false
);
assert.equal(deleted.openings.some(({ id }) => id === "living-window"), false);
assert.equal(
  deleted.snapshot.floorPlan?.openings?.some(({ id }) => id === "living-window"),
  false,
  "Canonical delete must regenerate the projected opening collection atomically."
);
assert.equal(deleted.openings.some(({ id }) => id === "living-door"), true);
assert.equal(deleted.snapshot.floorPlan?.revisionId, "published-revision-1");
assert.equal(deleted.snapshot.floorPlan?.canonicalDocument?.revisionId, "local-delete-window");
assert.equal(
  deleted.snapshot.floorPlan?.canonicalDocument?.parentRevisionId,
  "published-revision-1"
);

assert.throws(
  () =>
    applyConfirmedConsumerWallEditV2({
      snapshot: baseSnapshot,
      operation: {
        kind: "update_wall",
        floorId: "floor-1",
        wallId: "north-wall",
        changes: { thicknessMm: 240 },
      },
      context: context("unconfirmed-wall-edit"),
      sourceEditConfirmed: false,
    }),
  (error: unknown) => {
    assert.ok(error instanceof ConsumerWallEditErrorV2);
    assert.equal(error.code, "CONFIRMATION_REQUIRED");
    return true;
  }
);

const sourceBeforeConsumerWallEdits = JSON.stringify(baseSnapshot);
let consumerWallCommit = applyConfirmedConsumerWallEditV2({
  snapshot: baseSnapshot,
  operation: {
    kind: "update_wall",
    floorId: "floor-1",
    wallId: "north-wall",
    changes: { thicknessMm: 240, classification: "structural" },
  },
  context: context("consumer-update-wall"),
  sourceEditConfirmed: true,
});
consumerWallCommit = applyConfirmedConsumerWallEditV2({
  snapshot: consumerWallCommit.snapshot,
  operation: {
    kind: "move_vertex",
    floorId: "floor-1",
    vertexId: "north-west",
    to: { xMm: -100, zMm: 0 },
  },
  context: context("consumer-move-vertex"),
  sourceEditConfirmed: true,
});
consumerWallCommit = applyConfirmedConsumerWallEditV2({
  snapshot: consumerWallCommit.snapshot,
  operation: {
    kind: "move_wall",
    floorId: "floor-1",
    wallId: "south-wall",
    deltaXMm: 0,
    deltaZMm: 100,
  },
  context: context("consumer-move-wall"),
  sourceEditConfirmed: true,
});
consumerWallCommit = applyConfirmedConsumerWallEditV2({
  snapshot: consumerWallCommit.snapshot,
  operation: {
    kind: "split_wall",
    floorId: "floor-1",
    wallId: "north-wall",
    offsetMm: 2000,
    newVertexId: "consumer-split-vertex-1",
    newWallId: "consumer-split-wall-1",
  },
  context: context("consumer-split-wall"),
  sourceEditConfirmed: true,
});
assert.equal(
  JSON.stringify(baseSnapshot),
  sourceBeforeConsumerWallEdits,
  "Consumer wall edits must never mutate the imported source snapshot."
);
assert.equal(isConsumerWallEditLocalForkV2(consumerWallCommit.snapshot), true);
assert.equal(
  consumerWallCommit.snapshot.floorPlan?.canonicalDocument?.parentRevisionId,
  "published-revision-1",
  "Every local edit must stay anchored to the loaded immutable revision."
);
assert.equal(
  consumerWallCommit.snapshot.floorPlan?.revisionId,
  "published-revision-1"
);
assert.equal(
  consumerWallCommit.snapshot.floorPlan?.canonicalDocument?.verification.tier,
  "needs_review"
);
assert.equal(consumerWallCommit.snapshot.floorPlan?.verificationTier, "needs_review");
assert.deepEqual(
  consumerWallCommit.snapshot.rooms.map(({ id }) => id),
  baseSnapshot.rooms.map(({ id }) => id)
);
assert.deepEqual(
  consumerWallCommit.snapshot.rooms[0].items,
  baseSnapshot.rooms[0].items,
  "Furniture local coordinates must survive wall edits."
);
assert.deepEqual(
  consumerWallCommit.snapshot.rooms[0].savedViews,
  baseSnapshot.rooms[0].savedViews
);
assert.equal(
  consumerWallCommit.snapshot.rooms[0].surfaces?.walls?.faces?.["north-wall"]
    ?.paintColorHex,
  "#123456"
);
assert.equal(
  consumerWallCommit.snapshot.rooms[0].surfaces?.walls?.faces?.[
    "consumer-split-wall-1"
  ]?.paintColorHex,
  "#123456",
  "Splitting a wall must copy its finish to the new segment."
);
assert.equal(
  consumerWallCommit.snapshot.floorPlan?.canonicalDocument?.floors[0].walls.find(
    ({ id }) => id === "north-wall"
  )?.thicknessMm,
  240
);

const persistedConsumerWallEdit = storedToSnapshot(
  JSON.parse(JSON.stringify(snapshotToStored(consumerWallCommit.snapshot)))
);
assert.equal(isConsumerWallEditLocalForkV2(persistedConsumerWallEdit), true);
assert.equal(
  persistedConsumerWallEdit.floorPlan?.canonicalDocument?.parentRevisionId,
  "published-revision-1"
);
assert.deepEqual(
  persistedConsumerWallEdit.rooms[0].items,
  baseSnapshot.rooms[0].items
);
assert.deepEqual(
  persistedConsumerWallEdit.rooms[0].savedViews,
  baseSnapshot.rooms[0].savedViews
);

let consumerWallHistoryState = baseSnapshot;
const consumerWallHistory = new HistoryManager<DesignSnapshot>(
  () => consumerWallHistoryState,
  (next) => {
    consumerWallHistoryState = next;
  }
);
consumerWallHistory.begin("Edit imported wall copy");
consumerWallHistoryState = consumerWallCommit.snapshot;
consumerWallHistory.commit();
assert.equal(consumerWallHistory.undo(), "Edit imported wall copy");
assert.equal(
  consumerWallHistoryState.floorPlan?.canonicalDocument?.revisionId,
  "published-revision-1"
);
assert.equal(consumerWallHistory.redo(), "Edit imported wall copy");
assert.equal(isConsumerWallEditLocalForkV2(consumerWallHistoryState), true);

const rejectedSnapshotJson = JSON.stringify(consumerWallCommit.snapshot);
assert.throws(() =>
  applyConfirmedConsumerWallEditV2({
    snapshot: consumerWallCommit.snapshot,
    operation: {
      kind: "move_wall",
      floorId: "floor-1",
      wallId: "south-wall",
      deltaXMm: 0.5,
      deltaZMm: 0,
    },
    context: context("consumer-invalid-wall"),
    sourceEditConfirmed: true,
  })
);
assert.equal(
  JSON.stringify(consumerWallCommit.snapshot),
  rejectedSnapshotJson,
  "Rejected wall topology must leave the local revision untouched."
);

const selectionSource = fs.readFileSync(
  path.join(process.cwd(), "lib/useDesignPageSelectionCoordinator.ts"),
  "utf8"
);
const sceneRegionRegistrationSource = fs.readFileSync(
  path.join(process.cwd(), "lib/useDesignPageSceneRegionWorkspaceRegistration.ts"),
  "utf8"
);
const importedWallControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib/useDesignPageImportedWallEditingController.ts"),
  "utf8"
);
const importedWallEditorSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/design-page/ImportedFloorPlanWallEditor.tsx"
  ),
  "utf8"
);
const viewportRegistrationSource = fs.readFileSync(
  path.join(process.cwd(), "lib/design-page-viewport-workspace-registration.ts"),
  "utf8"
);
const viewportReadModelSource = fs.readFileSync(
  path.join(process.cwd(), "lib/design-page-viewport-workspace-read-model.ts"),
  "utf8"
);
assert.match(selectionSource, /canonicalTopology\.actions\.removeOpening\(overlayId\)/);
assert.match(selectionSource, /deletePlanOverlay: deletePlanOverlayById/);
assert.match(
  sceneRegionRegistrationSource,
  /delete: selectionInspection\.actions\.selection\.deletePlanOverlayById/
);
assert.match(importedWallControllerSource, /applyConfirmedConsumerWallEditV2/);
assert.match(importedWallControllerSource, /runHistoryTransaction/);
for (const mutation of ["move_vertex", "move_wall", "update_wall", "split_wall"]) {
  assert.match(importedWallControllerSource, new RegExp(mutation));
}
assert.match(importedWallEditorSource, /Edit local copy/);
assert.match(importedWallEditorSource, /source plan is unchanged/i);
assert.match(importedWallEditorSource, /!straightWall/);
assert.match(viewportReadModelSource, /importedWallEditing\.state\.available/);
assert.match(
  viewportRegistrationSource,
  /importedWallEditor: importedWallEditing\.actions/
);

console.log("Floor-plan topology editor regression tests passed.");
