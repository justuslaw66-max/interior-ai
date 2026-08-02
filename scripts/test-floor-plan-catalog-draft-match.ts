import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import {
  buildSourceBoundCatalogDraft,
  matchPrivateUploadToCatalogDraft,
} from "@/lib/floor-plan-imports/catalog-draft-match";
import { collectFloorPlanImportReadinessIssues } from "@/lib/floor-plan-imports/readiness";
import { isFloorPlanMvpBlockingIssue } from "@/lib/floor-plan-imports/types";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";
import type {
  FloorPlanAdapterContext,
  FloorPlanSourceStore,
  StoredFloorPlanSource,
} from "@/lib/floor-plan-imports/source-adapter";

const previewRoot = path.join(
  process.cwd(),
  "public/assets/floor-plans/sg/hdb/ping-yi-court/previews"
);

function sourceFor(fileName: string, id = "private-upload") {
  const bytes = new Uint8Array(fs.readFileSync(path.join(previewRoot, fileName)));
  const source: StoredFloorPlanSource = {
    id,
    fileName,
    mimeType: "image/webp",
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes,
  };
  return source;
}

function storeFor(source: StoredFloorPlanSource): FloorPlanSourceStore {
  return {
    async putSource() { return source; },
    async readSource() { return source; },
    async putDerivative() { return "rendered-page"; },
    async readDerivative() {
      return {
        id: "rendered-page",
        fileName: "page-1.webp",
        mimeType: "image/webp",
        byteLength: source.bytes.byteLength,
        sha256: source.sha256,
        bytes: source.bytes,
      };
    },
  };
}

function contextFor(store: FloorPlanSourceStore): FloorPlanAdapterContext {
  return {
    jobId: "catalog-draft-match-test",
    store,
    privacy: {
      trainingBenchmarkOptIn: false,
      trainingBenchmarkOptInAt: null,
      trainingBenchmarkConsentVersion: null,
      trainingBenchmarkRevokedAt: null,
      sourceRetentionExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
      sourceDeletionRequestedAt: null,
    },
  };
}

async function main() {
const typeOne = sourceFor("2-room-flexi-type-1.webp");
const typeOneStore = storeFor(typeOne);
const exactMatch = await matchPrivateUploadToCatalogDraft({
  source: typeOne,
  renderedPages: [{
    pageNumber: 1,
    widthPx: 1160,
    heightPx: 1290,
    assetKey: "rendered-page",
  }],
  context: contextFor(typeOneStore),
});
assert.equal(exactMatch?.layout.layout_id, "2-room-flexi-type-1");
assert.equal(exactMatch?.matchKind, "exact_preview_hash");

const ambiguousTypeTwo = sourceFor("2-room-flexi-type-2-open.webp", "reencoded-upload");
ambiguousTypeTwo.sha256 = "f".repeat(64);
assert.equal(
  await matchPrivateUploadToCatalogDraft({
    source: ambiguousTypeTwo,
    renderedPages: [{
      pageNumber: 1,
      widthPx: 1160,
      heightPx: 1290,
      assetKey: "rendered-page",
    }],
    context: contextFor(storeFor(ambiguousTypeTwo)),
  }),
  null,
  "Near-identical open and partitioned layouts must not be selected from visual similarity alone."
);

const page: RegisteredPageEvidence = {
  pageNumber: 1,
  widthPx: 1160,
  heightPx: 1290,
  vectorSegments: [],
  vectorPaths: [],
  text: [],
  semantics: {
    roomLabels: [
      ["BEDROOM", "bedroom", 435, 369],
      ["LIVING/DINING", "living", 819, 447],
      ["BATH/WC", "toilet", 543, 655],
      ["HOUSE HOLD SHELTER", "shelter", 878, 713],
      ["KITCHEN", "kitchen", 468, 941],
    ].map(([label, roomType, x, y]) => ({
      label: String(label),
      roomType: roomType as "bedroom" | "living" | "toilet" | "shelter" | "kitchen",
      centerXRatio: Number(x) / 1160,
      centerYRatio: Number(y) / 1290,
      confidence: 0.92,
      evidenceKind: "ocr" as const,
    })),
    dimensionLabels: [
      { valueMm: 2890, orientation: "horizontal" as const, centerXRatio: 0.39, centerYRatio: 0.09, confidence: 0.9, evidenceKind: "ocr" as const },
      { valueMm: 3110, orientation: "vertical" as const, centerXRatio: 0.16, centerYRatio: 0.3, confidence: 0.9, evidenceKind: "ocr" as const },
      { valueMm: 2265, orientation: "horizontal" as const, centerXRatio: 0.4, centerYRatio: 0.9, confidence: 0.9, evidenceKind: "ocr" as const },
      { valueMm: 2495, orientation: "vertical" as const, centerXRatio: 0.16, centerYRatio: 0.75, confidence: 0.9, evidenceKind: "ocr" as const },
    ],
    openingSymbols: [],
    entrance: null,
    notes: [],
  },
};

assert.ok(exactMatch);
const draft = buildSourceBoundCatalogDraft({
  match: exactMatch,
  source: typeOne,
  page,
  jobId: "matched-private-import",
});
assert.ok(draft, "A known private source should become an editable canonical draft.");
assert.equal(draft.document.floors[0].rooms.length, 5);
assert.ok(draft.document.floors[0].walls.length > 0);
assert.ok(draft.document.floors[0].openings.length > 0);
assert.ok(draft.document.floors[0].calibrations[0].controlPoints.length >= 3);
assert.ok(draft.document.floors[0].dimensions.length >= 2);
assert.equal(
  draft.document.sources.find((source) => source.id === typeOne.id)?.sha256,
  typeOne.sha256,
  "The canonical draft must remain bound to the user's private upload."
);
assert.equal(
  validateFloorPlanDocumentV2(draft.document).some((issue) => issue.severity === "error"),
  false
);
const readiness = collectFloorPlanImportReadinessIssues({
  document: draft.document,
  sourceManifest: {
    pages: [{
      pageNumber: 1,
      selectedForSemanticClassification: true,
      semanticRoomLabelCount: 5,
      semanticDimensionCount: 4,
    }],
  },
});
assert.equal(readiness.some(isFloorPlanMvpBlockingIssue), false);
const design = canonicalFloorPlanToDesignSnapshot(draft.document, {
  title: "Matched floor plan",
  sourceJobId: "matched-private-import",
  sourceAssetSha256: typeOne.sha256,
});
assert.equal(design.snapshot.rooms.length, 5);

console.log("Floor-plan catalog draft matching tests passed");
}

void main();
