import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { prisma } from "@/lib/prisma";
import { requireFloorPlanReviewer } from "@/lib/floor-plan-imports/publication-governance";
import {
  evaluateFloorPlanSourceObservationCompleteness,
  floorPlanSourceObservationSubmissionSchema,
  stampFloorPlanSourceObservationManifest,
} from "@/lib/floor-plan-imports/source-observation-manifest";
import {
  compileCandidateFloorPlanDocumentV2,
  parseRenderedPages,
} from "@/lib/floor-plan-imports/validation";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2 * 1024 * 1024 + 32 * 1024;
const REVIEWABLE_STATUSES = ["validating", "needs_review", "ready"];

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  let reviewerId: string;
  try {
    reviewerId = requireFloorPlanReviewer(session?.user?.email);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Reviewer role required", 403);
  }

  let payload: Record<string, unknown>;
  try {
    const bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return error("Invalid source observation payload", 400);
    }
    payload = parsed as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Source observation payload is too large", 413);
    }
    return error("Invalid source observation payload", 400);
  }

  const { id } = await params;
  const job = await prisma.floorPlanImportJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      leaseToken: true,
      candidateJson: true,
      candidateVersion: true,
      sourceObservationVersion: true,
      renderedPagesJson: true,
      correctionLogJson: true,
      revision: { select: { id: true } },
      sourceAsset: {
        select: { id: true, sha256: true, mimeType: true },
      },
    },
  });
  if (!job) return error("Floor-plan import not found", 404);
  if (job.revision) return error("Approved source observations are immutable", 409);
  if (job.leaseToken) return error("Wait for the import worker to finish", 409);
  if (!REVIEWABLE_STATUSES.includes(job.status)) {
    return error("This import is not reviewable", 409);
  }
  if (
    !Number.isSafeInteger(payload.candidateVersion) ||
    payload.candidateVersion !== job.candidateVersion ||
    !Number.isSafeInteger(payload.sourceObservationVersion) ||
    payload.sourceObservationVersion !== job.sourceObservationVersion
  ) {
    return error("The candidate or observation manifest changed; reload it", 409);
  }

  try {
    const submitted = floorPlanSourceObservationSubmissionSchema.parse(payload.manifest);
    const recordedAt = new Date().toISOString();
    const manifest = stampFloorPlanSourceObservationManifest({
      submitted,
      sourceAsset: job.sourceAsset,
      candidateVersion: job.candidateVersion,
      reviewerId,
      recordedAt,
    });
    const document = compileCandidateFloorPlanDocumentV2(job.candidateJson).document;
    const completeness = evaluateFloorPlanSourceObservationCompleteness({
      document,
      manifest,
      sourceAsset: job.sourceAsset,
      renderedPages: parseRenderedPages(job.renderedPagesJson),
    });
    const invalidSubmittedObservation = completeness.issues.find(
      (issue) =>
        ![
          "CANONICAL_CRITICAL_ENTITY_UNOBSERVED",
          "CANONICAL_VERTEX_UNACCOUNTED",
        ].includes(issue.code)
    );
    if (invalidSubmittedObservation) {
      return error(
        `${invalidSubmittedObservation.code}: ${invalidSubmittedObservation.message}`,
        400
      );
    }

    const nextObservationVersion = job.sourceObservationVersion + 1;
    const correctionLog = Array.isArray(job.correctionLogJson)
      ? structuredClone(job.correctionLogJson)
      : [];
    correctionLog.push({
      at: recordedAt,
      actorAdmin: reviewerId,
      action: "source_observation_manifest_recorded",
      candidateVersion: job.candidateVersion,
      sourceObservationVersion: nextObservationVersion,
      observationCount: manifest.observations.length,
      completenessPassed: completeness.passed,
    });
    const updated = await prisma.floorPlanImportJob.updateMany({
      where: {
        id,
        status: job.status,
        candidateVersion: job.candidateVersion,
        sourceObservationVersion: job.sourceObservationVersion,
        leaseToken: null,
        revision: { is: null },
      },
      data: {
        sourceObservationManifestJson: manifest as unknown as Prisma.InputJsonValue,
        sourceObservationVersion: nextObservationVersion,
        correctionLogJson: correctionLog as Prisma.InputJsonValue,
      },
    });
    if (updated.count !== 1) {
      return error("The candidate or observation manifest changed; reload it", 409);
    }
    return NextResponse.json({
      ok: true,
      sourceObservationVersion: nextObservationVersion,
      completeness,
    });
  } catch (cause) {
    return error(
      cause instanceof Error ? cause.message : "Invalid source observation manifest",
      400
    );
  }
}
