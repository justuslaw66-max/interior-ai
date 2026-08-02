import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import {
  assertFloorPlanConstructionSourceFormat,
  attachFloorPlanConstructionSource,
  isFloorPlanConstructionEvidenceKind,
} from "@/lib/floor-plan-imports/construction-sources";
import { createDefaultFloorPlanSourceAdapterRegistry } from "@/lib/floor-plan-imports/default-services";
import { hashCanonicalJson, hashFloorPlanSource } from "@/lib/floor-plan-imports/json";
import { floorPlanSourceRetentionDeadline } from "@/lib/floor-plan-imports/privacy";
import {
  PrismaFloorPlanSourceStore,
  type PreparedFloorPlanSourceWrite,
} from "@/lib/floor-plan-imports/prisma-store";
import type { FloorPlanSourceStore } from "@/lib/floor-plan-imports/source-adapter";
import type { FloorPlanRenderedPage } from "@/lib/floor-plan-imports/types";
import {
  compileCandidateFloorPlanDocumentV2,
  hasExpectedFloorPlanSignature,
  MAX_FLOOR_PLAN_UPLOAD_BYTES,
  normalizeFloorPlanMimeType,
  sanitizeFloorPlanFileName,
} from "@/lib/floor-plan-imports/validation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_MULTIPART_BYTES = MAX_FLOOR_PLAN_UPLOAD_BYTES + 1_000_000;
const REVIEWABLE_STATUSES = ["validating", "needs_review", "ready"] as const;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function rejectBeforeBodyRead(request: Request, message: string, status: number) {
  await request.body?.cancel(`construction_source_rejected_${status}`).catch(() => undefined);
  return error(message, status);
}

function correctionLog(value: unknown) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) {
    return rejectBeforeBodyRead(request, "Forbidden", 403);
  }
  const { id } = await params;
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    if (!/^\d+$/.test(contentLength.trim())) {
      return rejectBeforeBodyRead(request, "Invalid Content-Length header", 400);
    }
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length > MAX_MULTIPART_BYTES) {
      return rejectBeforeBodyRead(request, "Evidence upload is larger than 25 MB", 413);
    }
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0]?.trim().toLowerCase() !== "multipart/form-data") {
    return rejectBeforeBodyRead(request, "Use multipart form data", 415);
  }

  let formData: FormData;
  try {
    const body = await readBoundedRequestBody(request, MAX_MULTIPART_BYTES);
    const buffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(buffer).set(body);
    formData = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: buffer,
    }).formData();
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Evidence upload is larger than 25 MB", 413);
    }
    return error("Invalid multipart upload", 400);
  }

  const upload = formData.get("file");
  const rawEvidenceKind = formData.get("evidenceKind");
  const candidateVersionValue = formData.get("candidateVersion");
  if (!(upload instanceof File)) return error("An evidence file is required", 400);
  if (typeof rawEvidenceKind !== "string" || !isFloorPlanConstructionEvidenceKind(rawEvidenceKind)) {
    return error("evidenceKind must be unit_cad, as_built, or site_measurement", 400);
  }
  const candidateVersion =
    typeof candidateVersionValue === "string" && /^\d+$/.test(candidateVersionValue)
      ? Number(candidateVersionValue)
      : null;
  if (candidateVersion === null || !Number.isSafeInteger(candidateVersion)) {
    return error("candidateVersion is required", 400);
  }
  if (upload.size <= 0) return error("The evidence file is empty", 400);
  if (upload.size > MAX_FLOOR_PLAN_UPLOAD_BYTES) {
    return error("Evidence upload is larger than 25 MB", 413);
  }
  const fileName = sanitizeFloorPlanFileName(upload.name);
  const mimeType = normalizeFloorPlanMimeType(fileName, upload.type);
  if (!mimeType) return error("Unsupported construction evidence format", 415);
  try {
    assertFloorPlanConstructionSourceFormat(rawEvidenceKind, mimeType);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "Unsupported evidence role", 415);
  }
  const bytes = new Uint8Array(await upload.arrayBuffer());
  if (!hasExpectedFloorPlanSignature(bytes, mimeType)) {
    return error("The file contents do not match the selected evidence format", 400);
  }

  const job = await prisma.floorPlanImportJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      leaseToken: true,
      candidateJson: true,
      candidateVersion: true,
      correctionLogJson: true,
      sourceRetentionExpiresAt: true,
      sourceDeletionRequestedAt: true,
      trainingBenchmarkOptIn: true,
      trainingBenchmarkOptInAt: true,
      trainingBenchmarkConsentVersion: true,
      trainingBenchmarkRevokedAt: true,
      sourceAsset: { select: { id: true, contentDeletedAt: true } },
      revision: { select: { id: true } },
      constructionSources: {
        select: { sourceAsset: { select: { sha256: true } } },
      },
    },
  });
  if (!job) return error("Floor-plan import not found", 404);
  if (job.revision) return error("Approved evidence is immutable", 409);
  if (job.leaseToken) return error("Wait for the import worker to finish", 409);
  if (job.sourceDeletionRequestedAt || job.sourceAsset.contentDeletedAt) {
    return error("The primary source has been deleted; create a new import", 409);
  }
  if (!REVIEWABLE_STATUSES.includes(job.status as (typeof REVIEWABLE_STATUSES)[number])) {
    return error("Construction evidence can only be added during review", 409);
  }
  if (job.candidateVersion !== candidateVersion) {
    return error("The candidate changed; reload before attaching evidence", 409);
  }
  const sha256 = hashFloorPlanSource(bytes);
  if (job.constructionSources.some((entry) => entry.sourceAsset.sha256 === sha256)) {
    return error("This construction evidence is already attached", 409);
  }

  const current = compileCandidateFloorPlanDocumentV2(job.candidateJson).document;
  const store = new PrismaFloorPlanSourceStore();
  const token = randomUUID();
  const derivativeStore: FloorPlanSourceStore = {
    putSource: (input) => store.putSource(input),
    readSource: (assetId) => store.readSource(assetId),
    putDerivative: (input) =>
      store.putDerivative({
        ...input,
        fileName: `construction-${token}-${input.fileName}`,
      }),
    readDerivative: (assetId) => store.readDerivative(assetId),
  };
  let preparedSource: PreparedFloorPlanSourceWrite;
  try {
    preparedSource = await store.prepareSource({
      ownerScope: `floor-plan-construction:${id}`,
      fileName,
      mimeType,
      bytes,
    });
  } catch (cause) {
    console.error("Construction floor-plan evidence staging failed", cause);
    return error("Unable to stage construction evidence", 500);
  }
  try {
    const attachedAt = new Date();
    const nextVersion = job.candidateVersion + 1;
    const retentionExpiresAt = new Date(
      Math.max(
        job.sourceRetentionExpiresAt.getTime(),
        floorPlanSourceRetentionDeadline().getTime()
      )
    );
    const committed = await prisma.$transaction(async (transaction) => {
      const stored = await preparedSource.persist(transaction);
      const next = attachFloorPlanConstructionSource({
        document: current,
        primarySourceId: job.sourceAsset.id,
        evidenceKind: rawEvidenceKind,
        sourceAsset: {
          id: stored.id,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sha256: stored.sha256,
        },
      });
      compileCandidateFloorPlanDocumentV2(next);
      const log = correctionLog(job.correctionLogJson);
      log.push({
        at: attachedAt.toISOString(),
        actorAdmin: session?.user?.email ?? "local-admin",
        action: "construction_source_authorized",
        evidenceKind: rawEvidenceKind,
        sourceAssetId: stored.id,
        sourceSha256: stored.sha256,
        candidateHash: hashCanonicalJson(next),
        candidateVersion: nextVersion,
      });
      const guarded = await transaction.floorPlanImportJob.updateMany({
        where: {
          id,
          status: job.status,
          candidateVersion: job.candidateVersion,
          leaseToken: null,
          sourceDeletionRequestedAt: null,
          revision: { is: null },
          sourceAsset: { is: { contentDeletedAt: null } },
        },
        data: {
          candidateJson: next as unknown as Prisma.InputJsonValue,
          correctionLogJson: log as Prisma.InputJsonValue,
          candidateVersion: nextVersion,
          sourceRetentionExpiresAt: retentionExpiresAt,
          sourceObservationManifestJson: Prisma.DbNull,
          sourceObservationVersion: { increment: 1 },
        },
      });
      if (guarded.count !== 1) throw new Error("ATTACHMENT_CONFLICT");
      const attachment = await transaction.floorPlanConstructionSource.create({
        data: {
          jobId: id,
          sourceAssetId: stored.id,
          evidenceKind: rawEvidenceKind,
          renderedPagesJson: [],
          authorizedAt: attachedAt,
          authorizedByEmail: session?.user?.email ?? "local-admin",
          attachedToCandidateAt: attachedAt,
        },
        select: { id: true, createdAt: true },
      });
      return { attachment, stored };
    });
    await preparedSource.finalize();

    let renderedPages: FloorPlanRenderedPage[] = [];
    let renderWarning: string | null = null;
    try {
      const adapter = createDefaultFloorPlanSourceAdapterRegistry().resolve(
        committed.stored
      );
      const pages = await adapter.render(
        { ...committed.stored, bytes },
        {
          jobId: id,
          store: derivativeStore,
          privacy: {
            trainingBenchmarkOptIn: job.trainingBenchmarkOptIn,
            trainingBenchmarkOptInAt: job.trainingBenchmarkOptInAt,
            trainingBenchmarkConsentVersion: job.trainingBenchmarkConsentVersion,
            trainingBenchmarkRevokedAt: job.trainingBenchmarkRevokedAt,
            sourceRetentionExpiresAt: retentionExpiresAt,
            sourceDeletionRequestedAt: job.sourceDeletionRequestedAt,
          },
        }
      );
      renderedPages = pages;
      await prisma.floorPlanConstructionSource.updateMany({
        where: {
          id: committed.attachment.id,
          jobId: id,
          sourceAssetId: committed.stored.id,
          attachedToCandidateAt: attachedAt,
        },
        data: { renderedPagesJson: pages },
      });
    } catch (cause) {
      renderWarning =
        cause instanceof Error
          ? `Evidence was attached, but its preview could not be rendered: ${cause.message}`
          : "Evidence was attached, but its preview could not be rendered.";
    }
    return NextResponse.json(
      {
        source: {
          id: committed.attachment.id,
          sourceAssetId: committed.stored.id,
          evidenceKind: rawEvidenceKind,
          fileName: committed.stored.fileName,
          mimeType: committed.stored.mimeType,
          byteLength: committed.stored.byteLength,
          sha256: committed.stored.sha256,
          pageCount: renderedPages.length,
          candidateVersion: nextVersion,
          authorizedAt: attachedAt.toISOString(),
          createdAt: committed.attachment.createdAt,
          renderWarning,
        },
      },
      { status: 201 }
    );
  } catch (cause) {
    await preparedSource.rollback(cause).catch(() => undefined);
    if (cause instanceof Error && cause.message === "ATTACHMENT_CONFLICT") {
      return error("The import changed; reload before attaching evidence", 409);
    }
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "P2002") {
      return error("This construction evidence is already attached", 409);
    }
    console.error("Construction floor-plan evidence upload failed", cause);
    return error(cause instanceof Error ? cause.message : "Unable to attach evidence", 400);
  }
}
