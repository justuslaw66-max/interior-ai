import assert from "node:assert/strict";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import {
  buildCanonicalFloorPlanTemplate,
  buildCanonicalFloorPlanTemplateForAuthoredVariant,
  isCanonicalFloorPlanCatalogResult,
} from "../lib/floor-plan-catalog-client";
import type { FloorPlanPublishedRevisionSearchResult } from "../lib/floor-plan-catalog-repository";

const provenance: FloorPlanEntityProvenanceV2 = {
  confidence: 1,
  extractionVersion: "catalog-client-test",
  evidence: [
    {
      sourceId: "source-1",
      basis: "vector_traced",
      confidence: 1,
      extractorVersion: "catalog-client-test",
      pageNumber: 1,
      cropPx: { xPx: 10, yPx: 10, widthPx: 20, heightPx: 20 },
    },
  ],
  reviewHistory: [
    {
      id: "approval-1",
      action: "approved",
      reviewerId: "reviewer@example.com",
      reviewedAt: "2026-07-16T00:00:00.000Z",
    },
  ],
};

const property = (valueMm: number) => ({
  valueMm,
  evidence: "source_documented" as const,
  provenance,
});

const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "home-1",
  revisionId: "revision-1",
  createdAt: "2026-07-16T00:00:00.000Z",
  verification: {
    tier: "source_verified",
    criticalIssueIds: [],
    approvedBy: "reviewer@example.com",
    approvedAt: "2026-07-16T00:00:00.000Z",
  },
  sources: [
    {
      id: "source-1",
      kind: "pdf",
      name: "Source plan",
      mimeType: "application/pdf",
      sha256: "b".repeat(64),
    },
  ],
  floors: [
    {
      id: "floor-1",
      name: "Level 1",
      levelIndex: 0,
      elevationMm: 0,
      storeyHeightMm: 2800,
      slabThicknessMm: 150,
      defaults: {
        wallHeight: property(2600),
        doorHeight: property(2100),
        windowHeight: property(1200),
        windowSillHeight: property(900),
      },
      calibrations: [
        {
          id: "calibration-1",
          sourceId: "source-1",
          pageNumber: 1,
          imageWidthPx: 400,
          imageHeightPx: 300,
          controlPoints: [
            { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } },
            { sourcePx: { x: 400, y: 0 }, planMm: { xMm: 4000, zMm: 0 } },
          ],
          rmsErrorPx: 0,
        },
      ],
      vertices: [
        { id: "v0", xMm: 0, zMm: 0, provenance },
        { id: "v1", xMm: 4000, zMm: 0, provenance },
        { id: "v2", xMm: 4000, zMm: 3000, provenance },
        { id: "v3", xMm: 0, zMm: 3000, provenance },
      ],
      walls: [
        {
          id: "w0",
          path: { kind: "line", startVertexId: "v0", endVertexId: "v1" },
          thicknessMm: 200,
          classification: "exterior",
          adjacentRoomIds: ["living"],
          provenance,
        },
        {
          id: "w1",
          path: { kind: "line", startVertexId: "v1", endVertexId: "v2" },
          thicknessMm: 200,
          classification: "exterior",
          adjacentRoomIds: ["living"],
          provenance,
        },
        {
          id: "w2",
          path: { kind: "line", startVertexId: "v2", endVertexId: "v3" },
          thicknessMm: 200,
          classification: "exterior",
          adjacentRoomIds: ["living"],
          provenance,
        },
        {
          id: "w3",
          path: { kind: "line", startVertexId: "v3", endVertexId: "v0" },
          thicknessMm: 200,
          classification: "exterior",
          adjacentRoomIds: ["living"],
          provenance,
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
                { wallId: "w0", direction: "forward" },
                { wallId: "w1", direction: "forward" },
                { wallId: "w2", direction: "forward" },
                { wallId: "w3", direction: "forward" },
              ],
            },
          ],
          provenance,
        },
      ],
      openings: [
        {
          id: "entry-door",
          wallId: "w0",
          kind: "door",
          operation: "swing",
          offsetMm: 100,
          widthMm: 900,
          heightMm: 2100,
          sillHeightMm: 0,
          hinge: "start",
          handing: "left",
          provenance,
        },
      ],
      structures: [],
      annotations: [],
      dimensions: [],
    },
  ],
};

const geometryHash = compileFloorPlanDocumentV2(document).geometryHash;
const result: FloorPlanPublishedRevisionSearchResult = {
  resultKind: "canonical_revision",
  id: "revision:revision-1:binding-1",
  planId: "revision-1",
  layoutId: "revision-1",
  revisionId: "revision-1",
  revisionUrl: "/api/floor-plans/revisions/revision-1",
  geometryHash,
  verificationTier: "source_verified",
  addressTransform: "mirror_x",
  addressBinding: {
    id: "binding-1",
    countryCode: "SG",
    addressNormalized: "810a chai chee street",
    block: "810A",
    street: "Chai Chee Street",
    postalCode: null,
    stack: "509",
    floorMin: 2,
    floorMax: 15,
    transform: "mirror_x",
  },
  projectName: "Ping Yi Court",
  addressLabel: "Block 810A, Chai Chee Street",
  matchedBlocks: ["810A"],
  label: "4-room",
  flatType: "4-room",
  bedroomCount: 3,
  floorAreaSqm: 93,
  roomLabels: [{ id: "living", name: "Living / Dining", roomType: "living" }],
  previewUrl: null,
  sourceUrl: null,
  sourceTitle: null,
  sourcePage: null,
  publisher: null,
  fidelity: "canonical_v2",
  verificationNote: "Reviewed against source.",
  accuracyNotice: "Confirm orientation.",
  matchLevel: "unit",
  unitMatches: [],
};

assert.equal(isCanonicalFloorPlanCatalogResult(result), true);

const payload = {
  revision: {
    id: "revision-1",
    geometryHash,
    verificationTier: "source_verified",
    publicationStatus: "published",
    documentJson: document,
  },
};
const template = buildCanonicalFloorPlanTemplate(result, payload);
assert.equal(template.canonical?.revisionId, "revision-1");
assert.equal(template.canonical?.geometryHash, geometryHash);
assert.equal(template.canonical?.addressTransform, "mirror_x");
assert.equal(template.rooms.length, 0, "canonical documents must not be duplicated into v1 rooms");

const alternateDocument = { ...document, revisionId: "revision-2" };
const authoredGroup = {
  groupId: "living-partition",
  label: "Living room configuration",
  defaultOptionId: "open",
  options: [
    {
      optionId: "open",
      label: "Open",
      revisionId: "revision-1",
      revisionUrl: "/api/floor-plans/revisions/revision-1",
      geometryHash,
      verificationTier: "source_verified" as const,
      defaultSelected: true,
      sourcePage: 1,
      addressBinding: { id: "binding-1", transform: "mirror_x" as const },
    },
    {
      optionId: "partitioned",
      label: "Partitioned",
      revisionId: "revision-2",
      revisionUrl: "/api/floor-plans/revisions/revision-2",
      geometryHash,
      verificationTier: "source_verified" as const,
      defaultSelected: false,
      sourcePage: 2,
      addressBinding: { id: "binding-2", transform: "normal" as const },
    },
  ],
};
const alternate = buildCanonicalFloorPlanTemplateForAuthoredVariant({
  baseResult: { ...result, authoredConfigurationGroups: [authoredGroup] },
  groupId: authoredGroup.groupId,
  option: authoredGroup.options[1],
  responseValue: {
    revision: {
      ...payload.revision,
      id: "revision-2",
      documentJson: alternateDocument,
      authoredConfigurationGroups: [authoredGroup],
    },
  },
});
assert.equal(alternate.canonical?.revisionId, "revision-2");
assert.equal(alternate.canonical?.addressBinding?.bindingId, "binding-2");
assert.equal(alternate.canonical?.addressTransform, "normal");
assert.throws(
  () => buildCanonicalFloorPlanTemplateForAuthoredVariant({
    baseResult: result,
    groupId: authoredGroup.groupId,
    option: { ...authoredGroup.options[1], geometryHash: "f".repeat(64) },
    responseValue: {
      revision: {
        ...payload.revision,
        id: "revision-2",
        documentJson: alternateDocument,
        authoredConfigurationGroups: [authoredGroup],
      },
    },
  }),
  /no longer linked/i
);

assert.throws(
  () =>
    buildCanonicalFloorPlanTemplate(
      { ...result, geometryHash: "f".repeat(64) },
      payload
    ),
  /geometry changed/i
);
assert.throws(
  () =>
    buildCanonicalFloorPlanTemplate(result, {
      revision: { ...payload.revision, id: "revision-2" },
    }),
  /does not match/i
);
assert.throws(
  () =>
    buildCanonicalFloorPlanTemplate(result, {
      revision: { ...payload.revision, documentJson: { ...document, revisionId: "revision-2" } },
    }),
  /identifier is inconsistent/i
);

console.log("Floor-plan catalog client checks passed.");
