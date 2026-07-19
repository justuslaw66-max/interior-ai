import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import {
  RequestBodyTooLargeError,
  readBoundedRequestBody,
} from "@/lib/bounded-request-body";
import {
  parseRenderedPages,
  parseReviewIssues,
} from "@/lib/floor-plan-imports/validation";
import {
  evaluatePingYiCourtReviewSeedEligibility,
  loadPingYiCourtV2ReviewSeedBundle,
  preparePingYiCourtReviewSeedApplication,
} from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_REVIEW_SEED_REQUEST_BYTES = 8 * 1024;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function findSeedableJob(id: string) {
  return prisma.floorPlanImportJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      candidateVersion: true,
      reviewIssuesJson: true,
      sourceManifestJson: true,
      correctionLogJson: true,
      leaseToken: true,
      revision: { select: { id: true } },
      sourceAsset: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sha256: true,
          contentDeletedAt: true,
        },
      },
      supplementarySources: {
        where: { attachedToCandidateAt: { not: null } },
        select: {
          renderedPagesJson: true,
          sourceAsset: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sha256: true,
              contentDeletedAt: true,
            },
          },
        },
      },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  const { id } = await params;
  const job = await findSeedableJob(id);
  if (!job) return error("Floor-plan import not found", 404);

  try {
    const bundle = loadPingYiCourtV2ReviewSeedBundle();
    const eligibility = evaluatePingYiCourtReviewSeedEligibility(
      {
        status: job.status,
        hasRevision: Boolean(job.revision),
        leaseToken: job.leaseToken,
        sourceAsset: job.sourceAsset,
      },
      bundle
    );
    return NextResponse.json(
      {
        ...eligibility,
        candidateVersion: job.candidateVersion,
        fixtures: eligibility.sourceMatches
          ? bundle.fixtures.map((fixture) => ({
              layoutId: fixture.layoutId,
              label: fixture.label,
              sourcePage: fixture.sourcePage,
              criticalIssueCount: fixture.document.verification.criticalIssueIds.length,
            }))
          : [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (cause) {
    console.error("Unable to load Ping Yi Court review seeds", cause);
    return error("Review seed configuration is unavailable", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  const { id } = await params;

  let body: unknown;
  try {
    const bytes = await readBoundedRequestBody(request, MAX_REVIEW_SEED_REQUEST_BYTES);
    body = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Review seed payload is too large", 413);
    }
    return error("Invalid review seed payload", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return error("Invalid review seed payload", 400);
  }
  const payload = body as Record<string, unknown>;
  const layoutId = typeof payload.layoutId === "string" ? payload.layoutId.trim() : "";
  const expectedCandidateVersion = payload.candidateVersion;
  if (
    !layoutId ||
    layoutId.length > 120 ||
    !Number.isSafeInteger(expectedCandidateVersion) ||
    (expectedCandidateVersion as number) < 0
  ) {
    return error("layoutId and candidateVersion are required", 400);
  }

  const current = await findSeedableJob(id);
  if (!current) return error("Floor-plan import not found", 404);

  let bundle: ReturnType<typeof loadPingYiCourtV2ReviewSeedBundle>;
  try {
    bundle = loadPingYiCourtV2ReviewSeedBundle();
  } catch (cause) {
    console.error("Unable to load Ping Yi Court review seeds", cause);
    return error("Review seed configuration is unavailable", 500);
  }
  const eligibility = evaluatePingYiCourtReviewSeedEligibility(
    {
      status: current.status,
      hasRevision: Boolean(current.revision),
      leaseToken: current.leaseToken,
      sourceAsset: current.sourceAsset,
    },
    bundle
  );
  if (!eligibility.eligible) return error(eligibility.reason ?? "Review seed is unavailable", 409);
  if (current.candidateVersion !== expectedCandidateVersion) {
    return error("The candidate changed; reload before applying a review seed", 409);
  }

  const nextVersion = current.candidateVersion + 1;
  let prepared: ReturnType<typeof preparePingYiCourtReviewSeedApplication>;
  try {
    prepared = preparePingYiCourtReviewSeedApplication({
      bundle,
      jobId: current.id,
      layoutId,
      sourceAsset: current.sourceAsset,
      supplementarySourceAssets: current.supplementarySources.map((source) => ({
        ...source.sourceAsset,
        pageCount: parseRenderedPages(source.renderedPagesJson).length,
      })),
      existingReviewIssues: parseReviewIssues(current.reviewIssuesJson),
      existingSourceManifest: current.sourceManifestJson,
      existingCorrectionLog: current.correctionLogJson,
      candidateVersion: current.candidateVersion,
      actorAdmin: session?.user?.email ?? "local-admin",
      appliedAt: new Date().toISOString(),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unable to apply review seed";
    return error(message, 400);
  }

  try {
    const updated = await prisma.floorPlanImportJob.updateMany({
      where: {
        id,
        status: current.status,
        candidateVersion: current.candidateVersion,
        leaseToken: null,
        revision: { is: null },
        sourceAsset: {
          is: {
            id: current.sourceAsset.id,
            mimeType: "application/pdf",
            sha256: bundle.source.sha256,
            contentDeletedAt: null,
          },
        },
      },
      data: {
        candidateJson: prepared.candidate as unknown as Prisma.InputJsonValue,
        reviewIssuesJson: prepared.reviewIssues as Prisma.InputJsonValue,
        sourceManifestJson: prepared.sourceManifest as Prisma.InputJsonValue,
        correctionLogJson: prepared.correctionLog as Prisma.InputJsonValue,
        candidateVersion: nextVersion,
        sourceObservationManifestJson: Prisma.DbNull,
        sourceObservationVersion: { increment: 1 },
        status: "needs_review",
        progress: 85,
        errorMessage: null,
      },
    });
    if (updated.count !== 1) {
      return error("The import changed; reload before applying a review seed", 409);
    }
    return NextResponse.json({
      ok: true,
      status: "needs_review",
      verificationTier: "needs_review",
      layoutId,
      candidateVersion: nextVersion,
      geometryHash: prepared.geometryHash,
    });
  } catch (cause) {
    console.error("Unable to persist Ping Yi Court review seed", cause);
    return error("Unable to persist the review seed", 500);
  }
}
