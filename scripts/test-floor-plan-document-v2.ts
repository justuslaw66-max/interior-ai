import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  canonicalizeFloorPlanGeometryV2,
  compileFloorPlanDocumentV2,
  FloorPlanDocumentValidationErrorV2,
  hashFloorPlanGeometryV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
  FloorPlanVertexV2,
} from "@/lib/floor-plan-document-v2";

const sourceId = "source-pdf";

function provenance(
  basis: FloorPlanEntityProvenanceV2["evidence"][number]["basis"] = "vector_traced"
): FloorPlanEntityProvenanceV2 {
  return {
    confidence: basis === "inferred" ? 0.5 : 0.99,
    extractionVersion: "test-extractor-1",
    evidence: [
      {
        sourceId,
        basis,
        confidence: basis === "inferred" ? 0.5 : 0.99,
        extractorVersion: "test-extractor-1",
        pageNumber: 1,
        cropPx: { xPx: 10, yPx: 10, widthPx: 20, heightPx: 20 },
      },
    ],
    reviewHistory: [],
  };
}

function vertex(id: string, xMm: number, zMm: number): FloorPlanVertexV2 {
  return { id, xMm, zMm, provenance: provenance() };
}

function makeFloor(): FloorPlanFloorV2 {
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
          { sourcePx: { x: 400, y: 0 }, planMm: { xMm: 4000, zMm: 0 } },
        ],
        rmsErrorPx: 0.25,
      },
    ],
    vertices: [
      vertex("v0", 0, 0),
      vertex("v1", 4000, 0),
      vertex("v2", 7000, 0),
      vertex("v3", 7000, 3000),
      vertex("v4", 4000, 3000),
      vertex("v5", 0, 3000),
      vertex("s0", 6000, 1800),
      vertex("s1", 6500, 1800),
      vertex("s2", 6500, 2400),
      vertex("s3", 6000, 2400),
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
        id: "bedroom-door",
        wallId: "shared",
        kind: "door",
        operation: "swing",
        offsetMm: 1000,
        widthMm: 900,
        hinge: "start",
        handing: "left",
        provenance: provenance(),
      },
      {
        id: "living-window",
        wallId: "living-north",
        kind: "window",
        operation: "fixed",
        offsetMm: 1200,
        widthMm: 1600,
        hinge: "none",
        handing: "none",
        provenance: provenance(),
      },
    ],
    structures: [
      {
        id: "service-strip",
        name: "Service strip",
        kind: "service_strip",
        vertexIds: ["s0", "s1", "s2", "s3"],
        baseOffsetMm: 0,
        heightMm: 2800,
        locked: true,
        provenance: provenance(),
      },
    ],
    annotations: [
      {
        id: "suggested-study",
        kind: "suggested_room",
        text: "Suggested Study",
        geometry: { kind: "polygon", vertexIds: ["s0", "s1", "s2", "s3"] },
        configurationId: "with-study",
        provenance: provenance(),
      },
    ],
    dimensions: [
      {
        id: "living-width",
        label: "4000",
        fromVertexId: "v0",
        toVertexId: "v1",
        axis: "horizontal",
        measuredMm: 4000,
        provenance: provenance("explicit_dimension"),
      },
    ],
  };
}

function makeDocument(): FloorPlanDocumentV2 {
  return {
    schemaVersion: 2,
    units: "mm",
    id: "test-home",
    revisionId: "revision-1",
    createdAt: "2026-07-16T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: ["orientation"] },
    sources: [
      {
        id: sourceId,
        kind: "pdf",
        name: "Test source plan",
        mimeType: "application/pdf",
        uri: "https://example.test/plan.pdf",
        sha256: "a".repeat(64),
        pageCount: 1,
      },
    ],
    floors: [makeFloor()],
  };
}

const document = makeDocument();
const beforeCompile = JSON.stringify(document);
const issues = validateFloorPlanDocumentV2(document);
assert.equal(issues.filter((issue) => issue.severity === "error").length, 0);
assert.equal(
  issues.filter((issue) => issue.code === "ASSUMED_3D_PROPERTY").length,
  7,
  "Legacy documents must expose assumed elevation/storey/slab evidence as well as four height defaults."
);

const scene = compileFloorPlanDocumentV2(document);
assert.equal(JSON.stringify(document), beforeCompile, "Compiler must not mutate authored documents.");
assert.match(scene.geometryHash, /^[a-f0-9]{64}$/);
assert.equal(scene.floors[0].elevationEvidence, "assumed");
assert.equal(scene.floors[0].storeyHeightEvidence, "assumed");
assert.equal(scene.floors[0].slabThicknessEvidence, "assumed");
assert.equal(
  scene.geometryHash,
  createHash("sha256").update(canonicalizeFloorPlanGeometryV2(document)).digest("hex"),
  "Browser-safe geometry hashing must match standard SHA-256."
);
assert.equal(scene.floors[0].rooms.find((room) => room.id === "living")?.areaSquareMm, 12_000_000);
assert.equal(scene.floors[0].rooms.find((room) => room.id === "bedroom")?.areaSquareMm, 9_000_000);
assert.deepEqual(scene.floors[0].openings.find((opening) => opening.id === "bedroom-door"), {
  id: "bedroom-door",
  wallId: "shared",
  kind: "door",
  operation: "swing",
  offsetMm: 1000,
  widthMm: 900,
  heightMm: 2100,
  heightEvidence: "assumed",
  sillHeightMm: 0,
  sillHeightEvidence: "assumed",
  bottomMm: 0,
  topMm: 2100,
  start: { xMm: 4000, zMm: 1000 },
  end: { xMm: 4000, zMm: 1900 },
  hinge: "start",
  handing: "left",
});
assert.equal(scene.floors[0].openings.find((opening) => opening.id === "living-window")?.sillHeightMm, 900);
assert.equal(scene.floors[0].openings.find((opening) => opening.id === "living-window")?.sillHeightEvidence, "assumed");
assert.equal(scene.floors[0].walls.find((wall) => wall.id === "shared")?.heightEvidence, "assumed");
assert.equal(scene.floors[0].walls.filter((wall) => wall.id === "shared").length, 1);
assert.deepEqual(scene.floors[0].walls.find((wall) => wall.id === "shared")?.adjacentRoomIds, ["bedroom", "living"]);

const reordered = structuredClone(document);
reordered.floors[0].vertices.reverse();
reordered.floors[0].walls.reverse();
reordered.floors[0].rooms.reverse();
reordered.floors[0].openings.reverse();
assert.equal(
  hashFloorPlanGeometryV2(reordered),
  scene.geometryHash,
  "Entity storage order must not change the canonical geometry hash."
);

const moved = structuredClone(document);
moved.floors[0].vertices.find((candidate) => candidate.id === "v2")!.xMm += 1;
assert.notEqual(hashFloorPlanGeometryV2(moved), scene.geometryHash);

const curved = structuredClone(document);
curved.floors[0].vertices.push(vertex("bedroom-arc-center", 7000, 1500));
curved.floors[0].walls.find((wall) => wall.id === "bedroom-east")!.path = {
  kind: "arc",
  startVertexId: "v2",
  endVertexId: "v3",
  centerVertexId: "bedroom-arc-center",
  clockwise: false,
};
const curvedScene = compileFloorPlanDocumentV2(curved);
assert.equal(curvedScene.floors[0].walls.find((wall) => wall.id === "bedroom-east")?.lengthMm, 4712.38898);
assert.deepEqual(curvedScene.floors[0].walls.find((wall) => wall.id === "bedroom-east")?.center, {
  xMm: 7000,
  zMm: 1500,
});

const fractional = structuredClone(document);
fractional.floors[0].vertices[0].xMm = 0.5;
assert.ok(validateFloorPlanDocumentV2(fractional).some((issue) => issue.code === "NON_INTEGER_MILLIMETRES"));
assert.throws(() => compileFloorPlanDocumentV2(fractional), FloorPlanDocumentValidationErrorV2);

const detachedOpening = structuredClone(document);
detachedOpening.floors[0].openings[0].offsetMm = 2500;
assert.ok(validateFloorPlanDocumentV2(detachedOpening).some((issue) => issue.code === "OPENING_OUT_OF_BOUNDS"));

const duplicateWall = structuredClone(document);
duplicateWall.floors[0].walls.push({
  ...structuredClone(duplicateWall.floors[0].walls[0]),
  id: "duplicate-north-wall",
  adjacentRoomIds: [],
});
assert.ok(validateFloorPlanDocumentV2(duplicateWall).some((issue) => issue.code === "DUPLICATE_WALL_GEOMETRY"));

const wrongDimension = structuredClone(document);
wrongDimension.floors[0].dimensions[0].measuredMm = 3999;
assert.ok(validateFloorPlanDocumentV2(wrongDimension).some((issue) => issue.code === "DIMENSION_MISMATCH"));

const sourceVerified = structuredClone(document);
sourceVerified.verification = {
  tier: "source_verified",
  criticalIssueIds: [],
  approvedBy: "reviewer-1",
  approvedAt: "2026-07-16T01:00:00.000Z",
};
assert.equal(
  validateFloorPlanDocumentV2(sourceVerified).filter((issue) => issue.severity === "error").length,
  0,
  "Observed, human-approved source geometry should be eligible for source verification."
);

const emptyVerified = structuredClone(sourceVerified);
emptyVerified.floors[0].vertices = [];
emptyVerified.floors[0].walls = [];
emptyVerified.floors[0].rooms = [];
emptyVerified.floors[0].openings = [];
emptyVerified.floors[0].structures = [];
emptyVerified.floors[0].annotations = [];
emptyVerified.floors[0].dimensions = [];
assert.ok(
  validateFloorPlanDocumentV2(emptyVerified).some(
    (issue) => issue.code === "EMPTY_VERIFIED_GEOMETRY"
  ),
  "Empty documents can never be source verified."
);

const constructionVerified = structuredClone(sourceVerified);
constructionVerified.verification.tier = "construction_verified";
const constructionIssues = validateFloorPlanDocumentV2(constructionVerified);
assert.ok(constructionIssues.some((issue) => issue.code === "MISSING_CONSTRUCTION_SOURCE"));
assert.ok(constructionIssues.some((issue) => issue.code === "MISSING_CONSTRUCTION_EVIDENCE"));
assert.ok(constructionIssues.some((issue) => issue.code === "ASSUMED_3D_PROPERTY" && issue.severity === "error"));

console.log("FloorPlanDocumentV2 compiler tests passed.");
