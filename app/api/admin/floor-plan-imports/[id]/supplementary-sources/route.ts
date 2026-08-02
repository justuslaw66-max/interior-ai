import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { createDefaultFloorPlanSourceAdapterRegistry } from "@/lib/floor-plan-imports/default-services";
import { floorPlanSourceRetentionDeadline } from "@/lib/floor-plan-imports/privacy";
import { PrismaFloorPlanSourceStore } from "@/lib/floor-plan-imports/prisma-store";
import type { FloorPlanSourceStore } from "@/lib/floor-plan-imports/source-adapter";
import {
  isFloorPlanSupplementarySourceMimeType,
} from "@/lib/floor-plan-imports/supplementary-sources";
import {
  MAX_FLOOR_PLAN_UPLOAD_BYTES,
  hasExpectedFloorPlanSignature,
  normalizeFloorPlanMimeType,
  sanitizeFloorPlanFileName,
} from "@/lib/floor-plan-imports/validation";
import { hashFloorPlanSource } from "@/lib/floor-plan-imports/json";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_MULTIPART_BYTES = MAX_FLOOR_PLAN_UPLOAD_BYTES + 1_000_000;
const REVIEWABLE_STATUSES = ["validating", "needs_review", "ready"] as const;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function rejectBeforeBodyRead(
  request: Request,
  message: string,
  status: number
) {
  await request.body?.cancel(`supplementary_source_rejected_${status}`).catch(() => undefined);
  return error(message, status);
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
    const bytes = Number(contentLength);
    if (!Number.isSafeInteger(bytes) || bytes > MAX_MULTIPART_BYTES) {
      return rejectBeforeBodyRead(request, "Evidence upload is larger than 25 MB", 413);
    }
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0]?.trim().toLowerCase() !== "multipart/form-data") {
    return rejectBeforeBodyRead(
      request,
      "Upload PDF, image, DXF, IFC, or supported DWG evidence as multipart form data",
      415
    );
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
  if (!(upload instanceof File)) return error("An evidence file is required", 400);
  if (upload.size <= 0) return error("The evidence file is empty", 400);
  if (upload.size > MAX_FLOOR_PLAN_UPLOAD_BYTES) {
    return error("Evidence upload is larger than 25 MB", 413);
  }
  const fileName = sanitizeFloorPlanFileName(upload.name);
  const mimeType = normalizeFloorPlanMimeType(fileName, upload.type);
  if (!mimeType || !isFloorPlanSupplementarySourceMimeType(mimeType)) {
    return error("Supplementary evidence must be PDF, PNG, JPEG, or WebP", 415);
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
      sourceRetentionExpiresAt: true,
      sourceDeletionRequestedAt: true,
      trainingBenchmarkOptIn: true,
      trainingBenchmarkOptInAt: true,
      trainingBenchmarkConsentVersion: true,
      trainingBenchmarkRevokedAt: true,
      sourceAsset: { select: { contentDeletedAt: true } },
      revision: { select: { id: true } },
      supplementarySources: {
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
    return error("Supplementary evidence can only be added during review", 409);
  }
  const sha256 = hashFloorPlanSource(bytes);
  if (job.supplementarySources.some((entry) => entry.sourceAsset.sha256 === sha256)) {
    return error("This evidence file is already attached to the import", 409);
  }

  const store = new PrismaFloorPlanSourceStore();
  const token = randomUUID();
  const derivativeStore: FloorPlanSourceStore = {
    putSource: (input) => store.putSource(input),
    readSource: (assetId) => store.readSource(assetId),
    putDerivative: (input) =>
      store.putDerivative({
        ...input,
        fileName: `supplementary-${token}-${input.fileName}`,
      }),
    readDerivative: (assetId) => store.readDerivative(assetId),
  };
  let storedSourceId: string | null = null;
  let renderedAssetIds: string[] = [];
  try {
    const stored = await store.putSource({
      ownerScope: `floor-plan-supplementary:${id}`,
      fileName,
      mimeType,
      bytes,
    });
    storedSourceId = stored.id;
    const adapter = createDefaultFloorPlanSourceAdapterRegistry().resolve(stored);
    const renderedPages = await adapter.render(
      { ...stored, bytes },
      {
        jobId: id,
        store: derivativeStore,
        privacy: {
          trainingBenchmarkOptIn: job.trainingBenchmarkOptIn,
          trainingBenchmarkOptInAt: job.trainingBenchmarkOptInAt,
          trainingBenchmarkConsentVersion: job.trainingBenchmarkConsentVersion,
          trainingBenchmarkRevokedAt: job.trainingBenchmarkRevokedAt,
          sourceRetentionExpiresAt: job.sourceRetentionExpiresAt,
          sourceDeletionRequestedAt: job.sourceDeletionRequestedAt,
        },
      }
    );
    renderedAssetIds = renderedPages.map((page) => page.assetKey);
    const retentionExpiresAt = new Date(
      Math.max(
        job.sourceRetentionExpiresAt.getTime(),
        floorPlanSourceRetentionDeadline().getTime()
      )
    );
    const attachment = await prisma.$transaction(async (transaction) => {
      const guarded = await transaction.floorPlanImportJob.updateMany({
        where: {
          id,
          status: job.status,
          leaseToken: null,
          sourceDeletionRequestedAt: null,
          revision: { is: null },
          sourceAsset: { is: { contentDeletedAt: null } },
        },
        data: { sourceRetentionExpiresAt: retentionExpiresAt },
      });
      if (guarded.count !== 1) throw new Error("ATTACHMENT_CONFLICT");
      return transaction.floorPlanSupplementarySource.create({
        data: {
          jobId: id,
          sourceAssetId: stored.id,
          renderedPagesJson: renderedPages,
          uploadedByEmail: session?.user?.email ?? "local-admin",
        },
        select: { id: true, createdAt: true },
      });
    });
    return NextResponse.json(
      {
        source: {
          id: attachment.id,
          sourceAssetId: stored.id,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          byteLength: stored.byteLength,
          sha256: stored.sha256,
          pageCount: renderedPages.length,
          attachedToCandidate: false,
          createdAt: attachment.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (cause) {
    if (renderedAssetIds.length) {
      await prisma.floorPlanDerivedAsset
        .deleteMany({ where: { jobId: id, id: { in: renderedAssetIds } } })
        .catch(() => undefined);
    }
    if (storedSourceId) {
      await prisma.floorPlanSourceAsset
        .deleteMany({
          where: {
            id: storedSourceId,
            importJobs: { none: {} },
            supplementaryUses: { none: {} },
            constructionUses: { none: {} },
          },
        })
        .catch(() => undefined);
    }
    if (cause instanceof Error && cause.message === "ATTACHMENT_CONFLICT") {
      return error("The import changed; reload before attaching evidence", 409);
    }
    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "P2002"
    ) {
      return error("This evidence file is already attached to the import", 409);
    }
    console.error("Supplementary floor-plan evidence upload failed", cause);
    return error("Unable to render and attach the evidence source", 400);
  }
}
