import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { removeFloorPlanConstructionSource } from "@/lib/floor-plan-imports/construction-sources";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { enqueueFloorPlanExternalDeletion } from "@/lib/floor-plan-imports/retention-outbox";
import {
  compileCandidateFloorPlanDocumentV2,
  parseRenderedPages,
} from "@/lib/floor-plan-imports/validation";
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
    const value = (body as Record<string, unknown>).candidateVersion;
    return Number.isSafeInteger(value) && (value as number) >= 0
      ? (value as number)
      : null;
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) throw cause;
    return null;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  const { id, sourceId } = await params;
  let candidateVersion: number | null;
  try {
    candidateVersion = await readCandidateVersion(request);
  } catch {
    return error("Evidence removal payload is too large", 413);
  }
  if (candidateVersion === null) return error("candidateVersion is required", 400);
  const attachment = await prisma.floorPlanConstructionSource.findFirst({
    where: { id: sourceId, jobId: id },
    select: {
      id: true,
      renderedPagesJson: true,
      sourceAsset: {
        select: {
          id: true,
          sha256: true,
          storageProvider: true,
          storageKey: true,
          contentDeletedAt: true,
        },
      },
      job: {
        select: {
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
  if (!attachment) return error("Construction evidence not found", 404);
  if (attachment.job.revision) return error("Approved evidence is immutable", 409);
  if (attachment.job.leaseToken) return error("Wait for the import worker to finish", 409);
  if (
    !REVIEWABLE_STATUSES.includes(
      attachment.job.status as (typeof REVIEWABLE_STATUSES)[number]
    )
  ) {
    return error("This import is not reviewable", 409);
  }
  if (attachment.job.candidateVersion !== candidateVersion) {
    return error("The candidate changed; reload before removing evidence", 409);
  }
  if (attachment.sourceAsset.contentDeletedAt) {
    return error("Evidence content has been deleted", 409);
  }

  try {
    const current = compileCandidateFloorPlanDocumentV2(
      attachment.job.candidateJson
    ).document;
    const next = removeFloorPlanConstructionSource({
      document: current,
      primarySourceId: attachment.job.sourceAsset.id,
      sourceAssetId: attachment.sourceAsset.id,
    });
    compileCandidateFloorPlanDocumentV2(next);
    const nextVersion = attachment.job.candidateVersion + 1;
    const removedAt = new Date();
    const log = Array.isArray(attachment.job.correctionLogJson)
      ? structuredClone(attachment.job.correctionLogJson)
      : [];
    log.push({
      at: removedAt.toISOString(),
      actorAdmin: session?.user?.email ?? "local-admin",
      action: "construction_source_removed",
      sourceAssetId: attachment.sourceAsset.id,
      sourceSha256: attachment.sourceAsset.sha256,
      candidateHash: hashCanonicalJson(next),
      candidateVersion: nextVersion,
    });
    const renderedAssetIds =
      Array.isArray(attachment.renderedPagesJson) &&
      attachment.renderedPagesJson.length > 0
        ? parseRenderedPages(attachment.renderedPagesJson).map((page) => page.assetKey)
        : [];
    const renderedAssets = renderedAssetIds.length
      ? await prisma.floorPlanDerivedAsset.findMany({
          where: { jobId: id, id: { in: renderedAssetIds } },
          select: { id: true, storageProvider: true, storageKey: true },
        })
      : [];
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.floorPlanImportJob.updateMany({
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
      if (updated.count !== 1) throw new Error("ATTACHMENT_CONFLICT");
      const removed = await transaction.floorPlanConstructionSource.deleteMany({
        where: { id: attachment.id, jobId: id },
      });
      if (removed.count !== 1) throw new Error("ATTACHMENT_CONFLICT");
      const databaseDerivedIds = renderedAssets
        .filter((asset) => asset.storageProvider === "database")
        .map((asset) => asset.id);
      if (databaseDerivedIds.length) {
        await transaction.floorPlanDerivedAsset.deleteMany({
          where: { jobId: id, id: { in: databaseDerivedIds } },
        });
      }
      for (const asset of renderedAssets.filter(
        (entry) => entry.storageProvider === "external"
      )) {
        await enqueueFloorPlanExternalDeletion(transaction, {
          kind: "derived",
          assetId: asset.id,
          storageKey: asset.storageKey,
          reason: "owner_requested",
        });
      }
      if (attachment.sourceAsset.storageProvider === "external") {
        await enqueueFloorPlanExternalDeletion(transaction, {
          kind: "source",
          assetId: attachment.sourceAsset.id,
          storageKey: attachment.sourceAsset.storageKey,
          reason: "owner_requested",
        });
      } else {
        await transaction.floorPlanSourceAsset.deleteMany({
          where: {
            id: attachment.sourceAsset.id,
            importJobs: { none: {} },
            supplementaryUses: { none: {} },
            constructionUses: { none: {} },
          },
        });
      }
    });
    return NextResponse.json({ ok: true, candidateVersion: nextVersion });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "ATTACHMENT_CONFLICT") {
      return error("The candidate changed; reload before removing evidence", 409);
    }
    return error(cause instanceof Error ? cause.message : "Unable to remove evidence", 400);
  }
}
