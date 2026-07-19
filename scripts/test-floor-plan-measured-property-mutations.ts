import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  compileFloorPlanDocumentV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import {
  applyFloorPlanMeasuredPropertyMutationV2,
  FloorPlanMeasuredPropertyMutationErrorV2,
} from "@/lib/floor-plan-measured-property-mutations";

const provenance = (): FloorPlanEntityProvenanceV2 => ({
  confidence: 0.8,
  extractionVersion: "measurement-test-v1",
  evidence: [{
    sourceId: "source-1",
    basis: "vector_traced",
    confidence: 0.8,
    extractorVersion: "measurement-test-v1",
  }],
  reviewHistory: [],
});
const measured = (valueMm: number) => ({
  valueMm,
  evidence: "assumed" as const,
  provenance: provenance(),
});

const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "measurement-home",
  revisionId: "revision-1",
  createdAt: "2026-07-17T00:00:00.000Z",
  verification: {
    tier: "needs_review",
    criticalIssueIds: [],
    approvedBy: "independent-reviewer",
    approvedAt: "2026-07-17T00:00:00.000Z",
  },
  sources: [{
    id: "source-1",
    kind: "pdf",
    name: "Test source",
    mimeType: "application/pdf",
  }],
  floors: [{
    id: "floor-1",
    name: "Level 1",
    levelIndex: 0,
    elevationMm: 0,
    storeyHeightMm: 2800,
    slabThicknessMm: 150,
    defaults: {
      wallHeight: measured(2600),
      doorHeight: measured(2100),
      windowHeight: measured(1200),
      windowSillHeight: measured(900),
    },
    calibrations: [],
    vertices: [
      { id: "v0", xMm: 0, zMm: 0, provenance: provenance() },
      { id: "v1", xMm: 4000, zMm: 0, provenance: provenance() },
      { id: "v2", xMm: 4000, zMm: 3000, provenance: provenance() },
      { id: "v3", xMm: 0, zMm: 3000, provenance: provenance() },
    ],
    walls: [
      { id: "north", path: { kind: "line", startVertexId: "v0", endVertexId: "v1" }, thicknessMm: 180, classification: "exterior", adjacentRoomIds: ["living"], provenance: provenance() },
      { id: "east", path: { kind: "line", startVertexId: "v1", endVertexId: "v2" }, thicknessMm: 180, classification: "exterior", adjacentRoomIds: ["living"], provenance: provenance() },
      { id: "south", path: { kind: "line", startVertexId: "v2", endVertexId: "v3" }, thicknessMm: 180, classification: "exterior", adjacentRoomIds: ["living"], provenance: provenance() },
      { id: "west", path: { kind: "line", startVertexId: "v3", endVertexId: "v0" }, thicknessMm: 180, classification: "exterior", adjacentRoomIds: ["living"], provenance: provenance() },
    ],
    rooms: [{
      id: "living",
      name: "Living Room",
      roomType: "living",
      wallLoops: [{ kind: "outer", walls: [
        { wallId: "north", direction: "forward" },
        { wallId: "east", direction: "forward" },
        { wallId: "south", direction: "forward" },
        { wallId: "west", direction: "forward" },
      ] }],
      provenance: provenance(),
    }],
    openings: [{
      id: "window-1",
      wallId: "east",
      kind: "window",
      operation: "fixed",
      offsetMm: 500,
      widthMm: 1200,
      hinge: "none",
      handing: "none",
      provenance: provenance(),
    }],
    structures: [],
    annotations: [],
    dimensions: [],
  }],
};

const context = (id: string, note?: string) => ({
  mutationId: `measurement:${id}`,
  nextRevisionId: `revision:${id}`,
  actorId: "consumer-1",
  mutatedAt: "2026-07-17T01:00:00.000Z",
  note,
});

const originalScene = compileFloorPlanDocumentV2(document);
const storeyConfirmation = applyFloorPlanMeasuredPropertyMutationV2(
  document,
  {
    target: { kind: "floor_storey_height", floorId: "floor-1" },
    valueMm: 2800,
    evidence: "user_confirmed",
  },
  context("confirm-storey")
);
assert.equal(storeyConfirmation.scene.geometryHash, originalScene.geometryHash);
assert.equal(
  storeyConfirmation.document.floors[0].verticalEvidence?.storeyHeight.evidence,
  "user_confirmed"
);
assert.equal(
  storeyConfirmation.document.floors[0].verticalEvidence?.slabThickness.evidence,
  "assumed",
  "Backfilling one legacy vertical property must not silently verify the other."
);

const resizedStorey = applyFloorPlanMeasuredPropertyMutationV2(
  document,
  {
    target: { kind: "floor_storey_height", floorId: "floor-1" },
    valueMm: 2850,
    evidence: "user_confirmed",
  },
  context("resize-storey")
);
assert.notEqual(resizedStorey.scene.geometryHash, originalScene.geometryHash);
assert.equal(resizedStorey.scene.floors[0].storeyHeightMm, 2850);

const measuredSlab = applyFloorPlanMeasuredPropertyMutationV2(
  document,
  {
    target: { kind: "floor_slab_thickness", floorId: "floor-1" },
    valueMm: 160,
    evidence: "site_measured",
  },
  context("measure-slab", "Laser measured at exposed slab edge")
);
assert.equal(measuredSlab.scene.floors[0].slabThicknessMm, 160);
assert.equal(measuredSlab.scene.floors[0].slabThicknessEvidence, "site_measured");

const confirmation = applyFloorPlanMeasuredPropertyMutationV2(
  document,
  {
    target: { kind: "floor_default", floorId: "floor-1", property: "wallHeight" },
    valueMm: 2600,
    evidence: "user_confirmed",
  },
  context("confirm-default")
);
assert.equal(confirmation.scene.geometryHash, originalScene.geometryHash);
assert.equal(confirmation.document.floors[0].defaults.wallHeight.evidence, "user_confirmed");
assert.equal(confirmation.document.verification.tier, "needs_review");
assert.equal(confirmation.document.verification.approvedBy, undefined);
assert.deepEqual(
  confirmation.document.floors[0].vertices.map(({ id }) => id),
  document.floors[0].vertices.map(({ id }) => id)
);

const resized = applyFloorPlanMeasuredPropertyMutationV2(
  document,
  {
    target: { kind: "floor_default", floorId: "floor-1", property: "wallHeight" },
    valueMm: 2700,
    evidence: "user_confirmed",
  },
  context("resize-default")
);
assert.notEqual(resized.scene.geometryHash, originalScene.geometryHash);
assert.equal(resized.scene.floors[0].walls[0].heightMm, 2700);

const openingHeight = applyFloorPlanMeasuredPropertyMutationV2(
  document,
  {
    target: { kind: "opening_height", floorId: "floor-1", openingId: "window-1" },
    valueMm: 1250,
    evidence: "user_confirmed",
  },
  context("opening-height")
);
const openingSill = applyFloorPlanMeasuredPropertyMutationV2(
  openingHeight.document,
  {
    target: { kind: "opening_sill_height", floorId: "floor-1", openingId: "window-1" },
    valueMm: 850,
    evidence: "site_measured",
  },
  context("opening-sill", "Laser measured from finished floor")
);
const compiledOpening = openingSill.scene.floors[0].openings[0];
assert.equal(compiledOpening.heightEvidence, "user_confirmed");
assert.equal(compiledOpening.sillHeightEvidence, "site_measured");
assert.ok(openingSill.document.sources.some((source) => source.kind === "site_measurement"));

const sourceDocumented = structuredClone(document);
sourceDocumented.floors[0].defaults.wallHeight.evidence = "source_documented";
assert.throws(
  () => applyFloorPlanMeasuredPropertyMutationV2(
    sourceDocumented,
    {
      target: { kind: "floor_default", floorId: "floor-1", property: "wallHeight" },
      valueMm: 2650,
      evidence: "user_confirmed",
    },
    context("locked")
  ),
  (cause) =>
    cause instanceof FloorPlanMeasuredPropertyMutationErrorV2 &&
    cause.code === "DOCUMENTED_VALUE_LOCKED"
);
const constructionCandidate = structuredClone(confirmation.document);
constructionCandidate.verification = {
  tier: "construction_verified",
  criticalIssueIds: [],
  approvedBy: "reviewer-2",
  approvedAt: "2026-07-17T02:00:00.000Z",
};
assert.ok(
  validateFloorPlanDocumentV2(constructionCandidate).some(
    (issue) => issue.code === "UNVERIFIED_CONSTRUCTION_PROPERTY"
  ),
  "User-confirmed vertical values must never unlock construction verification."
);
const undocumentedVerticalConstruction = structuredClone(document);
undocumentedVerticalConstruction.floors[0].verticalEvidence = {
  elevation: { evidence: "source_documented", provenance: provenance() },
  storeyHeight: { evidence: "source_documented", provenance: provenance() },
  slabThickness: { evidence: "source_documented", provenance: provenance() },
};
undocumentedVerticalConstruction.verification = {
  tier: "construction_verified",
  criticalIssueIds: [],
  approvedBy: "reviewer-2",
  approvedAt: "2026-07-17T02:00:00.000Z",
};
assert.ok(
  validateFloorPlanDocumentV2(undocumentedVerticalConstruction).some(
    (issue) =>
      issue.code === "MISSING_CONSTRUCTION_EVIDENCE" &&
      issue.path.includes("verticalEvidence.storeyHeight.provenance")
  ),
  "A source-documented label without construction provenance must fail the compiler gate."
);
assert.throws(
  () => applyFloorPlanMeasuredPropertyMutationV2(
    document,
    {
      target: { kind: "opening_sill_height", floorId: "floor-1", openingId: "window-1" },
      valueMm: 900,
      evidence: "site_measured",
    },
    context("missing-note")
  ),
  (cause) =>
    cause instanceof FloorPlanMeasuredPropertyMutationErrorV2 &&
    cause.code === "SITE_MEASUREMENT_NOTE_REQUIRED"
);
assert.throws(
  () => applyFloorPlanMeasuredPropertyMutationV2(
    document,
    {
      target: { kind: "floor_default", floorId: "floor-1", property: "wallHeight" },
      valueMm: 1500,
      evidence: "user_confirmed",
    },
    context("opening-above-wall")
  ),
  (cause) =>
    cause instanceof FloorPlanMeasuredPropertyMutationErrorV2 &&
    cause.code === "MUTATION_VALIDATION_FAILED"
);

const root = process.cwd();
const openingInspector = fs.readFileSync(
  path.join(root, "components/editor/PlanOpeningInspector.tsx"),
  "utf8"
);
const floorInspector = fs.readFileSync(
  path.join(root, "components/editor/FloorPropertiesPanel.tsx"),
  "utf8"
);
const importReview = fs.readFileSync(
  path.join(
    root,
    "components/editor/floor-plan-import-review/FloorPlanImportReviewPanel.tsx"
  ),
  "utf8"
);
const roomGeometryController = fs.readFileSync(
  path.join(root, "lib/useDesignPageRoomGeometry.ts"),
  "utf8"
);
assert.match(openingInspector, /plan-opening-height-evidence/);
assert.match(openingInspector, /plan-opening-sill-evidence/);
assert.match(openingInspector, /disabled=\{!heightEditable\}/);
assert.match(floorInspector, /floor-properties-wall-height-evidence/);
assert.match(floorInspector, /floor-properties-slab-thickness-evidence/);
assert.match(floorInspector, /canEditActiveRoomWallHeight/);
assert.match(floorInspector, /canEditActiveRoomSlabThickness/);
assert.match(importReview, /Confirm all displayed defaults/);
assert.match(roomGeometryController, /kind: "floor_slab_thickness"/);
assert.match(roomGeometryController, /commitCanonicalTopologyMutationToSnapshotV2/);

console.log("Floor-plan measured-property mutation tests passed.");
