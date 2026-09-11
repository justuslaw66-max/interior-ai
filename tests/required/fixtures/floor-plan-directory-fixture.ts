import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2, FloorPlanEntityProvenanceV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanPublishedRevisionSearchResult } from "@/lib/floor-plan-catalog-repository";

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

export const document: FloorPlanDocumentV2 = {
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
export const result: FloorPlanPublishedRevisionSearchResult = {
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



export const payload = {
  revision: {
    id: "revision-1",
    geometryHash,
    verificationTier: "source_verified",
    publicationStatus: "published",
    documentJson: document,
  },
};
