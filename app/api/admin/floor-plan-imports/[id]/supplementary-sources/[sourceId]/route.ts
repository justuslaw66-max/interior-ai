import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import {
  attachFloorPlanSupplementarySource,
  isFloorPlanSupplementarySourceMimeType,
  parseSupplementaryRenderedPages,
  removeFloorPlanSupplementarySource,
} from "@/lib/floor-plan-imports/supplementary-sources";
import { compileCandidateFloorPlanDocumentV2 } from "@/lib/floor-plan-imports/validation";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 8 * 1024;
const REVIEWABLE_STATUSES = ["validating", "needs_review", "ready"] as const;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function readCandidateVersion(request: Request) {
  try {
    const bytes = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
    const body = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const candidateVersion = (body as Record<string, unknown>).candidateVersion;
    return Number.isSafeInteger(candidateVersion) && (candidateVersion as number) >= 0
      ? (candidateVersion as number)
      : null;
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) throw cause;
    return null;
  }
}

async function getAttachment(jobId: string, sourceId: string) {
  return prisma.floorPlanSupplementarySource.findFirst({
    where: { id: sourceId, jobId },
    select: {
      id: true,
      renderedPagesJson: true,
      attachedToCandidateAt: true,
      sourceAsset: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sha256: true,
          contentDeletedAt: true,
        },
      },
      job: {
        select: {
          id: true,
          status: true,
          leaseToken: true,
          candidateJson: true,
          candidateVersion: true,
          correctionLogJson: true,
          revision: { select: { id: true } },
          sourceAsset: { select: { id: true } },
        },
      },
    },
  });
}

function assertReviewable(
  attachment: NonNullable<Awaited<ReturnType<typeof getAttachment>>>,
  expectedCandidateVersion: number
) {
  if (attachment.job.revision) throw new Error("IMMUTABLE");
  if (attachment.job.leaseToken) throw new Error("WORKER_OWNED");
  if (
    !REVIEWABLE_STATUSES.includes(
      attachment.job.status as (typeof REVIEWABLE_STATUSES)[number]
    )
  ) {
    throw new Error("NOT_REVIEWABLE");
  }
  if (attachment.job.candidateVersion !== expectedCandidateVersion) {
    throw new Error("STALE_CANDIDATE");
  }
  if (attachment.sourceAsset.contentDeletedAt) throw new Error("SOURCE_DELETED");
}

function correctionLog(value: unknown) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  const { id, sourceId } = await params;
  let expectedCandidateVersion: number | null;
  try {
    expectedCandidateVersion = await readCandidateVersion(request);
  } catch {
    return error("Candidate attachment payload is too large", 413);
  }
  if (expectedCandidateVersion === null) {
    return error("candidateVersion is required", 400);
  }
  const attachment = await getAttachment(id, sourceId);
  if (!attachment) return error("Supplementary evidence not found", 404);

  try {
    assertReviewable(attachment, expectedCandidateVersion);
    if (!isFloorPlanSupplementarySourceMimeType(attachment.sourceAsset.mimeType)) {
      return error("Unsupported supplementary evidence type", 409);
    }
    const current = compileCandidateFloorPlanDocumentV2(
      attachment.job.candidateJson
    ).document;
    const next = attachFloorPlanSupplementarySource({
      document: current,
      primarySourceId: attachment.job.sourceAsset.id,
      attachment: {
        sourceAsset: {
          ...attachment.sourceAsset,
          mimeType: attachment.sourceAsset.mimeType,
        },
        renderedPages: parseSupplementaryRenderedPages(
          attachment.renderedPagesJson
        ),
      },
    });
    const attachedAt = new Date();
    const nextVersion = attachment.job.candidateVersion + 1;
    const log = correctionLog(attachment.job.correctionLogJson);
    log.push({
      at: attachedAt.toISOString(),
      actorAdmin: session?.user?.email ?? "local-admin",
      action: "supplementary_source_attached_to_candidate",
      sourceAssetId: attachment.sourceAsset.id,
      sourceSha256: attachment.sourceAsset.sha256,
      candidateHash: hashCanonicalJson(next),
      candidateVersion: nextVersion,
    });
    await prisma.$transaction(async (transaction) => {
      const updatedJob = await transaction.floorPlanImportJob.updateMany({
        where: {
          id,
          status: attachment.job.status,
          candidateVersion: attachment.job.candidateVersion,
          leaseToken: null,
          revision: { is: null },
        },
        data: {
          candidateJson: next as unknown as Prisma.InputJsonValue,
          correctionLogJson: log as Prisma.InputJsonValue,
          candidateVersion: nextVersion,
          sourceObservationManifestJson: Prisma.DbNull,
          sourceObservationVersion: { increment: 1 },
        },
      });
      const updatedSource = await transaction.floorPlanSupplementarySource.updateMany({
        where: {
          id: attachment.id,
          jobId: id,
          attachedToCandidateAt: attachment.attachedToCandidateAt,
        },
        data: {
          attachedToCandidateAt: attachedAt,
          attachedByEmail: session?.user?.email ?? "local-admin",
        },
      });
      if (updatedJob.count !== 1 || updatedSource.count !== 1) {
        throw new Error("ATTACHMENT_CONFLICT");
      }
    });
    return NextResponse.json({
      ok: true,
      sourceAssetId: attachment.sourceAsset.id,
      candidateVersion: nextVersion,
      attachedToCandidateAt: attachedAt.toISOString(),
    });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "IMMUTABLE") return error("Approved evidence is immutable", 409);
    if (code === "WORKER_OWNED") return error("Wait for the import worker to finish", 409);
    if (code === "NOT_REVIEWABLE") return error("This import is not reviewable", 409);
    if (code === "STALE_CANDIDATE" || code === "ATTACHMENT_CONFLICT") {
      return error("The candidate changed; reload before attaching evidence", 409);
    }
    if (code === "SOURCE_DELETED") return error("Evidence content has been deleted", 409);
    return error(
      cause instanceof Error ? cause.message : "Unable to attach evidence",
      400
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  const { id, sourceId } = await params;
  let expectedCandidateVersion: number | null;
  try {
    expectedCandidateVersion = await readCandidateVersion(request);
  } catch {
    return error("Evidence removal payload is too large", 413);
  }
  if (expectedCandidateVersion === null) return error("candidateVersion is required", 400);
  const attachment = await getAttachment(id, sourceId);
  if (!attachment) return error("Supplementary evidence not found", 404);

  try {
    assertReviewable(attachment, expectedCandidateVersion);
    const current = compileCandidateFloorPlanDocumentV2(
      attachment.job.candidateJson
    ).document;
    const next = removeFloorPlanSupplementarySource({
      document: current,
      primarySourceId: attachment.job.sourceAsset.id,
      sourceAssetId: attachment.sourceAsset.id,
    });
    const nextVersion = attachment.job.candidateVersion + 1;
    const removedAt = new Date();
    const log = correctionLog(attachment.job.correctionLogJson);
    log.push({
      at: removedAt.toISOString(),
      actorAdmin: session?.user?.email ?? "local-admin",
      action: "supplementary_source_removed",
      sourceAssetId: attachment.sourceAsset.id,
      sourceSha256: attachment.sourceAsset.sha256,
      candidateHash: hashCanonicalJson(next),
      candidateVersion: nextVersion,
    });
    const renderedAssetIds = parseSupplementaryRenderedPages(
      attachment.renderedPagesJson
    ).map((page) => page.assetKey);
    await prisma.$transaction(async (transaction) => {
      const updatedJob = await transaction.floorPlanImportJob.updateMany({
        where: {
          id,
          status: attachment.job.status,
          candidateVersion: attachment.job.candidateVersion,
          leaseToken: null,
          revision: { is: null },
        },
        data: {
          candidateJson: next as unknown as Prisma.InputJsonValue,
          correctionLogJson: log as Prisma.InputJsonValue,
          candidateVersion: nextVersion,
          sourceObservationManifestJson: Prisma.DbNull,
          sourceObservationVersion: { increment: 1 },
        },
      });
      if (updatedJob.count !== 1) throw new Error("ATTACHMENT_CONFLICT");
      await transaction.floorPlanDerivedAsset.deleteMany({
        where: { jobId: id, id: { in: renderedAssetIds } },
      });
      const removed = await transaction.floorPlanSupplementarySource.deleteMany({
        where: { id: attachment.id, jobId: id },
      });
      if (removed.count !== 1) throw new Error("ATTACHMENT_CONFLICT");
    });
    return NextResponse.json({ ok: true, candidateVersion: nextVersion });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code === "IMMUTABLE") return error("Approved evidence is immutable", 409);
    if (code === "WORKER_OWNED") return error("Wait for the import worker to finish", 409);
    if (code === "NOT_REVIEWABLE") return error("This import is not reviewable", 409);
    if (code === "STALE_CANDIDATE" || code === "ATTACHMENT_CONFLICT") {
      return error("The candidate changed; reload before removing evidence", 409);
    }
    if (code === "SOURCE_DELETED") return error("Evidence content has been deleted", 409);
    return error(
      cause instanceof Error ? cause.message : "Unable to remove evidence",
      400
    );
  }
}
