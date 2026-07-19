import assert from "node:assert/strict";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
  FloorPlanVertexV2,
} from "@/lib/floor-plan-document-v2";
import {
  applyFloorPlanTopologyMutationV2,
  applyFloorPlanTopologyMutationsV2,
  FloorPlanTopologyMutationErrorV2,
  type FloorPlanTopologyMutationContextV2,
} from "@/lib/floor-plan-topology-mutations";

const sourceId = "source-plan";

function provenance(
  basis: FloorPlanEntityProvenanceV2["evidence"][number]["basis"] = "vector_traced"
): FloorPlanEntityProvenanceV2 {
  return {
    confidence: basis === "inferred" ? 0.4 : 0.98,
    extractionVersion: "fixture-extractor-v1",
    evidence: [
      {
        sourceId,
        basis,
        confidence: basis === "inferred" ? 0.4 : 0.98,
        extractorVersion: "fixture-extractor-v1",
        pageNumber: 1,
        cropPx: { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 },
        calibrationId: "calibration-1",
        sourceAnchors: [{ role: "start", sourcePx: { x: 10, y: 10 } }],
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
      wallHeight: { valueMm: 2600, evidence: "assumed", provenance: provenance("inferred") },
      doorHeight: { valueMm: 2100, evidence: "assumed", provenance: provenance("inferred") },
      windowHeight: { valueMm: 1200, evidence: "assumed", provenance: provenance("inferred") },
      windowSillHeight: { valueMm: 900, evidence: "assumed", provenance: provenance("inferred") },
    },
    calibrations: [
      {
        id: "calibration-1",
        sourceId,
        pageNumber: 1,
        imageWidthPx: 700,
        imageHeightPx: 300,
        controlPoints: [
          { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } },
          { sourcePx: { x: 700, y: 0 }, planMm: { xMm: 7000, zMm: 0 } },
        ],
        rmsErrorPx: 0.2,
      },
    ],
    vertices: [
      vertex("v0", 0, 0),
      vertex("v1", 4000, 0),
      vertex("v2", 7000, 0),
      vertex("v3", 7000, 3000),
      vertex("v4", 4000, 3000),
      vertex("v5", 0, 3000),
    ],
    walls: [
      {
        id: "living-north",
        path: { kind: "line", startVertexId: "v0", endVertexId: "v1" },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["living"],
        provenance: provenance(),
      },
      {
        id: "shared",
        path: { kind: "line", startVertexId: "v1", endVertexId: "v4" },
        thicknessMm: 100,
        classification: "interior",
        adjacentRoomIds: ["living", "bedroom"],
        provenance: provenance(),
      },
      {
        id: "living-south",
        path: { kind: "line", startVertexId: "v4", endVertexId: "v5" },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["living"],
        provenance: provenance(),
      },
      {
        id: "living-west",
        path: { kind: "line", startVertexId: "v5", endVertexId: "v0" },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["living"],
        provenance: provenance(),
      },
      {
        id: "bedroom-north",
        path: { kind: "line", startVertexId: "v1", endVertexId: "v2" },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["bedroom"],
        provenance: provenance(),
      },
      {
        id: "bedroom-east",
        path: { kind: "line", startVertexId: "v2", endVertexId: "v3" },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["bedroom"],
        provenance: provenance(),
      },
      {
        id: "bedroom-south",
        path: { kind: "line", startVertexId: "v3", endVertexId: "v4" },
        thicknessMm: 200,
        classification: "exterior",
        adjacentRoomIds: ["bedroom"],
        provenance: provenance(),
      },
    ],
    rooms: [
      {
        id: "living",
        name: "Living / Dining",
        roomType: "living",
        wallLoops: [
          {
            kind: "outer",
            walls: [
              { wallId: "living-north", direction: "forward" },
              { wallId: "shared", direction: "forward" },
              { wallId: "living-south", direction: "forward" },
              { wallId: "living-west", direction: "forward" },
            ],
          },
        ],
        provenance: provenance(),
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        wallLoops: [
          {
            kind: "outer",
            walls: [
              { wallId: "bedroom-north", direction: "forward" },
              { wallId: "bedroom-east", direction: "forward" },
              { wallId: "bedroom-south", direction: "forward" },
              { wallId: "shared", direction: "reverse" },
            ],
          },
        ],
        provenance: provenance(),
      },
    ],
    openings: [
      {
        id: "shared-door",
        wallId: "shared",
        kind: "door",
        operation: "swing",
        offsetMm: 300,
        widthMm: 600,
        hinge: "start",
        handing: "left",
        provenance: provenance(),
      },
      {
        id: "shared-passage",
        wallId: "shared",
        kind: "open_passage",
        operation: "open",
        offsetMm: 2200,
        widthMm: 500,
        hinge: "none",
        handing: "none",
        provenance: provenance(),
      },
      {
        id: "living-window",
        wallId: "living-north",
        kind: "window",
        operation: "fixed",
        offsetMm: 1000,
        widthMm: 800,
        hinge: "none",
        handing: "none",
        provenance: provenance(),
      },
    ],
    structures: [],
    annotations: [
      {
        id: "shared-note",
        kind: "note",
        text: "Service access",
        geometry: { kind: "wall_span", wallId: "shared", offsetMm: 2400, widthMm: 200 },
        provenance: provenance(),
      },
    ],
    dimensions: [],
  };
}

function document(): FloorPlanDocumentV2 {
  return {
    schemaVersion: 2,
    units: "mm",
    id: "mutation-fixture",
    revisionId: "revision-1",
    createdAt: "2026-07-16T00:00:00.000Z",
    verification: {
      tier: "source_verified",
      criticalIssueIds: [],
      approvedBy: "source-reviewer",
      approvedAt: "2026-07-16T00:30:00.000Z",
    },
    sources: [
      {
        id: sourceId,
        kind: "pdf",
        name: "Mutation fixture",
        mimeType: "application/pdf",
        sha256: "b".repeat(64),
        pageCount: 1,
      },
    ],
    floors: [floor()],
  };
}

function context(id: string): FloorPlanTopologyMutationContextV2 {
  return {
    mutationId: id,
    nextRevisionId: `revision-${id}`,
    actorId: "editor-user",
    mutatedAt: "2026-07-16T01:00:00.000Z",
    note: "Consumer edit",
  };
}

function expectError(
  callback: () => unknown,
  code: FloorPlanTopologyMutationErrorV2["code"],
  validationCode?: string
): FloorPlanTopologyMutationErrorV2 {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof FloorPlanTopologyMutationErrorV2);
    assert.equal(error.code, code);
    if (validationCode) {
      assert.ok(
        error.validationIssues.some((issue) => issue.code === validationCode),
        `Expected validation issue ${validationCode}; got ${error.validationIssues.map(({ code: issue }) => issue).join(", ")}`
      );
    }
    return error;
  }
  assert.fail(`Expected ${code}.`);
}

const original = document();
compileFloorPlanDocumentV2(original);
const originalJson = JSON.stringify(original);

const movedVertex = applyFloorPlanTopologyMutationV2(
  original,
  { kind: "move_vertex", floorId: "floor-1", vertexId: "v2", to: { xMm: 7500, zMm: 0 } },
  context("move-vertex")
);
assert.equal(JSON.stringify(original), originalJson, "Topology edits must never mutate their source document.");
assert.equal(movedVertex.document.parentRevisionId, "revision-1");
assert.equal(movedVertex.document.revisionId, "revision-move-vertex");
assert.deepEqual(movedVertex.document.verification, {
  tier: "needs_review",
  criticalIssueIds: ["topology-mutation:move-vertex"],
});
assert.equal(movedVertex.scene.verificationTier, "needs_review");
assert.equal(movedVertex.document.floors[0].vertices.find(({ id }) => id === "v2")?.xMm, 7500);
assert.deepEqual(
  movedVertex.document.floors[0].vertices.map(({ id }) => id).sort(),
  original.floors[0].vertices.map(({ id }) => id).sort(),
  "Moving a vertex must preserve every entity ID."
);
const movedProvenance = movedVertex.document.floors[0].vertices.find(({ id }) => id === "v2")!.provenance;
assert.equal(movedProvenance.confidence, 0.5);
assert.equal(movedProvenance.evidence[0].basis, "inferred");
assert.equal(movedProvenance.evidence[0].sourceAnchors, undefined);
assert.match(movedProvenance.reviewHistory.at(-1)?.note ?? "", /Needs independent review/);

const movedWall = applyFloorPlanTopologyMutationV2(
  original,
  { kind: "move_wall", floorId: "floor-1", wallId: "bedroom-east", deltaXMm: 400, deltaZMm: 0 },
  context("move-wall")
);
assert.equal(movedWall.document.floors[0].vertices.find(({ id }) => id === "v2")?.xMm, 7400);
assert.equal(movedWall.document.floors[0].vertices.find(({ id }) => id === "v3")?.xMm, 7400);
assert.equal(movedWall.scene.floors[0].walls.find(({ id }) => id === "bedroom-east")?.lengthMm, 3000);
assert.ok(movedWall.changedEntityIds.includes("bedroom"));

const updatedWall = applyFloorPlanTopologyMutationV2(
  original,
  {
    kind: "update_wall",
    floorId: "floor-1",
    wallId: "bedroom-east",
    changes: { thicknessMm: 225, classification: "structural" },
  },
  context("update-wall")
);
const updatedCanonicalWall = updatedWall.document.floors[0].walls.find(
  ({ id }) => id === "bedroom-east"
)!;
assert.equal(updatedCanonicalWall.thicknessMm, 225);
assert.equal(updatedCanonicalWall.classification, "structural");
assert.ok(updatedWall.changedEntityIds.includes("bedroom-east"));
assert.equal(updatedCanonicalWall.provenance.evidence[0].basis, "inferred");

const split = applyFloorPlanTopologyMutationV2(
  original,
  {
    kind: "split_wall",
    floorId: "floor-1",
    wallId: "shared",
    offsetMm: 1500,
    newVertexId: "shared-mid",
    newWallId: "shared-lower",
  },
  context("split-wall")
);
const splitFloor = split.document.floors[0];
assert.equal(splitFloor.walls.find(({ id }) => id === "shared")?.path.endVertexId, "shared-mid");
assert.deepEqual(splitFloor.walls.find(({ id }) => id === "shared-lower")?.path, {
  kind: "line",
  startVertexId: "shared-mid",
  endVertexId: "v4",
});
assert.equal(splitFloor.openings.find(({ id }) => id === "shared-door")?.wallId, "shared");
assert.deepEqual(
  splitFloor.openings.find(({ id }) => id === "shared-passage"),
  {
    ...original.floors[0].openings.find(({ id }) => id === "shared-passage"),
    wallId: "shared-lower",
    offsetMm: 700,
    provenance: splitFloor.openings.find(({ id }) => id === "shared-passage")!.provenance,
  }
);
assert.deepEqual(
  splitFloor.rooms.find(({ id }) => id === "living")?.wallLoops[0].walls.slice(1, 3),
  [
    { wallId: "shared", direction: "forward" },
    { wallId: "shared-lower", direction: "forward" },
  ]
);
assert.deepEqual(
  splitFloor.rooms.find(({ id }) => id === "bedroom")?.wallLoops[0].walls.slice(-2),
  [
    { wallId: "shared-lower", direction: "reverse" },
    { wallId: "shared", direction: "reverse" },
  ],
  "Reverse room loops must receive split walls in reverse order."
);
assert.deepEqual(splitFloor.annotations[0].geometry, {
  kind: "wall_span",
  wallId: "shared-lower",
  offsetMm: 900,
  widthMm: 200,
});
assert.equal(split.scene.floors[0].rooms.find(({ id }) => id === "living")?.areaSquareMm, 12_000_000);
assert.equal(split.scene.floors[0].rooms.find(({ id }) => id === "bedroom")?.areaSquareMm, 9_000_000);

const batch = applyFloorPlanTopologyMutationsV2(
  original,
  [
    {
      kind: "split_wall",
      floorId: "floor-1",
      wallId: "bedroom-north",
      offsetMm: 1500,
      newVertexId: "bedroom-north-mid",
      newWallId: "bedroom-north-east",
    },
    {
      kind: "add_opening",
      floorId: "floor-1",
      opening: {
        id: "new-window",
        wallId: "bedroom-north-east",
        kind: "window",
        operation: "fixed",
        offsetMm: 200,
        widthMm: 700,
        hinge: "none",
        handing: "none",
      },
    },
  ],
  context("atomic-batch")
);
assert.equal(batch.document.revisionId, "revision-atomic-batch");
assert.equal(batch.document.floors[0].openings.find(({ id }) => id === "new-window")?.wallId, "bedroom-north-east");
assert.ok(batch.changedEntityIds.includes("new-window"));

const added = applyFloorPlanTopologyMutationV2(
  original,
  {
    kind: "add_opening",
    floorId: "floor-1",
    opening: {
      id: "bedroom-window",
      wallId: "bedroom-north",
      kind: "window",
      operation: "fixed",
      offsetMm: 1000,
      widthMm: 1000,
      hinge: "none",
      handing: "none",
    },
  },
  context("add-opening")
);
assert.equal(added.document.floors[0].openings.length, original.floors[0].openings.length + 1);
assert.equal(added.document.floors[0].openings.at(-1)?.provenance.evidence[0].basis, "inferred");

const updated = applyFloorPlanTopologyMutationV2(
  original,
  {
    kind: "update_opening",
    floorId: "floor-1",
    openingId: "living-window",
    changes: { offsetMm: 2000, widthMm: 1000 },
  },
  context("update-opening")
);
assert.equal(updated.document.floors[0].openings.find(({ id }) => id === "living-window")?.offsetMm, 2000);
assert.equal(updated.document.floors[0].openings.find(({ id }) => id === "living-window")?.widthMm, 1000);

const documentedOpeningSource = document();
const documentedOpening = documentedOpeningSource.floors[0].openings.find(
  ({ id }) => id === "living-window"
)!;
documentedOpening.heightMm = 1200;
documentedOpening.heightEvidence = "source_documented";
documentedOpening.sillHeightMm = 900;
documentedOpening.sillHeightEvidence = "source_documented";
compileFloorPlanDocumentV2(documentedOpeningSource);
const correctedOpeningProperties = applyFloorPlanTopologyMutationV2(
  documentedOpeningSource,
  {
    kind: "update_opening",
    floorId: "floor-1",
    openingId: "living-window",
    changes: {
      heightMm: 1100,
      sillHeightMm: 800,
      hinge: "end",
      handing: "right",
    },
  },
  context("update-opening-properties")
).document.floors[0].openings.find(({ id }) => id === "living-window")!;
assert.equal(correctedOpeningProperties.heightMm, 1100);
assert.equal(correctedOpeningProperties.heightEvidence, "assumed");
assert.equal(correctedOpeningProperties.sillHeightMm, 800);
assert.equal(correctedOpeningProperties.sillHeightEvidence, "assumed");
assert.equal(correctedOpeningProperties.hinge, "end");
assert.equal(correctedOpeningProperties.handing, "right");

const removed = applyFloorPlanTopologyMutationV2(
  original,
  { kind: "remove_opening", floorId: "floor-1", openingId: "living-window" },
  context("remove-opening")
);
assert.equal(removed.document.floors[0].openings.some(({ id }) => id === "living-window"), false);
assert.ok(removed.changedEntityIds.includes("living-window"));
assert.equal(
  removed.document.floors[0].walls.find(({ id }) => id === "living-north")?.provenance.evidence[0].basis,
  "inferred"
);

const withStructure = applyFloorPlanTopologyMutationV2(
  original,
  {
    kind: "add_structure",
    floorId: "floor-1",
    structure: {
      id: "column-1",
      name: "Structural column",
      kind: "column",
      vertexIds: ["column-v1", "column-v2", "column-v3", "column-v4"],
      baseOffsetMm: 0,
      heightMm: 2600,
      locked: true,
    },
    vertices: [
      { id: "column-v1", xMm: 1000, zMm: 1000 },
      { id: "column-v2", xMm: 1600, zMm: 1000 },
      { id: "column-v3", xMm: 1600, zMm: 1600 },
      { id: "column-v4", xMm: 1000, zMm: 1600 },
    ],
  },
  context("add-structure")
);
const addedStructure = withStructure.document.floors[0].structures.find(
  ({ id }) => id === "column-1"
)!;
assert.equal(addedStructure.provenance.evidence[0].basis, "inferred");
assert.ok(withStructure.changedEntityIds.includes("column-v1"));
assert.ok(withStructure.changedEntityIds.includes("column-1"));

const changedStructure = applyFloorPlanTopologyMutationV2(
  withStructure.document,
  {
    kind: "update_structure",
    floorId: "floor-1",
    structureId: "column-1",
    changes: {
      name: "Shifted column",
      vertexIds: ["column-next-v1", "column-next-v2", "column-next-v3", "column-next-v4"],
    },
    vertices: [
      { id: "column-next-v1", xMm: 1800, zMm: 1000 },
      { id: "column-next-v2", xMm: 2400, zMm: 1000 },
      { id: "column-next-v3", xMm: 2400, zMm: 1600 },
      { id: "column-next-v4", xMm: 1800, zMm: 1600 },
    ],
  },
  context("update-structure")
);
assert.equal(
  changedStructure.document.floors[0].structures[0].name,
  "Shifted column"
);
assert.equal(
  changedStructure.document.floors[0].vertices.some(({ id }) => id === "column-v1"),
  false,
  "Replacing a structure polygon must prune its now-unreferenced vertices."
);

const withDimension = applyFloorPlanTopologyMutationV2(
  changedStructure.document,
  {
    kind: "add_dimension",
    floorId: "floor-1",
    dimension: {
      id: "column-width",
      label: "Column width",
      fromVertexId: "column-next-v1",
      toVertexId: "column-next-v2",
      axis: "horizontal",
      measuredMm: 600,
    },
  },
  context("add-dimension")
);
assert.equal(withDimension.document.floors[0].dimensions[0].measuredMm, 600);
assert.equal(
  withDimension.document.floors[0].dimensions[0].provenance.evidence[0].basis,
  "inferred"
);

const relabelledDimension = applyFloorPlanTopologyMutationV2(
  withDimension.document,
  {
    kind: "update_dimension",
    floorId: "floor-1",
    dimensionId: "column-width",
    changes: { label: "Verified column width" },
  },
  context("update-dimension")
);
assert.equal(
  relabelledDimension.document.floors[0].dimensions[0].label,
  "Verified column width"
);

const withoutStructure = applyFloorPlanTopologyMutationV2(
  relabelledDimension.document,
  { kind: "remove_structure", floorId: "floor-1", structureId: "column-1" },
  context("remove-structure")
);
assert.equal(withoutStructure.document.floors[0].structures.length, 0);
assert.ok(
  withoutStructure.document.floors[0].vertices.some(
    ({ id }) => id === "column-next-v1"
  ),
  "A dimension reference must keep a removed structure's shared vertex alive."
);
assert.equal(
  withoutStructure.document.floors[0].vertices.some(
    ({ id }) => id === "column-next-v3"
  ),
  false,
  "Unreferenced structure-only vertices must be pruned."
);

const withoutDimension = applyFloorPlanTopologyMutationV2(
  withoutStructure.document,
  { kind: "remove_dimension", floorId: "floor-1", dimensionId: "column-width" },
  context("remove-dimension")
);
assert.equal(withoutDimension.document.floors[0].dimensions.length, 0);
assert.equal(
  withoutDimension.document.floors[0].vertices.some(
    ({ id }) => id === "column-next-v1"
  ),
  false,
  "Removing the last reference must not leave structure-created orphan vertices."
);

expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      original,
      {
        kind: "add_structure",
        floorId: "floor-1",
        structure: {
          id: "v0",
          name: "ID collision",
          kind: "column",
          vertexIds: ["v0", "v1", "v2"],
          baseOffsetMm: 0,
          heightMm: 2600,
          locked: true,
        },
      },
      context("global-id-collision")
    ),
  "DUPLICATE_ENTITY_ID"
);

expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      withDimension.document,
      {
        kind: "update_dimension",
        floorId: "floor-1",
        dimensionId: "column-width",
        changes: { measuredMm: 601 },
      },
      context("contradictory-dimension")
    ),
  "MUTATION_VALIDATION_FAILED",
  "DIMENSION_MISMATCH"
);

const crossingMoveSource = document();
const crossingError = expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      crossingMoveSource,
      { kind: "move_vertex", floorId: "floor-1", vertexId: "v2", to: { xMm: 3000, zMm: 2000 } },
      context("invalid-crossing")
    ),
  "MUTATION_VALIDATION_FAILED",
  "CROSSING_WALL_PATHS"
);
assert.ok(
  crossingError.validationIssues.some((issue) => issue.code === "SELF_INTERSECTING_ROOM_LOOP"),
  "A crossing edit must also fail the room-loop topology gate."
);
assert.deepEqual(crossingMoveSource, document(), "Rejected geometry must leave its source untouched.");

expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      original,
      {
        kind: "move_wall",
        floorId: "floor-1",
        wallId: "bedroom-east",
        deltaXMm: -3000,
        deltaZMm: 0,
      },
      context("overlapping-wall")
    ),
  "MUTATION_VALIDATION_FAILED",
  "OVERLAPPING_WALL_PATHS"
);

expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      original,
      { kind: "move_vertex", floorId: "floor-1", vertexId: "v2", to: { xMm: 7000.5, zMm: 0 } },
      context("fractional")
    ),
  "NON_INTEGER_MILLIMETRES"
);

expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      original,
      {
        kind: "update_opening",
        floorId: "floor-1",
        openingId: "living-window",
        changes: { offsetMm: 1000 },
      },
      context("no-op-opening")
    ),
  "NO_OP_MUTATION"
);

expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      original,
      { kind: "remove_opening", floorId: "floor-1", openingId: "living-window" },
      { ...context("same-revision"), nextRevisionId: original.revisionId }
    ),
  "INVALID_CONTEXT"
);

const curved = document();
curved.floors[0].vertices.push(vertex("arc-center", 7000, 1500));
curved.floors[0].walls.find(({ id }) => id === "bedroom-east")!.path = {
  kind: "arc",
  startVertexId: "v2",
  endVertexId: "v3",
  centerVertexId: "arc-center",
  clockwise: false,
};
compileFloorPlanDocumentV2(curved);
expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      curved,
      { kind: "move_vertex", floorId: "floor-1", vertexId: "v2", to: { xMm: 7200, zMm: 0 } },
      context("arc-vertex")
    ),
  "ARC_MUTATION_UNSUPPORTED"
);
expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      curved,
      {
        kind: "split_wall",
        floorId: "floor-1",
        wallId: "bedroom-east",
        offsetMm: 1000,
        newVertexId: "arc-split",
        newWallId: "arc-wall-2",
      },
      context("arc-split")
    ),
  "ARC_MUTATION_UNSUPPORTED"
);

const spanning = document();
spanning.floors[0].openings.find(({ id }) => id === "shared-door")!.offsetMm = 1200;
spanning.floors[0].openings.find(({ id }) => id === "shared-door")!.widthMm = 600;
compileFloorPlanDocumentV2(spanning);
expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      spanning,
      {
        kind: "split_wall",
        floorId: "floor-1",
        wallId: "shared",
        offsetMm: 1500,
        newVertexId: "split-crossing",
        newWallId: "shared-crossing",
      },
      context("span-crossing")
    ),
  "SPAN_CROSSES_SPLIT"
);

expectError(
  () =>
    applyFloorPlanTopologyMutationV2(
      original,
      {
        kind: "add_opening",
        floorId: "floor-1",
        opening: {
          id: "overlapping-window",
          wallId: "living-north",
          kind: "window",
          operation: "fixed",
          offsetMm: 1500,
          widthMm: 1000,
          hinge: "none",
          handing: "none",
        },
      },
      context("overlap-opening")
    ),
  "MUTATION_VALIDATION_FAILED",
  "OVERLAPPING_OPENINGS"
);

expectError(
  () =>
    applyFloorPlanTopologyMutationsV2(
      original,
      [
        {
          kind: "add_opening",
          floorId: "floor-1",
          opening: {
            id: "batch-window",
            wallId: "bedroom-north",
            kind: "window",
            operation: "fixed",
            offsetMm: 100,
            widthMm: 500,
            hinge: "none",
            handing: "none",
          },
        },
        {
          kind: "update_opening",
          floorId: "floor-1",
          openingId: "batch-window",
          changes: { offsetMm: 2800, widthMm: 500 },
        },
      ],
      context("failed-batch")
    ),
  "MUTATION_VALIDATION_FAILED",
  "OPENING_OUT_OF_BOUNDS"
);
assert.equal(original.floors[0].openings.some(({ id }) => id === "batch-window"), false);

console.log("FloorPlanDocumentV2 topology mutation tests passed.");
