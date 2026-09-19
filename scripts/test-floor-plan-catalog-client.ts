import assert from "node:assert/strict";
import { readFloorPlanDirectoryResponse, fetchPublicFloorPlanRevision } from "../lib/floor-plan-directory-client";
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
  id: "revision:revision-1",
  planId: "revision-1",
  layoutId: "revision-1",
  revisionId: "revision-1",
  revisionUrl: "/api/floor-plans/revisions/revision-1",
  geometryHash,
  verificationTier: "source_verified",
  addressTransform: "mirror_x",
  selectedBindingId: "binding-1",
  projectName: "Ping Yi Court",
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
const privateSelection = {
  address: "810a chai chee street",
  floor: 12,
  stack: "509",
};
const template = buildCanonicalFloorPlanTemplate(result, payload, privateSelection);
assert.equal(template.canonical?.revisionId, "revision-1");
assert.equal(template.canonical?.geometryHash, geometryHash);
assert.equal(template.canonical?.addressTransform, "mirror_x");
assert.equal(template.canonical?.addressBinding?.bindingId, "binding-1");
assert.equal(template.canonical?.addressBinding?.unitFloor, 12);
assert.equal(template.canonical?.addressBinding?.unitStack, "509");
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
    },
  ],
};
const alternate = buildCanonicalFloorPlanTemplateForAuthoredVariant({
  baseResult: { ...result, authoredConfigurationGroups: [authoredGroup] },
  matchedResult: {
    ...result,
    id: "revision:revision-2",
    planId: "revision-2",
    layoutId: "revision-2",
    revisionId: "revision-2",
    revisionUrl: "/api/floor-plans/revisions/revision-2",
    selectedBindingId: "binding-2",
    addressTransform: "normal",
    authoredConfigurationGroups: [authoredGroup],
  },
  groupId: authoredGroup.groupId,
  option: authoredGroup.options[1],
  privateSelection,
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
    matchedResult: {
      ...result,
      revisionId: "revision-2",
      geometryHash,
    },
    groupId: authoredGroup.groupId,
    option: { ...authoredGroup.options[1], geometryHash: "f".repeat(64) },
    privateSelection,
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
      payload,
      privateSelection
    ),
  /geometry changed/i
);
assert.throws(
  () =>
    buildCanonicalFloorPlanTemplate(result, {
      revision: { ...payload.revision, id: "revision-2" },
    }, privateSelection),
  /does not match/i
);
assert.throws(
  () =>
    buildCanonicalFloorPlanTemplate(result, {
      revision: { ...payload.revision, documentJson: { ...document, revisionId: "revision-2" } },
    }, privateSelection),
  /evidence is inconsistent/i
);

async function checkDirectoryBoundary() {
  const valid = { mode: "search", count: 1, results: [result], nextCursor: null };
  assert.equal((await readFloorPlanDirectoryResponse(Response.json(valid), "search")).results[0].revisionId, result.revisionId);
  for (const invalid of [
    {}, { ...valid, count: 2 }, { ...valid, mode: "browse" },
    { ...valid, privateAddress: privateSelection.address },
    ...[
      { verificationTier: "needs_review" }, { revisionUrl: "https://example.com/private" },
      { selectedBindingId: undefined }, { sourceUrl: "http://127.0.0.1/private" },
      { address: privateSelection.address }, { addressTransform: "unknown" },
    ].map((patch) => ({ ...valid, results: [{ ...result, ...patch }] })),
  ]) {
    await assert.rejects(readFloorPlanDirectoryResponse(Response.json(invalid), "search"), /invalid data/);
  }
  await assert.rejects(readFloorPlanDirectoryResponse(new Response("bad json")), /invalid data/);
  await assert.rejects(readFloorPlanDirectoryResponse(Response.json(valid), "browse"), /invalid data/);
  await assert.rejects(readFloorPlanDirectoryResponse(Response.json({ error: "PRIVATE_SENTINEL" }, { status: 500 })),
    (error: Error) => /unavailable/.test(error.message) && !error.message.includes("PRIVATE_SENTINEL"));
  await assert.rejects(fetchPublicFloorPlanRevision({ ...result, revisionUrl: "https://example.com/private" }), /revision is invalid/);
  console.log("Floor-plan catalog client and public HTTP boundary checks passed.");
}
void checkDirectoryBoundary().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
