import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { PrismaFloorPlanSourceStore } from "@/lib/floor-plan-imports/prisma-store";
import { scrubRetainedFloorPlanSourceManifest } from "@/lib/floor-plan-imports/retention-manifest";
import {
  attachFloorPlanSupplementarySource,
  FloorPlanSupplementarySourceError,
  parseAttachedFloorPlanSupplementarySources,
  removeFloorPlanSupplementarySource,
} from "@/lib/floor-plan-imports/supplementary-sources";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";

const bundle = loadPingYiCourtV2ReviewSeedBundle();
const fixture = bundle.fixtures.find((entry) => entry.layoutId === "3gen");
assert.ok(fixture);
const document = structuredClone(fixture.document);
const primary = document.sources.find((source) => source.sha256 === bundle.source.sha256);
assert.ok(primary);
const officialPlaceholder = document.sources.find(
  (source) => source.sha256 === bundle.officialBrochure.sha256
);
assert.ok(officialPlaceholder);
const renderedPages = [{
  pageNumber: 1,
  widthPx: 1800,
  heightPx: 1200,
  assetKey: "official-page-1",
}];
const geometryBefore = compileFloorPlanDocumentV2(document).geometryHash;
const attached = attachFloorPlanSupplementarySource({
  document,
  primarySourceId: primary.id,
  attachment: {
    sourceAsset: {
      id: "durable-official-brochure",
      fileName: "official.pdf",
      mimeType: "application/pdf",
      sha256: bundle.officialBrochure.sha256,
    },
    renderedPages,
  },
});
assert.equal(
  attached.sources.some((source) => source.id === officialPlaceholder.id),
  false,
  "same-hash manifest placeholders must be replaced by the durable asset ID"
);
assert.deepEqual(
  attached.sources.find((source) => source.id === "durable-official-brochure"),
  {
    id: "durable-official-brochure",
    kind: "pdf",
    name: "official.pdf",
    mimeType: "application/pdf",
    sha256: bundle.officialBrochure.sha256,
    pageCount: 1,
    widthPx: 1800,
    heightPx: 1200,
  }
);
assert.equal(compileFloorPlanDocumentV2(attached).geometryHash, geometryBefore);
const removed = removeFloorPlanSupplementarySource({
  document: attached,
  primarySourceId: primary.id,
  sourceAssetId: "durable-official-brochure",
});
assert.equal(
  removed.sources.some((source) => source.id === "durable-official-brochure"),
  false
);
assert.equal(compileFloorPlanDocumentV2(removed).geometryHash, geometryBefore);

const geometryClaim = structuredClone(document);
geometryClaim.floors[0].vertices[0].provenance.evidence.push({
  sourceId: officialPlaceholder.id,
  basis: "inferred",
  confidence: 0.1,
  extractorVersion: "forgery-test",
});
assert.throws(
  () =>
    attachFloorPlanSupplementarySource({
      document: geometryClaim,
      primarySourceId: primary.id,
      attachment: {
        sourceAsset: {
          id: "durable-official-brochure",
          fileName: "official.pdf",
          mimeType: "application/pdf",
          sha256: bundle.officialBrochure.sha256,
        },
        renderedPages,
      },
    }),
  (cause) =>
    cause instanceof FloorPlanSupplementarySourceError &&
    cause.code === "GEOMETRY_AUTHORITY"
);

const parsedAttachments = parseAttachedFloorPlanSupplementarySources([
  {
    attachedToCandidateAt: null,
    renderedPagesJson: renderedPages,
    sourceAsset: {
      id: "not-attached",
      fileName: "untrusted.pdf",
      mimeType: "application/pdf",
      sha256: "1".repeat(64),
      contentDeletedAt: null,
    },
  },
  {
    attachedToCandidateAt: "2026-07-16T00:00:00.000Z",
    renderedPagesJson: renderedPages,
    sourceAsset: {
      id: "attached",
      fileName: "official.pdf",
      mimeType: "application/pdf",
      sha256: "2".repeat(64),
      contentDeletedAt: null,
    },
  },
  {
    attachedToCandidateAt: "2026-07-16T00:00:00.000Z",
    renderedPagesJson: renderedPages,
    sourceAsset: {
      id: "deleted",
      fileName: "deleted.pdf",
      mimeType: "application/pdf",
      sha256: "3".repeat(64),
      contentDeletedAt: "2026-07-16T01:00:00.000Z",
    },
  },
]);
assert.deepEqual(parsedAttachments.map((entry) => entry.sourceAsset.id), ["attached"]);

const rawManifest = {
  source: {
    id: "cad-source",
    fileName: "private-owner-home.dxf",
    mimeType: "application/dxf",
    byteLength: 42,
    sha256: "4".repeat(64),
  },
  cad: {
    kind: "floor_plan_cad_evidence_v1",
    format: "dxf",
    parserVersion: "dxf-test",
    units: { name: "millimetres", millimetresPerUnit: 1, basis: "source_declared" },
    entityCount: 2,
    paths: [{ id: "wall", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
    texts: [{ text: "PRIVATE BEDROOM LABEL", point: { x: 1, y: 2 } }],
    warnings: ["private-owner-home.dxf contains an unsupported label"],
    parseFailure: null,
    retainedEvidenceCounts: { paths: 1, points: 2, texts: 1 },
    conversion: {
      providerId: "safe-provider",
      providerVersion: "1.0",
      sourceFormat: "dwg",
      outputFormat: "dxf",
    },
  },
};
const scrubbed = scrubRetainedFloorPlanSourceManifest(rawManifest);
assert.equal(scrubbed.scrubbed, true);
const scrubbedText = JSON.stringify(scrubbed.manifest);
assert.doesNotMatch(scrubbedText, /PRIVATE BEDROOM LABEL|private-owner-home\.dxf/);
const scrubbedCad = (scrubbed.manifest as { cad: Record<string, unknown> }).cad;
assert.equal("paths" in scrubbedCad, false);
assert.equal("texts" in scrubbedCad, false);
assert.equal("warnings" in scrubbedCad, false);
assert.match(scrubbedText, /rawEvidenceIntegritySha256/);
assert.match(scrubbedText, /safe-provider/);

const scrubbedPdf = scrubRetainedFloorPlanSourceManifest({
  source: {
    id: "pdf-source",
    fileName: "private-address-floor-plan.pdf",
    mimeType: "application/pdf",
    byteLength: 100,
    sha256: "5".repeat(64),
  },
  pages: [{ pageNumber: 1, dimensionCount: 12 }],
  warnings: ["private-address-floor-plan.pdf had outlined text"],
});
assert.equal(scrubbedPdf.scrubbed, true);
assert.doesNotMatch(
  JSON.stringify(scrubbedPdf.manifest),
  /private-address-floor-plan\.pdf|outlined text/
);
assert.deepEqual(
  (scrubbedPdf.manifest as { pages: unknown }).pages,
  [{ pageNumber: 1, dimensionCount: 12 }],
  "non-private PDF extraction counts must survive source-byte cleanup"
);

async function testTombstoneGeneration() {
  const input = {
    ownerScope: "owner-1",
    fileName: "home.pdf",
    mimeType: "application/pdf",
    bytes: new TextEncoder().encode("%PDF-new"),
  };
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const baseDedupeKey = hashCanonicalJson({
    ownerScope: input.ownerScope,
    sha256,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  let createdData: Record<string, unknown> | null = null;
  const client = {
    floorPlanSourceAsset: {
      findFirst: async () => null,
      findUnique: async (args: { select?: { fileName?: boolean } }) => {
        if (args.select?.fileName && createdData) {
          return {
            id: "new-live-generation",
            ...createdData,
            contentDeletedAt: null,
          };
        }
        return {
          id: "deleted-generation",
          contentDeletedAt: new Date("2026-07-15T00:00:00.000Z"),
        };
      },
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        createdData = args.data[0] ?? null;
        return { count: 1 };
      },
    },
    floorPlanDerivedAsset: {
      upsert: async () => { throw new Error("unused"); },
      findUnique: async () => null,
    },
  };
  const stored = await new PrismaFloorPlanSourceStore(client).putSource(input);
  assert.equal(stored.id, "new-live-generation");
  assert.ok(createdData);
  const persistedCreate = createdData as Record<string, unknown>;
  assert.notEqual(persistedCreate.dedupeKey, baseDedupeKey);
  assert.equal("contentDeletedAt" in persistedCreate, false);
  assert.equal("contentDeletionReason" in persistedCreate, false);

  let createCalled = false;
  const liveClient = {
    ...client,
    floorPlanSourceAsset: {
      findFirst: async () => ({
        id: "existing-live",
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteLength: input.bytes.byteLength,
        sha256,
        bytes: input.bytes,
        contentDeletedAt: null,
      }),
      findUnique: async () => null,
      createMany: async () => {
        createCalled = true;
        throw new Error("live owner-scoped dedupe should return before create");
      },
    },
  };
  const live = await new PrismaFloorPlanSourceStore(liveClient).putSource(input);
  assert.equal(live.id, "existing-live");
  assert.equal(createCalled, false);
}

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

async function run() {
  await testTombstoneGeneration();
  const uploadRoute = source(
    "app/api/admin/floor-plan-imports/[id]/supplementary-sources/route.ts"
  );
  assert.match(uploadRoute, /canAccessAdmin/);
  assert.match(uploadRoute, /readBoundedRequestBody/);
  assert.match(uploadRoute, /hasExpectedFloorPlanSignature/);
  assert.match(uploadRoute, /revision: \{ is: null \}/);
  const mutationRoute = source(
    "app/api/admin/floor-plan-imports/[id]/supplementary-sources/[sourceId]/route.ts"
  );
  assert.match(mutationRoute, /candidateVersion/);
  assert.match(mutationRoute, /jobId: id/);
  assert.match(mutationRoute, /attachFloorPlanSupplementarySource/);
  assert.match(mutationRoute, /revision: \{ is: null \}/);
  const assetRoute = source(
    "app/api/admin/floor-plan-imports/[id]/assets/[assetId]/route.ts"
  );
  assert.match(assetRoute, /jobId: id, sourceAssetId: assetId/);
  const reviewRoute = source("app/api/admin/floor-plan-imports/[id]/route.ts");
  assert.match(reviewRoute, /hashCanonicalJson\(nextCompiled\.document\.sources\)/);
  const adminPanel = source(
    "app/admin/floor-plans/[id]/SupplementarySourceEvidencePanel.tsx"
  );
  assert.match(adminPanel, /Upload evidence/);
  assert.match(adminPanel, /Attach to candidate/);
  assert.match(adminPanel, /Open source/);
  assert.match(adminPanel, /Remove/);
  assert.match(adminPanel, /Page \{page\.pageNumber\}/);
  assert.match(adminPanel, /notifyFloorPlanAdminJobUpdated/);
  const workspace = [
    source("app/admin/floor-plans/[id]/FloorPlanReviewWorkspace.tsx"),
    source("app/admin/floor-plans/[id]/useFloorPlanReviewWorkspace.ts"),
  ].join("\n");
  assert.match(workspace, /useFloorPlanReviewDraftGuard/);
  const draftGuard = source(
    "app/admin/floor-plans/[id]/useFloorPlanReviewDraftGuard.ts"
  );
  assert.match(draftGuard, /subscribeToFloorPlanAdminJobUpdates/);
  assert.match(draftGuard, /subscribeToFloorPlanAdminJobMutationRequests/);
  const seedPanel = source(
    "app/admin/floor-plans/[id]/PingYiReviewSeedIntake.tsx"
  );
  assert.match(seedPanel, /subscribeToFloorPlanAdminJobUpdates/);
  const migration = source(
    "prisma/migrations/20260716223000_add_floor_plan_supplementary_sources/migration.sql"
  );
  assert.match(migration, /FloorPlanSupplementarySource_immutability_guard/);
  assert.match(migration, /FloorPlanSourceAsset_live_owner_content_key/);
  const retention = source("lib/floor-plan-imports/retention.ts");
  assert.match(retention, /floorPlanSupplementarySource\.findMany/);
  assert.match(retention, /jobId: \{ in: decision\.affectedJobIds \}/);
  assert.match(retention, /scrubRetainedFloorPlanSourceManifest/);
  console.log("Floor-plan supplementary source evidence tests passed.");
}

void run().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
