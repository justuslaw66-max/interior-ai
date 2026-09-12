import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncFloorPlanDesignReference } from "@/lib/floor-plan-design-reference";
import { prismaPublishedFloorPlanRevisionDataSource } from "@/lib/floor-plan-catalog-prisma";
import { mapPublishedFloorPlanRevisionRows } from "@/lib/floor-plan-catalog-repository";
import { validateFloorPlanAddressBindingEvidence } from "@/lib/floor-plan-imports/address-binding-evidence";
import { floorPlanSourceObservationManifestSchema } from "@/lib/floor-plan-imports/source-observation-manifest";
import { assessFloorPlanServingIntegrity } from "@/lib/floor-plan-imports/serving-integrity";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { document as fixtureDocument } from "../required/fixtures/floor-plan-directory-fixture";

const target = "interior_ai_fpd_fast_feature_test_20260911";
const owner = "fpd-synthetic-owner";
const stranger = "fpd-synthetic-stranger";
const privateAddress = "867A Fictional Test Street";
const date = new Date("2026-07-16T00:00:00.000Z");
const checks: string[] = [];
const doc = structuredClone(fixtureDocument);
doc.floors[0].rooms[0].id = "room-1";
doc.floors[0].openings.forEach((opening, index) => { opening.id = `opening-${index + 1}`; });
for (const wall of doc.floors[0].walls) wall.adjacentRoomIds = ["room-1"];
const geometryHash = compileFloorPlanDocumentV2(doc).geometryHash;
const sourceHash = doc.sources[0].sha256!;
const pages = [{ pageNumber: 1, widthPx: 400, heightPx: 300, assetKey: "synthetic/page-1.webp" }];
const snapshot = (unitFloor: number | null = 12) => ({ version: 3, floorPlan: {
  canonicalDocument: doc, revisionId: doc.revisionId, sourceRevisionGeometryHash: geometryHash,
  sourceAssetSha256: sourceHash, addressTransform: "normal", addressBinding: {
    bindingId: "binding-synthetic", unitFloor, unitStack: unitFloor === null ? null : "509",
  },
} });
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

async function seed(validateOnly = false) {
  const publicationChecks = Object.fromEntries([
    "dimensionsExact", "criticalElementsAccountedFor", "topologyValid", "overlayRegistered",
    "sourceOverlayAnchorsWithinOnePixel", "renderParityVerified", "persistenceRoundTripVerified",
    "sourceBound", "sourceEvidenceWithinBounds", "sourceObservationsComplete", "publicationRightsCleared",
  ].map((key) => [key, true]));
  const observations = floorPlanSourceObservationManifestSchema.parse({
    schemaVersion: 1, source: { assetId: "source-1", sha256: sourceHash, mimeType: "application/pdf" },
    candidateVersion: 1, recordedByReviewerId: "reviewer@example.com", recordedAt: date.toISOString(),
    rightsEvidence: { status: "permission_confirmed", basis: "Synthetic test fixture permission only.",
      evidenceReference: "synthetic-fixture", permitsDerivedFloorPlanPublication: true,
      sourceAssetRedistributionAllowed: false, expiresAt: null },
    reviewerNotes: "Synthetic observations for local database testing only.",
    observations: [
      ...doc.floors[0].walls.map((wall, i) => ({ id: `observation-wall-${i}`, kind: "wall",
        floorId: "floor-1", canonicalEntityId: wall.id, pageNumber: 1,
        cropPx: { xPx: 0, yPx: 0, widthPx: 400, heightPx: 300 },
        anchorsPx: [{ role: "start", xPx: 10, yPx: 10 }, { role: "end", xPx: 20, yPx: 20 }] })),
      ...doc.floors[0].openings.map((opening, i) => ({ id: `observation-opening-${i}`, kind: "opening",
        floorId: "floor-1", canonicalEntityId: opening.id, pageNumber: 1,
        cropPx: { xPx: 0, yPx: 0, widthPx: 400, heightPx: 300 },
        anchorsPx: [{ role: "start", xPx: 10, yPx: 10 }, { role: "end", xPx: 20, yPx: 20 }] })),
      { id: "observation-label", kind: "label", floorId: "floor-1", canonicalEntityId: "room-1",
        pageNumber: 1, cropPx: { xPx: 0, yPx: 0, widthPx: 400, heightPx: 300 },
        anchorsPx: [{ role: "label", xPx: 20, yPx: 20 }], observedText: "Living / Dining" },
    ],
  });
  const manifest = { schemaVersion: 3, sourceObservationManifest: observations, generatedAt: date.toISOString(), reviewerId: "reviewer@example.com",
    geometryHash, sourceInventory: { licenseStatus: "permission_confirmed" }, publicationChecks,
    sourceOverlayVerification: { passed: true, residuals: [{ residualPx: 0 }] } };
  const binding = { countryCode: "SG", addressNormalized: privateAddress, block: "867A",
    street: "Fictional Test Street", postalCode: null, stack: "509", floorMin: 2, floorMax: 15,
    transform: "normal" as const, sourceEvidence: {
      schemaVersion: 1, sourceId: "source-1", sourceSha256: sourceHash, pageNumber: 1,
      cropPx: { xPx: 0, yPx: 0, widthPx: 400, heightPx: 300 },
      anchors: [
        { kind: "block_label", xPx: 10, yPx: 10, observedText: "BLOCK 867A" },
        { kind: "stack_label", xPx: 20, yPx: 20, observedText: "509" },
        { kind: "floor_range", xPx: 30, yPx: 30, observedText: "#02-#15" },
        { kind: "layout_label", xPx: 40, yPx: 40, observedText: "Synthetic layout" },
        { kind: "orientation_marker", xPx: 50, yPx: 50, observedText: "page top" },
      ], observed: { block: "867A", stacks: ["509"], floorMin: 2, floorMax: 15, documentId: doc.id },
      reviewerConfirmation: { confirmed: true, scope: "address_binding_and_orientation",
        reviewerId: "reviewer@example.com", reviewedAt: date.toISOString() },
      orientationSupport: { transform: "normal", sourceUp: "page_top", basis: "source_orientation_marker" },
    } };
  const validated = validateFloorPlanAddressBindingEvidence([binding], {
    document: doc, sourceAsset: { id: "source-1", sha256: sourceHash }, renderedPages: pages,
    reviewer: { id: "reviewer@example.com", reviewedAt: date.toISOString() },
  })[0];
  const integrity = assessFloorPlanServingIntegrity({ id: doc.revisionId, geometryHash,
    verificationTier: "source_verified", publicationStatus: "published", publishedAt: date,
    approvedAt: date, approvedByEmail: "reviewer@example.com", publishedByEmail: "publisher@example.com",
    documentJson: doc, sourceManifestJson: manifest, constructionEvidenceJson: null,
    publicMetadata: { floorAreaSqm: null, sourceUrl: null, sourceTitle: null, sourcePage: null, projectName: "Synthetic public project", label: "Synthetic layout",
      flatType: "4-room", previewUrl: "/synthetic-preview.webp", publisher: "Synthetic publisher",
      approvedAt: date, approvedByEmail: "reviewer@example.com" },
    sourceJob: { renderedPagesJson: pages, supplementarySources: [], constructionSources: [],
      sourceAsset: { id: "source-1", sha256: sourceHash, mimeType: "application/pdf", contentDeletedAt: null } },
    addressBindings: [{ ...validated, id: "binding-synthetic", sourceEvidenceJson: validated.sourceEvidence }],
  });
  assert.equal(integrity.valid, true, JSON.stringify(integrity.issues));
  if (validateOnly) return;
  await prisma.$transaction(async (tx) => {
    for (const id of [owner, stranger]) await tx.user.create({ data: { id, email: `${id}@example.test` } });
    await tx.floorPlanSourceAsset.create({ data: { id: "source-1", sha256: sourceHash,
      dedupeKey: "a".repeat(64), ownerScope: owner, fileName: "synthetic.pdf", mimeType: "application/pdf",
      byteLength: 1, bytes: Buffer.from([0]), storageKey: "synthetic/source" } });
    await tx.floorPlanImportJob.create({ data: { id: "job-synthetic", userId: owner,
      sourceAssetId: "source-1", renderedPagesJson: pages, sourceObservationManifestJson: json(observations), sourceObservationVersion: 1 } });
    await tx.floorPlanRevision.create({ data: { id: doc.revisionId, sourceJobId: "job-synthetic",
      geometryHash, documentJson: json(doc), sourceManifestJson: json(manifest), sourceObservationManifestJson: json(observations), verificationTier: "source_verified" } });
    const { sourceEvidence, ...fields } = validated;
    await tx.floorPlanAddressBinding.create({ data: { ...fields, id: "binding-synthetic",
      revisionId: doc.revisionId, sourceEvidenceJson: json(sourceEvidence) } });
    await tx.floorPlanRevision.update({ where: { id: doc.revisionId }, data: {
      publicationStatus: "approved", approvedAt: date, approvedByEmail: "reviewer@example.com",
    } });
    await tx.floorPlanRevisionPublicMetadata.create({ data: { revisionId: doc.revisionId,
      projectName: "Synthetic public project", label: "Synthetic layout", flatType: "4-room",
      previewUrl: "/synthetic-preview.webp", publisher: "Synthetic publisher", approvedAt: date,
      approvedByEmail: "reviewer@example.com" } });
    for (const eventType of ["revision_approved", "revision_published"] as const) {
      await tx.floorPlanRevisionAuditEvent.create({ data: { revisionId: doc.revisionId, occurredAt: date,
        eventType, actorEmail: "reviewer@example.com", sourceEvidenceJson: { syntheticFixture: true } } });
    }
    await tx.floorPlanRevision.update({ where: { id: doc.revisionId }, data: { publicationStatus: "published",
      approvedAt: date, approvedByEmail: "reviewer@example.com", publishedAt: date, publishedByEmail: "publisher@example.com" } });
  });
}

async function save(id: string, value: unknown, userId = owner, previousSnapshot?: unknown) {
  return prisma.$transaction(async (tx) => {
    await tx.design.update({ where: { id }, data: { title: "saved synthetic", snapshot: json(value) } });
    return syncFloorPlanDesignReference({ client: tx, designId: id, ownerUserId: userId,
      snapshot: value, previousSnapshot });
  });
}
async function rejectsWithoutWrites(id: string, value: unknown, code: string, userId = owner, previous?: unknown) {
  const before = await prisma.design.findUniqueOrThrow({ where: { id }, include: { floorPlanReference: true } });
  await assert.rejects(save(id, value, userId, previous), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === code);
  const after = await prisma.design.findUniqueOrThrow({ where: { id }, include: { floorPlanReference: true } });
  assert.deepEqual(after, before, `${code} must roll back both design and lineage`);
  checks.push(code + " rollback");
}
async function catalog(mode: "browse" | "search", stack = "509") {
  return prismaPublishedFloorPlanRevisionDataSource.listPublishedRevisions({ mode, take: 10,
    addressTokens: mode === "search" ? ["867a", "fictional", "test", "street"] : [],
    countryCode: "SG", unit: mode === "search" ? { floor: 12, stack } : undefined });
}
async function main() {
  assert.equal(process.env.FPD_APPROVED_DISPOSABLE_DATABASE, target);
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "5432"); assert.equal(url.pathname, `/${target}`);
  const identity = await prisma.$queryRaw<Array<{ database: string; host: string; port: number; oid: number }>>`
    SELECT current_database() AS database, host(inet_server_addr()) AS host, inet_server_port() AS port,
      (SELECT oid::int FROM pg_database WHERE datname=current_database()) AS oid`;
  assert.deepEqual(identity[0], { database: target, host: "127.0.0.1", port: 5432, oid: Number(process.env.FPD_DATABASE_OID) });
  await seed(); checks.push("effective target and synthetic seed through unchanged constraints");
  for (const id of ["design-exact", "design-legacy", "design-new", "design-stranger"]) {
    await prisma.design.create({ data: { id, userId: id === "design-stranger" ? stranger : owner, roomWidth: 4, roomDepth: 3, items: [], snapshot: {} } });
  }
  const exact = snapshot(); await save("design-exact", exact);
  const loaded = await prisma.design.findUniqueOrThrow({ where: { id: "design-exact" }, include: { floorPlanReference: true } });
  assert.deepEqual(loaded.snapshot, exact); assert.equal(loaded.floorPlanReference?.geometryHash, geometryHash);
  checks.push("committed design and indexed reference read back identically");
  await rejectsWithoutWrites("design-exact", exact, "DESIGN_NOT_OWNED", stranger);
  await rejectsWithoutWrites("design-exact", snapshot(98), "ADDRESS_UNIT_MISMATCH");
  await rejectsWithoutWrites("design-exact", { floorPlan: { ...exact.floorPlan, sourceRevisionGeometryHash: "f".repeat(64) } }, "LINEAGE_GEOMETRY_HASH_MISMATCH");
  await rejectsWithoutWrites("design-stranger", { floorPlan: { sourceJobId: "job-synthetic" } }, "SOURCE_JOB_NOT_OWNED", stranger);
  const rows = await catalog("search"); assert.equal(rows.rows.length, 1, "valid published exact match must be served");
  const publicResults = mapPublishedFloorPlanRevisionRows(rows.rows, { exactSearch: { countryCode: "SG", address: privateAddress, unit: { floor: 12, stack: "509" } } });
  assert.equal(publicResults.length, 1, "valid persistence metadata must project into the strict public DTO"); assert.equal(publicResults[0].matchLevel, "unit");
  assert.ok(!JSON.stringify(publicResults).includes(privateAddress));
  assert.ok(!JSON.stringify(publicResults).includes('"unitStack"'));
  assert.equal((await catalog("search", "999")).rows.length, 0);
  assert.equal((await catalog("browse")).rows.length, 1); checks.push("real catalogue exact matching, public privacy and wrong-unit exclusion");
  // Reproduce an already persisted legacy reference, not a newly authorized legacy selection.
  await prisma.design.update({ where: { id: "design-legacy" }, data: { snapshot: json(snapshot(null)) } });
  const { createdAt: _created, updatedAt: _updated, ...reference } = loaded.floorPlanReference!;
  void _created; void _updated;
  await prisma.floorPlanDesignReference.create({ data: { ...reference, designId: "design-legacy" } });
  await prisma.$transaction(async (tx) => {
    await tx.floorPlanRevisionAuditEvent.create({ data: { revisionId: doc.revisionId,
      eventType: "revision_retired", occurredAt: date, sourceEvidenceJson: { syntheticFixture: true } } });
    await tx.floorPlanRevision.update({ where: { id: doc.revisionId }, data: { publicationStatus: "retired" } });
  });
  await save("design-exact", exact, owner, exact); await save("design-legacy", snapshot(null), owner, snapshot(null));
  checks.push("owned exact and legacy lineage remain savable after audited retirement");
  await rejectsWithoutWrites("design-new", exact, "REVISION_NOT_ELIGIBLE");
  await rejectsWithoutWrites("design-exact", snapshot(13), "REVISION_NOT_ELIGIBLE", owner, exact);
  assert.equal((await catalog("search")).rows.length, 0); assert.equal((await catalog("browse")).rows.length, 0);
  checks.push("retired revision excluded from future public selection");
  console.log(JSON.stringify({ passed: true, checks }));
}
void (process.argv.includes("--validate-fixture") ? seed(true) : main()).then(async () => { await prisma.$disconnect(); process.exit(0); }).catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[connection redacted]") : "Unknown test failure";
  console.error(JSON.stringify({ passed: false, checks, message })); await prisma.$disconnect(); process.exit(1);
});
