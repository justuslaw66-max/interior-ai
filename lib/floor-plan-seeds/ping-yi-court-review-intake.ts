import fs from "node:fs";
import path from "node:path";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import type { FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";
import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";
import {
  generatePingYiCourtV2ReviewSeedBundle,
  type PingYiCourtReviewSeedBundleV2,
  type PingYiCourtSourceManifestV2,
} from "./ping-yi-court-v2";

const PLAN_ID = "sg-hdb-ping-yi-court";
const REVIEWABLE_STATUSES = new Set(["needs_review", "ready"]);

export type PingYiCourtReviewSeedSourceAsset = {
  id: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  contentDeletedAt?: Date | string | null;
};

export type PingYiCourtReviewSeedSupplementarySourceAsset =
  PingYiCourtReviewSeedSourceAsset & { pageCount: number };

export type PingYiCourtReviewSeedEligibilityInput = {
  status: string;
  hasRevision: boolean;
  leaseToken?: string | null;
  sourceAsset: PingYiCourtReviewSeedSourceAsset;
};

export type PingYiCourtReviewSeedEligibility = {
  sourceMatches: boolean;
  eligible: boolean;
  reason: string | null;
};

export type PreparedPingYiCourtReviewSeedApplication = {
  candidate: FloorPlanDocumentV2;
  candidateHash: string;
  geometryHash: string;
  reviewIssues: FloorPlanReviewIssue[];
  sourceManifest: Record<string, unknown>;
  correctionLog: unknown[];
};

function manifestPath(): string {
  return path.join(
    process.cwd(),
    "catalog",
    "floor-plans",
    "sg",
    "hdb",
    "ping-yi-court",
    "source-manifest.json"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function entityProvenances(document: FloorPlanDocumentV2): FloorPlanEntityProvenanceV2[] {
  return document.floors.flatMap((floor) => [
    ...Object.values(floor.verticalEvidence ?? {}).map(
      (property) => property.provenance
    ),
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

function mergeReviewIssues(
  existing: FloorPlanReviewIssue[],
  seeded: FloorPlanReviewIssue[]
): FloorPlanReviewIssue[] {
  const issues = new Map(existing.map((issue) => [issue.id, structuredClone(issue)]));
  for (const issue of seeded) {
    // Seed blockers are intentionally authoritative and unresolved. A prior
    // extraction issue with the same ID must not silently waive seed review.
    issues.set(issue.id, structuredClone(issue));
  }
  if (issues.size > 500) {
    throw new Error("Review seed and existing extraction exceed the 500-issue review limit");
  }
  return [...issues.values()];
}

function appendSeedManifestEvidence(input: {
  existing: unknown;
  evidence: Record<string, unknown>;
}): Record<string, unknown> {
  const existing = isRecord(input.existing)
    ? structuredClone(input.existing)
    : input.existing == null
      ? {}
      : { pipelineSourceManifest: structuredClone(input.existing) };
  const previousHistory = Array.isArray(existing.nativeV2ReviewSeedHistory)
    ? structuredClone(existing.nativeV2ReviewSeedHistory)
    : [];
  if (isRecord(existing.nativeV2ReviewSeed)) {
    previousHistory.push(structuredClone(existing.nativeV2ReviewSeed));
  }
  return {
    ...existing,
    nativeV2ReviewSeed: input.evidence,
    ...(previousHistory.length ? { nativeV2ReviewSeedHistory: previousHistory } : {}),
  };
}

export function loadPingYiCourtV2ReviewSeedBundle(): PingYiCourtReviewSeedBundleV2 {
  const catalog = getAllFloorPlanLibraryCatalogs().find(
    (candidate) => candidate.floor_plan.plan_id === PLAN_ID
  );
  if (!catalog) throw new Error(`Missing ${PLAN_ID} compatibility catalog`);
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath(), "utf8")
  ) as PingYiCourtSourceManifestV2;
  return generatePingYiCourtV2ReviewSeedBundle(catalog, manifest);
}

export function evaluatePingYiCourtReviewSeedEligibility(
  input: PingYiCourtReviewSeedEligibilityInput,
  bundle: PingYiCourtReviewSeedBundleV2
): PingYiCourtReviewSeedEligibility {
  const sourceMatches =
    input.sourceAsset.mimeType === "application/pdf" &&
    input.sourceAsset.sha256 === bundle.source.sha256;
  if (!sourceMatches) {
    return { sourceMatches: false, eligible: false, reason: "Uploaded source is not the Ping Yi Court source PDF." };
  }
  if (input.sourceAsset.contentDeletedAt) {
    return { sourceMatches: true, eligible: false, reason: "The uploaded source has been deleted." };
  }
  if (input.hasRevision) {
    return { sourceMatches: true, eligible: false, reason: "This import already owns an immutable revision." };
  }
  if (input.leaseToken) {
    return { sourceMatches: true, eligible: false, reason: "The import worker still owns this job." };
  }
  if (!REVIEWABLE_STATUSES.has(input.status)) {
    return { sourceMatches: true, eligible: false, reason: "Move the import to needs review or ready before applying a seed." };
  }
  return { sourceMatches: true, eligible: true, reason: null };
}

export function rewriteFloorPlanPrimarySourceForReview(input: {
  document: FloorPlanDocumentV2;
  expectedSha256: string;
  sourceAsset: PingYiCourtReviewSeedSourceAsset;
}): FloorPlanDocumentV2 {
  const document = structuredClone(input.document);
  const matches = document.sources.filter(
    (source) => source.kind === "pdf" && source.sha256 === input.expectedSha256
  );
  if (matches.length !== 1) {
    throw new Error("Review seed must contain exactly one matching primary PDF source");
  }
  const previousSourceId = matches[0].id;
  document.sources = document.sources.map((source) =>
    source.id === previousSourceId
      ? {
          ...source,
          id: input.sourceAsset.id,
          name: input.sourceAsset.fileName,
          mimeType: input.sourceAsset.mimeType,
          sha256: input.sourceAsset.sha256,
        }
      : source
  );
  for (const floor of document.floors) {
    for (const calibration of floor.calibrations) {
      if (calibration.sourceId === previousSourceId) calibration.sourceId = input.sourceAsset.id;
    }
  }
  for (const provenance of entityProvenances(document)) {
    for (const evidence of provenance.evidence) {
      if (evidence.sourceId === previousSourceId) evidence.sourceId = input.sourceAsset.id;
    }
  }
  return document;
}

export function rewritePingYiCourtOfficialBrochureForReview(input: {
  document: FloorPlanDocumentV2;
  expectedSha256: string;
  sourceAsset: PingYiCourtReviewSeedSupplementarySourceAsset;
}): FloorPlanDocumentV2 {
  const document = structuredClone(input.document);
  const matches = document.sources.filter(
    (source) => source.kind === "pdf" && source.sha256 === input.expectedSha256
  );
  if (matches.length !== 1) {
    throw new Error("Review seed must contain exactly one matching official brochure source");
  }
  const previousSourceId = matches[0].id;
  if (
    document.floors.some((floor) =>
      floor.calibrations.some((calibration) => calibration.sourceId === previousSourceId)
    ) ||
    entityProvenances(document).some((provenance) =>
      provenance.evidence.some((evidence) => evidence.sourceId === previousSourceId)
    )
  ) {
    throw new Error("Official brochure cannot be used as the geometry extraction authority");
  }
  document.sources = document.sources.map((source) =>
    source.id === previousSourceId
      ? {
          ...source,
          id: input.sourceAsset.id,
          name: input.sourceAsset.fileName,
          mimeType: input.sourceAsset.mimeType,
          sha256: input.sourceAsset.sha256,
          pageCount: input.sourceAsset.pageCount,
          uri: undefined,
        }
      : source
  );
  return document;
}

export function preparePingYiCourtReviewSeedApplication(input: {
  bundle: PingYiCourtReviewSeedBundleV2;
  jobId: string;
  layoutId: string;
  sourceAsset: PingYiCourtReviewSeedSourceAsset;
  supplementarySourceAssets?: PingYiCourtReviewSeedSupplementarySourceAsset[];
  existingReviewIssues: FloorPlanReviewIssue[];
  existingSourceManifest: unknown;
  existingCorrectionLog: unknown;
  candidateVersion: number;
  actorAdmin: string;
  appliedAt: string;
}): PreparedPingYiCourtReviewSeedApplication {
  const fixture = input.bundle.fixtures.find((candidate) => candidate.layoutId === input.layoutId);
  if (!fixture) throw new Error("Unknown Ping Yi Court review seed layout");
  const jobId = input.jobId.trim();
  if (!jobId || jobId.length > 160) {
    throw new Error("A valid import job ID is required to materialize a review seed");
  }
  if (input.sourceAsset.sha256 !== input.bundle.source.sha256) {
    throw new Error("Uploaded source hash does not match the Ping Yi Court source manifest");
  }
  if (input.sourceAsset.mimeType !== "application/pdf") {
    throw new Error("Ping Yi Court review seeds require the original PDF source");
  }

  const reviewIssues = mergeReviewIssues(input.existingReviewIssues, fixture.reviewIssues);
  const criticalIssueIds = reviewIssues
    .filter((issue) => issue.severity === "critical" && !issue.resolved)
    .map((issue) => issue.id);
  let candidate = rewriteFloorPlanPrimarySourceForReview({
    document: fixture.document,
    expectedSha256: input.bundle.source.sha256,
    sourceAsset: input.sourceAsset,
  });
  const officialBrochureSources = (input.supplementarySourceAssets ?? []).filter(
    (source) =>
      source.mimeType === "application/pdf" &&
      !source.contentDeletedAt &&
      source.sha256 === input.bundle.officialBrochure.sha256
  );
  if (officialBrochureSources.length > 1) {
    throw new Error("Multiple durable official brochure sources match this review seed");
  }
  if (officialBrochureSources[0]) {
    candidate = rewritePingYiCourtOfficialBrochureForReview({
      document: candidate,
      expectedSha256: input.bundle.officialBrochure.sha256,
      sourceAsset: officialBrochureSources[0],
    });
  }
  candidate.revisionId = `floor-plan:${input.bundle.planId}:${fixture.layoutId}:import:${jobId}`;
  candidate.createdAt = input.appliedAt;
  delete candidate.parentRevisionId;
  candidate.verification = { tier: "needs_review", criticalIssueIds };
  const compiled = compileFloorPlanDocumentV2(candidate);
  if (compiled.verificationTier !== "needs_review" || criticalIssueIds.length === 0) {
    throw new Error("Review seed must retain unresolved critical review issues");
  }

  const nextVersion = input.candidateVersion + 1;
  const sourceConfigurationGroups = input.bundle.configurationGroups.filter((group) =>
    group.variants.some(
      (variant) => variant.artifact.revisionId === fixture.document.revisionId
    )
  );
  const evidence = {
    schemaVersion: input.bundle.schemaVersion,
    kind: "ping_yi_court_native_v2_review_seed",
    planId: input.bundle.planId,
    layoutId: fixture.layoutId,
    label: fixture.label,
    sourcePage: fixture.sourcePage,
    seedRevisionId: fixture.document.revisionId,
    materializedRevisionId: candidate.revisionId,
    geometryHash: compiled.geometryHash,
    generatedFrom: structuredClone(input.bundle.generatedFrom),
    verificationTier: "needs_review",
    publication: structuredClone(input.bundle.publication),
    primarySource: structuredClone(input.bundle.source),
    officialBrochure: structuredClone(input.bundle.officialBrochure),
    sourceEvidence: structuredClone(fixture.sourceEvidence),
    // These are immutable seed-revision references for reviewer provenance.
    // A public selector must publish its own approved revision relationship;
    // it must never treat an annotation polygon as an executable patch.
    sourceConfigurationGroups: structuredClone(sourceConfigurationGroups),
    stackBindings: structuredClone(input.bundle.stackBindings),
    appliedAt: input.appliedAt,
    appliedByAdmin: input.actorAdmin,
  };
  const correctionLog = Array.isArray(input.existingCorrectionLog)
    ? structuredClone(input.existingCorrectionLog)
    : input.existingCorrectionLog == null
      ? []
      : [structuredClone(input.existingCorrectionLog)];
  const candidateHash = hashCanonicalJson(candidate);
  correctionLog.push({
    at: input.appliedAt,
    actorAdmin: input.actorAdmin,
    action: "ping_yi_court_native_v2_review_seed_applied",
    layoutId: fixture.layoutId,
    seedRevisionId: fixture.document.revisionId,
    materializedRevisionId: candidate.revisionId,
    sourceSha256: input.sourceAsset.sha256,
    officialBrochureSourceAssetId: officialBrochureSources[0]?.id ?? null,
    geometryHash: compiled.geometryHash,
    candidateHash,
    candidateVersion: nextVersion,
    verificationTier: "needs_review",
  });

  return {
    candidate,
    candidateHash,
    geometryHash: compiled.geometryHash,
    reviewIssues,
    sourceManifest: appendSeedManifestEvidence({
      existing: input.existingSourceManifest,
      evidence,
    }),
    correctionLog,
  };
}
