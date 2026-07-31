import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { takeFloorPlanCandidateMutationAllowance } from "@/lib/floor-plan-imports/candidate-mutation-rate-limit";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { FLOOR_PLAN_IMPORT_PROGRESS } from "@/lib/floor-plan-imports/status";
import { buildFloorPlanProgressEstimate } from "@/lib/floor-plan-imports/progress-estimate-server";
import { recordFloorPlanEtaPrediction } from "@/lib/floor-plan-imports/eta-calibration";
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
const MAX_FLOOR_PLAN_CANDIDATE_MUTATION_BODY_BYTES =
  MAX_FLOOR_PLAN_CANDIDATE_BYTES + 2 * 1024 * 1024;
const HISTORY_DELETE_CANCEL_STATUSES = new Set<string>([
  "received",
  "rendered",
  "extracted",
  "selecting_page",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
]);

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
    where: { id, userId: session.user.id, historyDeletedAt: null },
    select: {
      id: true,
      status: true,
      statusChangedAt: true,
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
  const progressEstimate = await buildFloorPlanProgressEstimate({
    job: {
      status: job.status,
      progress: job.progress,
      statusChangedAt: job.statusChangedAt,
      lastAttemptAt: job.lastAttemptAt,
      nextAttemptAt: job.nextAttemptAt,
      leaseExpiresAt: job.leaseExpiresAt,
      heartbeatAt: job.heartbeatAt,
      renderedPageCount: Array.isArray(job.renderedPagesJson)
        ? job.renderedPagesJson.length
        : 0,
    },
    adapterId: job.adapterId,
    extractionVersion: job.extractionVersion,
  });
  try {
    await recordFloorPlanEtaPrediction({
      jobId: job.id,
      status: job.status,
      adapterId: job.adapterId,
      extractionVersion: job.extractionVersion,
      estimate: progressEstimate,
    });
  } catch (cause) {
    console.warn("Floor-plan ETA calibration could not be recorded", cause);
  }
  return NextResponse.json(
    { job, progressEstimate },
    { headers: { "Cache-Control": "no-store" } }
  );
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
    where: { id, userId, historyDeletedAt: null },
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
        historyDeletedAt: null,
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
        statusChangedAt: new Date(),
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

/**
 * Removes a completed import from the consumer's history without touching an
 * already-created design. The durable import row remains as a privacy-safe
 * tombstone so source retention, deletion outbox work, and audit lineage can
 * finish independently.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const allowance = rateLimit(
    `floor-plan-import-history-delete:${userId}`,
    30,
    60_000
  );
  if (!allowance.ok) {
    return error("Too many floor-plan import deletion requests", 429);
  }
  const { id } = await params;
  const now = new Date();
  const owned = await prisma.floorPlanImportJob.findFirst({
    where: { id, userId, historyDeletedAt: null },
    select: {
      id: true,
      status: true,
      leaseToken: true,
      leaseExpiresAt: true,
    },
  });
  if (!owned) return error("Floor-plan import not found", 404);
  if (owned.leaseToken && owned.leaseExpiresAt && owned.leaseExpiresAt > now) {
    return error(
      "This import is still finishing its current processing step. Try deleting it again shortly.",
      409
    );
  }
  const cancelImport = HISTORY_DELETE_CANCEL_STATUSES.has(owned.status);
  const deleted = await prisma.floorPlanImportJob.updateMany({
    where: {
      id,
      userId,
      historyDeletedAt: null,
      status: owned.status,
      OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: {
      historyDeletedAt: now,
      ...(cancelImport
        ? {
            status: "failed" as const,
            statusChangedAt: now,
            progress: FLOOR_PLAN_IMPORT_PROGRESS.failed,
            errorMessage: "Deleted by owner",
            leaseToken: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
          }
        : {}),
    },
  });
  if (deleted.count !== 1) {
    return error("This floor-plan import changed; refresh and try again.", 409);
  }

  return NextResponse.json(
    {
      ok: true,
      deletedFromHistory: true,
      designPreserved: true,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
