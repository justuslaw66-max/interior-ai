import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { takeSharedRateLimit } from "@/lib/shared-rate-limit";
import { PrismaFloorPlanImportJobRepository } from "@/lib/floor-plan-imports/prisma-repository";
import {
  PrismaFloorPlanSourceStore,
  type PreparedFloorPlanSourceWrite,
} from "@/lib/floor-plan-imports/prisma-store";
import {
  MAX_FLOOR_PLAN_UPLOAD_BYTES,
  hasExpectedFloorPlanSignature,
  normalizeFloorPlanMimeType,
  sanitizeFloorPlanFileName,
} from "@/lib/floor-plan-imports/validation";
import {
  floorPlanImportPrivacyForUpload,
  parseFloorPlanTrainingBenchmarkOptIn,
  type FloorPlanImportPrivacy,
} from "@/lib/floor-plan-imports/privacy";
import {
  readBoundedJsonObject,
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";

export const runtime = "nodejs";
const MAX_FLOOR_PLAN_MULTIPART_BYTES =
  MAX_FLOOR_PLAN_UPLOAD_BYTES + 1_000_000;
const DEFAULT_IMPORT_LIST_LIMIT = 8;
const MAX_IMPORT_LIST_LIMIT = 20;
const MAX_BULK_HISTORY_DELETE_BODY_BYTES = 32 * 1024;
const MAX_SELECTED_HISTORY_DELETE_JOBS = 200;
const BULK_DELETE_CANCEL_STATUSES = [
  "received",
  "rendered",
  "extracted",
  "selecting_page",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
] as const;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function createFloorPlanImportFromPreparedSource(input: {
  preparedSource: PreparedFloorPlanSourceWrite;
  userId: string;
  privacy: FloorPlanImportPrivacy;
}) {
  return prisma.$transaction(async (transaction) => {
    const storedSource = await input.preparedSource.persist(transaction);
    const repository = new PrismaFloorPlanImportJobRepository(transaction);
    const createdJob = await repository.create({
      userId: input.userId,
      sourceAssetId: storedSource.id,
      privacy: input.privacy,
    });
    return { source: storedSource, job: createdJob };
  });
}

async function rejectBeforeBodyRead(
  request: Request,
  message: string,
  status: number
) {
  // Tell the runtime it can stop receiving an upload whenever a header/auth
  // decision rejects it before readBoundedRequestBody owns the stream.
  await request.body?.cancel(`floor_plan_upload_rejected_${status}`).catch(() => undefined);
  return error(message, status);
}

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? DEFAULT_IMPORT_LIST_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_IMPORT_LIST_LIMIT, Math.max(1, Math.floor(requestedLimit)))
    : DEFAULT_IMPORT_LIST_LIMIT;
  const cursor = url.searchParams.get("cursor")?.trim() || null;

  if (cursor) {
    const ownedCursor = await prisma.floorPlanImportJob.findFirst({
      where: { id: cursor, userId, historyDeletedAt: null },
      select: { id: true },
    });
    if (!ownedCursor) return error("Floor-plan import cursor not found", 400);
  }

  const rows = await prisma.floorPlanImportJob.findMany({
    where: { userId, historyDeletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
    select: {
      id: true,
      status: true,
      progress: true,
      adapterId: true,
      candidateVersion: true,
      errorMessage: true,
      appliedDesignId: true,
      nextAttemptAt: true,
      leaseExpiresAt: true,
      sourceRetentionExpiresAt: true,
      sourceDeletionRequestedAt: true,
      createdAt: true,
      updatedAt: true,
      sourceAsset: {
        select: {
          fileName: true,
          mimeType: true,
          contentDeletedAt: true,
        },
      },
    },
  });
  const hasMore = rows.length > limit;
  const jobs = rows.slice(0, limit);

  return NextResponse.json(
    {
      jobs,
      nextCursor: hasMore ? jobs.at(-1)?.id ?? null : null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return rejectBeforeBodyRead(request, "Unauthorized", 401);

  const allowance = rateLimit(`floor-plan-import:${userId}`, 6, 60_000);
  if (!allowance.ok) {
    return rejectBeforeBodyRead(request, "Too many floor-plan imports", 429);
  }
  try {
    const sharedAllowance = await takeSharedRateLimit(prisma, {
      scope: "floor-plan-import",
      subject: userId,
      limit: 6,
      windowMs: 60_000,
    });
    if (!sharedAllowance.ok) {
      return rejectBeforeBodyRead(request, "Too many floor-plan imports", 429);
    }
  } catch (cause) {
    console.error("Shared floor-plan import rate limit failed", cause);
    return rejectBeforeBodyRead(
      request,
      "Floor-plan import protection is temporarily unavailable",
      503
    );
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const normalizedContentLength = contentLengthHeader.trim();
    if (!/^\d+$/.test(normalizedContentLength)) {
      return rejectBeforeBodyRead(request, "Invalid Content-Length header", 400);
    }
    const contentLength = Number(normalizedContentLength);
    if (!Number.isSafeInteger(contentLength)) {
      return rejectBeforeBodyRead(
        request,
        "Floor-plan upload is larger than 25 MB",
        413
      );
    }
    if (contentLength > MAX_FLOOR_PLAN_MULTIPART_BYTES) {
      return rejectBeforeBodyRead(
        request,
        "Floor-plan upload is larger than 25 MB",
        413
      );
    }
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0]?.trim().toLowerCase() !== "multipart/form-data") {
    return rejectBeforeBodyRead(
      request,
      "Upload a PDF, image, DXF, IFC, or DWG file as multipart form data",
      415
    );
  }

  let formData: FormData;
  try {
    const boundedBody = await readBoundedRequestBody(
      request,
      MAX_FLOOR_PLAN_MULTIPART_BYTES
    );
    const multipartBody = new ArrayBuffer(boundedBody.byteLength);
    new Uint8Array(multipartBody).set(boundedBody);
    const boundedRequest = new Request(request.url, {
      method: "POST",
      // Only the multipart media type belongs to the buffered body. In
      // particular, never copy a forged Content-Length or Transfer-Encoding
      // header from the streaming request onto the reconstructed request.
      headers: { "content-type": contentType },
      body: multipartBody,
    });
    formData = await boundedRequest.formData();
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Floor-plan upload is larger than 25 MB", 413);
    }
    return error("Invalid multipart upload", 400);
  }
  const upload = formData.get("file");
  if (!(upload instanceof File)) {
    return error("A floor-plan file is required", 400);
  }
  if (upload.size <= 0) return error("The uploaded file is empty", 400);
  if (upload.size > MAX_FLOOR_PLAN_UPLOAD_BYTES) {
    return error("Floor-plan upload is larger than 25 MB", 413);
  }

  const fileName = sanitizeFloorPlanFileName(upload.name);
  const mimeType = normalizeFloorPlanMimeType(fileName, upload.type);
  if (!mimeType) {
    return error("Only PDF, PNG, JPEG, WebP, ASCII DXF, IFC STEP, and DWG floor plans are supported", 415);
  }

  const bytes = new Uint8Array(await upload.arrayBuffer());
  if (!hasExpectedFloorPlanSignature(bytes, mimeType)) {
    return error("The file contents do not match the selected floor-plan format", 400);
  }

  let trainingBenchmarkOptIn: boolean;
  try {
    trainingBenchmarkOptIn = parseFloorPlanTrainingBenchmarkOptIn(
      formData.get("trainingBenchmarkOptIn")
    );
  } catch (cause) {
    return error(
      cause instanceof Error ? cause.message : "Invalid privacy choice",
      400
    );
  }
  const privacy = floorPlanImportPrivacyForUpload({ trainingBenchmarkOptIn });

  try {
    const store = new PrismaFloorPlanSourceStore();
    // Object storage finishes before the database transaction begins. The
    // prepared persist callback below performs database work only.
    const preparedSource = await store.prepareSource({
      ownerScope: userId,
      fileName,
      mimeType,
      bytes,
    });
    let result: Awaited<
      ReturnType<typeof createFloorPlanImportFromPreparedSource>
    >;
    try {
      result = await createFloorPlanImportFromPreparedSource({
        preparedSource,
        userId,
        privacy,
      });
      await preparedSource.finalize();
    } catch (cause) {
      await preparedSource.rollback(cause);
      throw cause;
    }
    const { source, job } = result;

    return NextResponse.json(
      {
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress,
          source: {
            fileName: source.fileName,
            mimeType: source.mimeType,
            byteLength: source.byteLength,
            sha256: source.sha256,
          },
          privacy: {
            trainingBenchmarkOptIn:
              job.privacy.trainingBenchmarkOptIn,
            retentionExpiresAt:
              job.privacy.sourceRetentionExpiresAt.toISOString(),
          },
        },
        next: {
          processUrl: `/api/floor-plan-imports/${job.id}/process`,
          statusUrl: `/api/floor-plan-imports/${job.id}`,
        },
      },
      { status: 201 }
    );
  } catch (cause) {
    console.error("Floor-plan import creation failed", cause);
    return error("Unable to create the floor-plan import", 500);
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const allowance = rateLimit(
    `floor-plan-import-history-bulk-delete:${userId}`,
    10,
    60_000
  );
  if (!allowance.ok) {
    return error("Too many floor-plan import deletion requests", 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(
      request,
      MAX_BULK_HISTORY_DELETE_BODY_BYTES
    );
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) {
      return error("Too many floor-plan imports were selected", 413);
    }
    return error("Invalid bulk deletion request", 400);
  }

  const deleteAll = body.all === true;
  const selectedJobIds = Array.isArray(body.jobIds)
    ? [
        ...new Set(
          body.jobIds.filter(
            (value): value is string =>
              typeof value === "string" &&
              /^[a-z0-9_-]{8,160}$/i.test(value)
          )
        ),
      ]
    : [];
  if (deleteAll === (selectedJobIds.length > 0)) {
    return error("Choose selected imports or all imports", 400);
  }
  if (selectedJobIds.length > MAX_SELECTED_HISTORY_DELETE_JOBS) {
    return error(
      `Select no more than ${MAX_SELECTED_HISTORY_DELETE_JOBS} imports at once`,
      400
    );
  }

  const now = new Date();
  const rows = await prisma.floorPlanImportJob.findMany({
    where: {
      userId,
      historyDeletedAt: null,
      ...(deleteAll ? {} : { id: { in: selectedJobIds } }),
    },
    select: {
      id: true,
      status: true,
      leaseToken: true,
      leaseExpiresAt: true,
    },
  });
  const eligibleRows = rows.filter(
    (job) =>
      !job.leaseToken ||
      !job.leaseExpiresAt ||
      job.leaseExpiresAt.getTime() <= now.getTime()
  );
  const processableIds = eligibleRows
    .filter((job) =>
      (BULK_DELETE_CANCEL_STATUSES as readonly string[]).includes(job.status)
    )
    .map((job) => job.id);
  const completedIds = eligibleRows
    .filter(
      (job) =>
        !(BULK_DELETE_CANCEL_STATUSES as readonly string[]).includes(job.status)
    )
    .map((job) => job.id);

  const [cancelled, completed] = await prisma.$transaction([
    prisma.floorPlanImportJob.updateMany({
      where: {
        id: { in: processableIds },
        userId,
        historyDeletedAt: null,
        status: { in: [...BULK_DELETE_CANCEL_STATUSES] },
        OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: {
        historyDeletedAt: now,
        status: "failed",
        statusChangedAt: now,
        progress: 100,
        errorMessage: "Deleted by owner",
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    }),
    prisma.floorPlanImportJob.updateMany({
      where: {
        id: { in: completedIds },
        userId,
        historyDeletedAt: null,
        status: { notIn: [...BULK_DELETE_CANCEL_STATUSES] },
        OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: { historyDeletedAt: now },
    }),
  ]);
  const deletedCount = cancelled.count + completed.count;
  return NextResponse.json(
    {
      ok: true,
      scope: deleteAll ? "all" : "selected",
      requestedCount: deleteAll ? rows.length : selectedJobIds.length,
      matchedCount: rows.length,
      deletedCount,
      skippedBusyCount: rows.length - deletedCount,
      designPreserved: true,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
