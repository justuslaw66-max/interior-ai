import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { prisma } from "@/lib/prisma";
import { takeFloorPlanCandidateMutationAllowance } from "@/lib/floor-plan-imports/candidate-mutation-rate-limit";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { FLOOR_PLAN_IMPORT_PROGRESS } from "@/lib/floor-plan-imports/status";
import { applyConsumerFloorPlanCorrection } from "@/lib/floor-plan-imports/review";
import {
  compileCandidateFloorPlanDocumentV2,
  MAX_FLOOR_PLAN_CANDIDATE_BYTES,
  parseCandidate,
  parseReviewIssues,
} from "@/lib/floor-plan-imports/validation";

export const runtime = "nodejs";

// The canonical candidate remains independently capped at 5 MB. The request
// envelope leaves bounded room for review issues, optimistic versioning, and
// the correction note without permitting an unbounded JSON buffer.
export const MAX_FLOOR_PLAN_CANDIDATE_MUTATION_BODY_BYTES =
  MAX_FLOOR_PLAN_CANDIDATE_BYTES + 2 * 1024 * 1024;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function rejectBeforeBodyRead(
  request: Request,
  message: string,
  status: number
) {
  await request.body
    ?.cancel(`floor_plan_candidate_mutation_rejected_${status}`)
    .catch(() => undefined);
  return error(message, status);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return error("Unauthorized", 401);
  const { id } = await params;

  const job = await prisma.floorPlanImportJob.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      status: true,
      progress: true,
      adapterId: true,
      extractionVersion: true,
      renderedPagesJson: true,
      candidateJson: true,
      sourceManifestJson: true,
      reviewIssuesJson: true,
      candidateVersion: true,
      errorMessage: true,
      trainingBenchmarkOptIn: true,
      trainingBenchmarkOptInAt: true,
      trainingBenchmarkConsentVersion: true,
      trainingBenchmarkRevokedAt: true,
      sourceRetentionExpiresAt: true,
      sourceDeletionRequestedAt: true,
      attemptCount: true,
      retryCount: true,
      maxAttempts: true,
      nextAttemptAt: true,
      lastAttemptAt: true,
      lastErrorAt: true,
      lastRecoveredAt: true,
      leaseExpiresAt: true,
      heartbeatAt: true,
      appliedDesignId: true,
      createdAt: true,
      updatedAt: true,
      sourceAsset: {
        select: {
          fileName: true,
          mimeType: true,
          byteLength: true,
          sha256: true,
          contentDeletedAt: true,
          contentDeletionReason: true,
        },
      },
      revision: {
        select: {
          id: true,
          geometryHash: true,
          verificationTier: true,
          publicationStatus: true,
        },
      },
    },
  });
  if (!job) return error("Floor-plan import not found", 404);
  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return rejectBeforeBodyRead(request, "Unauthorized", 401);

  const allowance = await takeFloorPlanCandidateMutationAllowance(
    prisma,
    userId
  );
  if (allowance.outcome === "limited") {
    return rejectBeforeBodyRead(request, "Too many floor-plan corrections", 429);
  }
  if (allowance.outcome === "unavailable") {
    console.error(
      "Shared floor-plan candidate mutation rate limit failed",
      allowance.cause
    );
    return rejectBeforeBodyRead(
      request,
      "Floor-plan correction protection is temporarily unavailable",
      503
    );
  }
  const { id } = await params;
  const current = await prisma.floorPlanImportJob.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      candidateJson: true,
      candidateVersion: true,
      correctionLogJson: true,
      reviewIssuesJson: true,
      sourceAsset: { select: { id: true, sha256: true } },
    },
  });
  if (!current) return error("Floor-plan import not found", 404);
  if (current.status !== "needs_review") {
    return error("Only imports awaiting review can be corrected", 409);
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(
      request,
      MAX_FLOOR_PLAN_CANDIDATE_MUTATION_BODY_BYTES
    );
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Floor-plan correction payload is too large", 413);
    }
    return error("Invalid JSON payload", 400);
  }

  try {
    const candidate = parseCandidate(body.candidate);
    const submittedReviewIssues = parseReviewIssues(body.reviewIssues);
    const expectedVersion = body.candidateVersion;
    if (!Number.isInteger(expectedVersion) || expectedVersion !== current.candidateVersion) {
      return error("The candidate changed; reload before applying corrections", 409);
    }
    const correctionNote =
      typeof body.correctionNote === "string" ? body.correctionNote.trim().slice(0, 2_000) : "";
    const currentCompiled = compileCandidateFloorPlanDocumentV2(current.candidateJson);
    const nextCompiled = compileCandidateFloorPlanDocumentV2(candidate);
    const correction = applyConsumerFloorPlanCorrection({
      current: currentCompiled.document,
      next: nextCompiled.document,
      currentIssues: parseReviewIssues(current.reviewIssuesJson),
      submittedIssues: submittedReviewIssues,
      sourceId: current.sourceAsset.id,
      sourceSha256: current.sourceAsset.sha256,
      userId,
      note: correctionNote,
    });
    compileCandidateFloorPlanDocumentV2(correction.document);
    const correctionLog = Array.isArray(current.correctionLogJson)
      ? current.correctionLogJson
      : [];
    const previousHash = current.candidateJson
      ? hashCanonicalJson(current.candidateJson)
      : null;
    const nextVersion = current.candidateVersion + 1;
    const updated = await prisma.floorPlanImportJob.updateMany({
      where: {
        id,
        userId,
        status: "needs_review",
        candidateVersion: current.candidateVersion,
      },
      data: {
        candidateJson: correction.document as unknown as Prisma.InputJsonValue,
        reviewIssuesJson: correction.issues as Prisma.InputJsonValue,
        correctionLogJson: [
          ...correctionLog,
          {
            at: new Date().toISOString(),
            actorUserId: userId,
            note: correctionNote || null,
            previousHash,
            candidateHash: hashCanonicalJson(correction.document),
            candidateVersion: nextVersion,
          },
        ] as Prisma.InputJsonValue,
        candidateVersion: nextVersion,
        status: "validating",
        progress: FLOOR_PLAN_IMPORT_PROGRESS.validating,
        errorMessage: null,
      },
    });
    if (updated.count !== 1) {
      return error("The candidate changed; reload before applying corrections", 409);
    }
    return NextResponse.json({ ok: true, status: "validating", candidateVersion: nextVersion });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid candidate correction";
    return error(message, 400);
  }
}
