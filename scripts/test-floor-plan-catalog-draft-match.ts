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
import {
  readCatalogFloorPlanPreviewAsset,
  resolveCatalogFloorPlanPreviewAssetPath,
} from "@/lib/floor-plan-imports/catalog-preview-asset";
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
const knownPreviewUrl = "/assets/floor-plans/sg/hdb/ping-yi-court/previews/2-room-flexi-type-1.webp";
const knownPreviewPath = path.join(previewRoot, "2-room-flexi-type-1.webp");
assert.equal(resolveCatalogFloorPlanPreviewAssetPath(knownPreviewUrl), knownPreviewPath);
assert.equal(
  resolveCatalogFloorPlanPreviewAssetPath(knownPreviewUrl.replace("2-room", "%32-room")),
  knownPreviewPath,
  "A single valid URL encoding must resolve to the intended local asset."
);
assert.equal(
  resolveCatalogFloorPlanPreviewAssetPath(`${knownPreviewUrl}?revision=1`),
  knownPreviewPath,
  "A query string must not become part of the local asset file name."
);
assert.equal(
  resolveCatalogFloorPlanPreviewAssetPath(`${knownPreviewUrl}#preview`),
  knownPreviewPath,
  "A fragment must not become part of the local asset file name."
);
assert.ok(readCatalogFloorPlanPreviewAsset(knownPreviewUrl)?.byteLength);

const missingPreviewUrl = "/assets/floor-plans/sg/hdb/ping-yi-court/previews/missing.webp";
assert.ok(resolveCatalogFloorPlanPreviewAssetPath(missingPreviewUrl)?.startsWith(previewRoot));
assert.equal(
  readCatalogFloorPlanPreviewAsset(missingPreviewUrl),
  null,
  "A missing catalog preview must preserve the existing skip/fallback behavior."
);
assert.equal(resolveCatalogFloorPlanPreviewAssetPath("/floor-plans/preview.webp"), null);
assert.equal(resolveCatalogFloorPlanPreviewAssetPath("http://example.test/assets/preview.webp"), null);
assert.equal(resolveCatalogFloorPlanPreviewAssetPath("https://example.test/assets/preview.webp"), null);

for (const rejected of [
  "/assets/../package.json",
  "/assets/floor-plans/../../package.json",
  "/assets/%2e%2e/package.json",
  "/assets/%2E%2E%2Fpackage.json",
  "/assets/%252e%252e%252fpackage.json",
  "/assets/..\\package.json",
  "/assets/%2e%2e%5cpackage.json",
  "/assets//etc/passwd",
  "/assets/C:/Windows/system.ini",
  "/assets/C:\\Windows\\system.ini",
  "/assets/preview\0.webp",
  "/assets/preview%00.webp",
  "/assets/preview%zz.webp",
  "/assets/",
]) {
  assert.equal(
    resolveCatalogFloorPlanPreviewAssetPath(rejected),
    null,
    `Unsafe preview path must be rejected: ${JSON.stringify(rejected)}`
  );
}

const normalizedRelative = path.relative(
  path.resolve(process.cwd(), "public", "assets"),
  resolveCatalogFloorPlanPreviewAssetPath(knownPreviewUrl) ?? ""
);
assert.ok(normalizedRelative && !normalizedRelative.startsWith("..") && !path.isAbsolute(normalizedRelative));
assert.throws(
  () => readCatalogFloorPlanPreviewAsset("/assets/floor-plans"),
  /EISDIR|illegal operation on a directory|is a directory/i,
  "An existing unreadable asset candidate must preserve the existing read failure."
);

const symlinkFixtureRoot = fs.mkdtempSync(
  path.join(process.cwd(), "public", "assets", ".ch0015i-symlink-")
);
const outsideLink = path.join(symlinkFixtureRoot, "outside-link");
try {
  fs.symlinkSync(path.join(process.cwd(), "package.json"), outsideLink);
  assert.equal(
    readCatalogFloorPlanPreviewAsset(`/assets/${path.basename(symlinkFixtureRoot)}/outside-link`),
    null,
    "A symlink must not escape the real public/assets root."
  );
} finally {
  fs.rmSync(symlinkFixtureRoot, { recursive: true, force: true });
}

const resolverSource = fs.readFileSync(
  path.join(process.cwd(), "lib/floor-plan-imports/catalog-preview-asset.ts"),
  "utf8"
);
assert.match(
  resolverSource,
  /path\.join\(\s*process\.cwd\(\),\s*"public",\s*"assets",\s*relativeAssetPath\s*\)/,
  "The trace-visible root must be statically bounded to public/assets."
);
assert.doesNotMatch(
  resolverSource,
  /path\.(?:resolve|join)\(process\.cwd\(\),\s*"public"\s*,?\s*\)/,
  "The Floor Plan owner must not expose public or the repository root to a dynamic suffix."
);
assert.match(resolverSource, /previewUrl\.startsWith\(PREVIEW_ASSET_URL_PREFIX\)/);
assert.match(resolverSource, /path\.relative\(root, candidate\)/);
assert.match(resolverSource, /realRoot !== FLOOR_PLAN_PREVIEW_ASSET_ROOT/);
assert.match(resolverSource, /openSync\(\s*candidate,/);
assert.match(resolverSource, /fstatSync\(descriptor, \{ bigint: true \}\)/);
assert.match(resolverSource, /realpathSync\(candidate\)/);
assert.match(resolverSource, /statSync\(openedRealCandidate, \{ bigint: true \}\)/);
assert.match(resolverSource, /openedIdentity\.dev !== validatedIdentity\.dev/);
assert.match(resolverSource, /openedIdentity\.ino !== validatedIdentity\.ino/);
assert.match(resolverSource, /readFileSync\(descriptor\)/);
assert.match(resolverSource, /closeSync\(descriptor\)/);
assert.doesNotMatch(resolverSource, /readFileSync\(candidate\)/);
assert.doesNotMatch(resolverSource, /readFileSync\(realCandidate\)/);
const matcherSource = fs.readFileSync(
  path.join(process.cwd(), "lib/floor-plan-imports/catalog-draft-match.ts"),
  "utf8"
);
assert.match(matcherSource, /readCatalogFloorPlanPreviewAsset\(layout\.preview_url\)/);
assert.doesNotMatch(matcherSource, /process\.cwd\(\)|readFileSync|existsSync/);

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
