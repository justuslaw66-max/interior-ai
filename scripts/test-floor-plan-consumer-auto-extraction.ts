import assert from "node:assert/strict";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import {
  solveScaleFromRegisteredEvidence,
  type RegisteredPageEvidence,
} from "@/lib/floor-plan-imports/deterministic-evidence";
import { ENHANCED_FLOOR_PLAN_EVIDENCE_KIND } from "@/lib/floor-plan-imports/page-selection";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import { floorPlanMvpBlockingIssueIds } from "@/lib/floor-plan-imports/types";

const page: RegisteredPageEvidence = {
  pageNumber: 1,
  widthPx: 1328,
  heightPx: 988,
  vectorPaths: [],
  vectorSegments: [
    {
      id: "width-left",
      pageNumber: 1,
      start: { x: 284, y: 97.5 },
      end: { x: 747.5, y: 97.5 },
      strokeWidthPx: 1,
      confidence: 0.98,
      evidenceKind: "raster_linework",
    },
    {
      id: "width-right",
      pageNumber: 1,
      start: { x: 804, y: 97.5 },
      end: { x: 1268, y: 97.5 },
      strokeWidthPx: 1,
      confidence: 0.98,
      evidenceKind: "raster_linework",
    },
    {
      id: "height-top",
      pageNumber: 1,
      start: { x: 216.5, y: 166 },
      end: { x: 216.5, y: 504.5 },
      strokeWidthPx: 1,
      confidence: 0.98,
      evidenceKind: "raster_linework",
    },
    {
      id: "height-bottom",
      pageNumber: 1,
      start: { x: 216.5, y: 561.5 },
      end: { x: 216.5, y: 901 },
      strokeWidthPx: 1,
      confidence: 0.98,
      evidenceKind: "raster_linework",
    },
    ...[
      [300, 200, 1050, 200],
      [1050, 200, 1050, 760],
      [1050, 760, 300, 760],
      [300, 760, 300, 200],
    ].map(([x1, y1, x2, y2], index) => ({
      id: `architectural-wall-${index + 1}`,
      pageNumber: 1,
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      strokeWidthPx: 12,
      confidence: 0.98,
      evidenceKind: "raster_linework" as const,
    })),
  ],
  text: [],
  semantics: {
    planRegion: {
      bbox: {
        leftRatio: 0.2,
        topRatio: 0.16,
        rightRatio: 0.82,
        bottomRatio: 0.8,
      },
      rotationDegrees: 0,
      confidence: 0.55,
      evidenceKind: "vision",
    },
    roomLabels: [
      {
        label: "Family Room",
        roomType: "living",
        centerXRatio: 0.36,
        centerYRatio: 0.5,
        confidence: 0.55,
        evidenceKind: "vision",
      },
      {
        label: "Dining Area",
        roomType: "dining",
        centerXRatio: 0.52,
        centerYRatio: 0.5,
        confidence: 0.55,
        evidenceKind: "vision",
      },
      {
        label: "Kitchen",
        roomType: "kitchen",
        centerXRatio: 0.68,
        centerYRatio: 0.5,
        confidence: 0.55,
        evidenceKind: "vision",
      },
      {
        label: "Closet",
        roomType: "other",
        centerXRatio: 0.92,
        centerYRatio: 0.86,
        confidence: 0.55,
        evidenceKind: "vision",
      },
    ],
    roomBoundaries: [
      {
        label: "Open Plan",
        roomType: "living",
        points: [
          { xRatio: 0.222, yRatio: 0.197 },
          { xRatio: 0.798, yRatio: 0.197 },
          { xRatio: 0.798, yRatio: 0.773 },
          { xRatio: 0.222, yRatio: 0.773 },
        ],
        confidence: 0.55,
        evidenceKind: "vision",
      },
    ],
    dimensionLabels: [
      {
        valueMm: 12_192,
        rawText: "40′",
        centerXRatio: 776 / 1328,
        centerYRatio: 58 / 988,
        orientation: "horizontal",
        extensionStart: { xRatio: 284 / 1328, yRatio: 97.5 / 988 },
        extensionEnd: { xRatio: 1268 / 1328, yRatio: 97.5 / 988 },
        confidence: 0.9,
        evidenceKind: "vision",
      },
      {
        valueMm: 9_144,
        rawText: "30′",
        centerXRatio: 210 / 1328,
        centerYRatio: 533 / 988,
        orientation: "vertical",
        extensionStart: { xRatio: 216.5 / 1328, yRatio: 166 / 988 },
        extensionEnd: { xRatio: 216.5 / 1328, yRatio: 901 / 988 },
        confidence: 0.9,
        evidenceKind: "vision",
      },
    ],
    openingSymbols: [],
    entrance: null,
    notes: [],
  },
};

async function main() {
  const solved = solveScaleFromRegisteredEvidence(page);
  assert.ok(solved, "The split 40′ and 30′ source dimensions must solve scale.");

  const adapter = new PdfRasterFloorPlanSourceAdapter({
    localOcrProvider: null,
  });
  const sourceManifest = {
    pages: [
      {
        pageNumber: 1,
        selectedForGeometry: true,
        selectedForSemanticClassification: true,
        semanticRoomLabelCount: 4,
        semanticDimensionCount: 2,
      },
    ],
  };
  const result = await adapter.buildTopology(
    {
      candidate: {
        kind: ENHANCED_FLOOR_PLAN_EVIDENCE_KIND,
        source: {
          id: "private-regression-source",
          fileName: "sanitized-consumer-plan.png",
          mimeType: "image/png",
          sha256: "a".repeat(64),
        },
        pages: [page],
        pageCandidates: [],
        selectedPageNumber: 1,
        scale: { pageNumber: 1, ...solved },
        scales: [{ pageNumber: 1, ...solved }],
        catalogDraftMatch: null,
      },
      sourceManifest,
      reviewIssues: [],
    },
    {
      jobId: "consumer-auto-extraction",
      store: {
        async putSource() {
          throw new Error("not used");
        },
        async readSource() {
          return null;
        },
        async putDerivative() {
          throw new Error("not used");
        },
      },
      privacy: {
        trainingBenchmarkOptIn: false,
        trainingBenchmarkOptInAt: null,
        trainingBenchmarkConsentVersion: null,
        trainingBenchmarkRevokedAt: null,
        sourceRetentionExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
        sourceDeletionRequestedAt: null,
      },
    }
  );

  const document = result.candidate as unknown as FloorPlanDocumentV2;
  const floor = document.floors[0];
  assert.equal(floor.rooms.length, 1);
  assert.equal(floor.rooms[0].name, "Open Plan");
  assert.equal(floor.walls.length, 4);
  assert.deepEqual(
    floor.dimensions.map((dimension) => dimension.measuredMm).sort((a, b) => b - a),
    [12_192, 9_144]
  );
  assert.deepEqual(
    floor.annotations
      .filter((annotation) => annotation.kind === "label")
      .map((annotation) => annotation.text)
      .sort(),
    ["Closet", "Dining Area", "Family Room", "Kitchen"]
  );
  assert.equal(floor.openings.length, 0);
  assert.equal(
    validateFloorPlanDocumentV2(document).filter(
      (entry) => entry.severity === "error"
    ).length,
    0
  );
  assert.deepEqual(floorPlanMvpBlockingIssueIds(result.reviewIssues), []);

  const adjacentPage = structuredClone(page);
  const adjacentRooms = [
    {
      label: "Bedroom 1",
      roomType: "bedroom" as const,
      points: [
        { x: 300, y: 200 },
        { x: 600, y: 200 },
        { x: 600, y: 480 },
        { x: 300, y: 480 },
      ],
    },
    {
      label: "Bedroom 2",
      roomType: "bedroom" as const,
      points: [
        { x: 300, y: 480 },
        { x: 600, y: 480 },
        { x: 600, y: 760 },
        { x: 300, y: 760 },
      ],
    },
    {
      label: "Living Room",
      roomType: "living" as const,
      points: [
        { x: 600.25, y: 200 },
        { x: 1050, y: 200 },
        { x: 1050, y: 760 },
        { x: 600.25, y: 760 },
      ],
    },
  ];
  adjacentPage.vectorSegments = [
    ...adjacentPage.vectorSegments.slice(0, 4),
    ...adjacentRooms.flatMap((room, roomIndex) =>
      room.points.map((start, side) => ({
        id: `adjacent-${roomIndex + 1}-${side + 1}`,
        pageNumber: 1,
        start,
        end: room.points[(side + 1) % room.points.length],
        strokeWidthPx: 12,
        confidence: 0.98,
        evidenceKind: "raster_linework" as const,
      }))
    ),
  ];
  adjacentPage.semantics.roomLabels = adjacentRooms.map((room) => ({
    label: room.label,
    roomType: room.roomType,
    centerXRatio:
      room.points.reduce((sum, point) => sum + point.x, 0) /
      room.points.length /
      adjacentPage.widthPx,
    centerYRatio:
      room.points.reduce((sum, point) => sum + point.y, 0) /
      room.points.length /
      adjacentPage.heightPx,
    confidence: 0.55,
    evidenceKind: "vision" as const,
  }));
  adjacentPage.semantics.roomBoundaries = adjacentRooms.map((room) => ({
    label: room.label,
    roomType: room.roomType,
    points: room.points.map((point) => ({
      xRatio: point.x / adjacentPage.widthPx,
      yRatio: point.y / adjacentPage.heightPx,
    })),
    confidence: 0.55,
    evidenceKind: "vision" as const,
  }));
  const adjacentScale = solveScaleFromRegisteredEvidence(adjacentPage);
  assert.ok(adjacentScale);
  const adjacentResult = await adapter.buildTopology(
    {
      candidate: {
        kind: ENHANCED_FLOOR_PLAN_EVIDENCE_KIND,
        source: {
          id: "private-adjacent-source",
          fileName: "sanitized-adjacent-plan.png",
          mimeType: "image/png",
          sha256: "b".repeat(64),
        },
        pages: [adjacentPage],
        pageCandidates: [],
        selectedPageNumber: 1,
        scale: { pageNumber: 1, ...adjacentScale },
        scales: [{ pageNumber: 1, ...adjacentScale }],
        catalogDraftMatch: null,
      },
      sourceManifest: {
        pages: [
          {
            pageNumber: 1,
            selectedForGeometry: true,
            selectedForSemanticClassification: true,
            semanticRoomLabelCount: adjacentRooms.length,
            semanticDimensionCount: 2,
          },
        ],
      },
      reviewIssues: [],
    },
    {
      jobId: "consumer-adjacent-room-extraction",
      store: {
        async putSource() {
          throw new Error("not used");
        },
        async readSource() {
          return null;
        },
        async putDerivative() {
          throw new Error("not used");
        },
      },
      privacy: {
        trainingBenchmarkOptIn: false,
        trainingBenchmarkOptInAt: null,
        trainingBenchmarkConsentVersion: null,
        trainingBenchmarkRevokedAt: null,
        sourceRetentionExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
        sourceDeletionRequestedAt: null,
      },
    }
  );
  const adjacentDocument =
    adjacentResult.candidate as unknown as FloorPlanDocumentV2;
  assert.equal(adjacentDocument.floors[0].rooms.length, 3);
  assert.equal(
    validateFloorPlanDocumentV2(adjacentDocument).filter(
      (entry) => entry.severity === "error"
    ).length,
    0,
    "A T-junction must split the neighboring long wall into shared canonical endpoints."
  );
  assert.ok(
    adjacentDocument.floors[0].walls.filter(
      (wall) => wall.adjacentRoomIds.length === 2
    ).length >= 3,
    "Atomic shared-wall spans must be reused by both adjacent rooms."
  );

  console.log("Consumer floor-plan auto-extraction tests passed");
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
