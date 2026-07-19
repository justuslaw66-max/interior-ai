import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanEntityProvenanceV2 } from "@/lib/floor-plan-document-v2";
import {
  evaluatePingYiCourtReviewSeedEligibility,
  loadPingYiCourtV2ReviewSeedBundle,
  preparePingYiCourtReviewSeedApplication,
} from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";

const fixturePanelSource = fs.readFileSync(
  path.join(process.cwd(), "app/admin/floor-plans/AdminFloorPlanFixturePanel.tsx"),
  "utf8"
);
const reviewJobButtonSource = fs.readFileSync(
  path.join(process.cwd(), "app/admin/floor-plans/PingYiReviewJobButton.tsx"),
  "utf8"
);
const reviewJobRouteSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/api/admin/floor-plan-imports/review-seeds/route.ts"
  ),
  "utf8"
);

const bundle = structuredClone(loadPingYiCourtV2ReviewSeedBundle());

assert.match(fixturePanelSource, /<PingYiReviewJobButton/);
assert.match(reviewJobButtonSource, /Create editable review job/);
assert.match(fixturePanelSource, /counts\.rooms[\s\S]*?counts\.walls[\s\S]*?counts\.openings/);
assert.match(
  fixturePanelSource,
  /review-stack-binding-\$\{layout\.layout_id\}-\$\{binding\.block\}[\s\S]*?binding\.stacks\.join\(", "\)[\s\S]*?binding\.transform\.replaceAll/,
  "Review fixtures should expose their corroborated stacks while keeping unresolved transforms visible."
);
assert.match(
  reviewJobButtonSource,
  /\/api\/admin\/floor-plan-imports\/review-seeds[\s\S]*?processUrl[\s\S]*?fetch\(reviewSeedUrl, \{ cache: "no-store" \}\)[\s\S]*?candidateVersion: availability\.candidateVersion[\s\S]*?router\.push\(reviewUrl\)/,
  "The fixture action should create, process, seed, and open a durable review job."
);
assert.match(reviewJobRouteSource, /canAccessAdmin\(session\?\.user\?\.email\)/);
assert.match(reviewJobRouteSource, /downloadPingYiCourtReviewSource\(\{ bundle \}\)/);
assert.match(reviewJobRouteSource, /new PrismaFloorPlanSourceStore\(\)/);
assert.match(reviewJobRouteSource, /new PrismaFloorPlanImportJobRepository\(transaction\)/);
const sourceAsset = {
  id: "uploaded-source-asset",
  fileName: "pyc.pdf",
  mimeType: "application/pdf",
  sha256: bundle.source.sha256,
  contentDeletedAt: null,
};

assert.deepEqual(
  evaluatePingYiCourtReviewSeedEligibility(
    { status: "ready", hasRevision: false, leaseToken: null, sourceAsset },
    bundle
  ),
  { sourceMatches: true, eligible: true, reason: null }
);
assert.equal(
  evaluatePingYiCourtReviewSeedEligibility(
    { status: "received", hasRevision: false, leaseToken: null, sourceAsset },
    bundle
  ).eligible,
  false
);
assert.equal(
  evaluatePingYiCourtReviewSeedEligibility(
    { status: "ready", hasRevision: true, leaseToken: null, sourceAsset },
    bundle
  ).eligible,
  false
);
assert.equal(
  evaluatePingYiCourtReviewSeedEligibility(
    { status: "ready", hasRevision: false, leaseToken: "worker-lease", sourceAsset },
    bundle
  ).eligible,
  false
);
assert.deepEqual(
  evaluatePingYiCourtReviewSeedEligibility(
    {
      status: "ready",
      hasRevision: false,
      leaseToken: null,
      sourceAsset: { ...sourceAsset, sha256: "0".repeat(64) },
    },
    bundle
  ).sourceMatches,
  false
);

const selected = bundle.fixtures.find((fixture) => fixture.layoutId === "4-room");
assert.ok(selected);
const primarySourceId = selected.document.sources.find(
  (source) => source.sha256 === bundle.source.sha256
)?.id;
assert.ok(primarySourceId);
selected.document.floors[0].calibrations.push({
  id: "test-source-registration",
  sourceId: primarySourceId,
  pageNumber: selected.sourcePage,
  imageWidthPx: 1000,
  imageHeightPx: 1000,
  controlPoints: [
    { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } },
    { sourcePx: { x: 100, y: 0 }, planMm: { xMm: 1000, zMm: 0 } },
  ],
});

const seededBlocker = selected.reviewIssues.find((issue) => issue.severity === "critical");
assert.ok(seededBlocker);
const prepared = preparePingYiCourtReviewSeedApplication({
  bundle,
  jobId: "first-import-job",
  layoutId: selected.layoutId,
  sourceAsset,
  existingReviewIssues: [
    {
      ...seededBlocker,
      resolved: true,
      resolution: "A stale candidate must not waive the native seed blocker.",
    },
    {
      id: "pipeline-critical",
      code: "PIPELINE_CRITICAL",
      message: "Existing extraction evidence remains reviewable.",
      severity: "critical",
      resolved: false,
    },
  ],
  existingSourceManifest: { detectorEvidence: { renderedPages: [1] } },
  existingCorrectionLog: [{ at: "2026-07-15T00:00:00.000Z", action: "earlier-correction" }],
  candidateVersion: 3,
  actorAdmin: "reviewer@example.com",
  appliedAt: "2026-07-16T00:00:00.000Z",
});

assert.equal(prepared.candidate.verification.tier, "needs_review");
assert.equal(
  prepared.candidate.revisionId,
  "floor-plan:sg-hdb-ping-yi-court:4-room:import:first-import-job"
);
assert.equal(prepared.candidate.createdAt, "2026-07-16T00:00:00.000Z");
assert.equal("approvedBy" in prepared.candidate.verification, false);
assert.ok(prepared.candidate.verification.criticalIssueIds.includes(seededBlocker.id));
assert.ok(prepared.candidate.verification.criticalIssueIds.includes("pipeline-critical"));
assert.equal(
  prepared.reviewIssues.find((issue) => issue.id === seededBlocker.id)?.resolved,
  false,
  "The native seed must restore its unresolved critical blocker."
);
assert.equal(prepared.candidate.sources[0].id, sourceAsset.id);
assert.equal(prepared.candidate.sources[0].sha256, bundle.source.sha256);
assert.ok(
  prepared.candidate.sources.some(
    (source) => source.sha256 === bundle.officialBrochure.sha256 && source.id !== sourceAsset.id
  ),
  "The independent official brochure source must be retained."
);
assert.equal(prepared.candidate.floors[0].calibrations[0].sourceId, sourceAsset.id);

function provenances(): FloorPlanEntityProvenanceV2[] {
  return prepared.candidate.floors.flatMap((floor) => [
    ...Object.values(floor.defaults).map((property) => property.provenance),
    ...floor.vertices.map((entity) => entity.provenance),
    ...floor.walls.map((entity) => entity.provenance),
    ...floor.rooms.map((entity) => entity.provenance),
    ...floor.openings.map((entity) => entity.provenance),
    ...floor.structures.map((entity) => entity.provenance),
    ...floor.annotations.map((entity) => entity.provenance),
    ...floor.dimensions.map((entity) => entity.provenance),
  ]);
}

assert.ok(
  provenances().every((provenance) =>
    provenance.evidence.every((evidence) => evidence.sourceId !== primarySourceId)
  ),
  "No canonical provenance may retain the generator-only primary source ID."
);
assert.ok(
  provenances().some((provenance) =>
    provenance.evidence.some((evidence) => evidence.sourceId === sourceAsset.id)
  )
);
assert.equal(compileFloorPlanDocumentV2(prepared.candidate).geometryHash, prepared.geometryHash);

const officialBrochureAsset = {
  id: "uploaded-official-brochure",
  fileName: "ping-yi-court-official.pdf",
  mimeType: "application/pdf",
  sha256: bundle.officialBrochure.sha256,
  pageCount: bundle.officialBrochure.page_count,
  contentDeletedAt: null,
};
const durablePrepared = preparePingYiCourtReviewSeedApplication({
  bundle,
  jobId: "durable-brochure-import-job",
  layoutId: selected.layoutId,
  sourceAsset,
  supplementarySourceAssets: [officialBrochureAsset],
  existingReviewIssues: [],
  existingSourceManifest: null,
  existingCorrectionLog: [],
  candidateVersion: 0,
  actorAdmin: "reviewer@example.com",
  appliedAt: "2026-07-16T00:00:30.000Z",
});
assert.equal(
  durablePrepared.candidate.sources.find(
    (source) => source.sha256 === bundle.officialBrochure.sha256
  )?.id,
  officialBrochureAsset.id,
  "an attached official brochure must replace the generator-only source ID"
);
assert.equal(
  (durablePrepared.correctionLog.at(-1) as Record<string, unknown>)
    .officialBrochureSourceAssetId,
  officialBrochureAsset.id
);
assert.equal(
  compileFloorPlanDocumentV2(durablePrepared.candidate).geometryHash,
  prepared.geometryHash,
  "durable supplementary provenance must not change canonical geometry"
);

const sourceManifest = prepared.sourceManifest as {
  detectorEvidence?: unknown;
  nativeV2ReviewSeed?: Record<string, unknown>;
};
assert.deepEqual(sourceManifest.detectorEvidence, { renderedPages: [1] });
assert.equal(sourceManifest.nativeV2ReviewSeed?.layoutId, "4-room");
assert.deepEqual(sourceManifest.nativeV2ReviewSeed?.officialBrochure, bundle.officialBrochure);
assert.equal(prepared.correctionLog.length, 2);
assert.deepEqual(prepared.correctionLog[0], {
  at: "2026-07-15T00:00:00.000Z",
  action: "earlier-correction",
});
assert.deepEqual(
  (prepared.correctionLog[1] as Record<string, unknown>).candidateVersion,
  4
);

const secondPrepared = preparePingYiCourtReviewSeedApplication({
  bundle,
  jobId: "second-import-job",
  layoutId: selected.layoutId,
  sourceAsset: { ...sourceAsset, id: "second-uploaded-source-asset" },
  existingReviewIssues: [],
  existingSourceManifest: null,
  existingCorrectionLog: [],
  candidateVersion: 0,
  actorAdmin: "reviewer@example.com",
  appliedAt: "2026-07-16T00:01:00.000Z",
});
assert.notEqual(secondPrepared.candidate.revisionId, prepared.candidate.revisionId);
assert.equal(
  secondPrepared.geometryHash,
  prepared.geometryHash,
  "Job-specific revision identity and timestamps must not change canonical geometry."
);

const route = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/api/admin/floor-plan-imports/[id]/review-seed/route.ts"
  ),
  "utf8"
);
assert.match(route, /canAccessAdmin/);
assert.match(route, /candidateVersion: current\.candidateVersion/);
assert.match(route, /revision: \{ is: null \}/);
assert.match(route, /sha256: bundle\.source\.sha256/);
assert.match(route, /status: "needs_review"/);
assert.match(route, /supplementarySourceAssets/);
assert.doesNotMatch(route, /floorPlanRevision\.(?:create|update|upsert)/);

const intakeUi = fs.readFileSync(
  path.join(process.cwd(), "app/admin/floor-plans/[id]/PingYiReviewSeedIntake.tsx"),
  "utf8"
);
assert.match(intakeUi, /if \(!availability\?\.sourceMatches\) return null/);
assert.match(intakeUi, /It is not approved/);

console.log("Ping Yi Court admin native V2 review-seed intake checks passed.");
