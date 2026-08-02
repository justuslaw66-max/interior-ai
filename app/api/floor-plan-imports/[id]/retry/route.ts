import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { FloorPlanObjectStorageError } from "@/lib/floor-plan-imports/object-storage";
import { PrismaFloorPlanImportJobRepository } from "@/lib/floor-plan-imports/prisma-repository";
import { PrismaFloorPlanSourceStore } from "@/lib/floor-plan-imports/prisma-store";

export const runtime = "nodejs";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const { id } = await params;
  const allowance = rateLimit(`floor-plan-retry:${userId}`, 6, 60_000);
  if (!allowance.ok) return error("Too many floor-plan retry requests", 429);

  const failed = await prisma.floorPlanImportJob.findFirst({
    where: {
      id,
      userId,
      status: "failed",
      appliedDesignId: null,
      revision: null,
      sourceAsset: {
        contentDeletedAt: null,
        OR: [
          { bytes: { not: null } },
          { storageProvider: "external" },
        ],
      },
    },
    select: {
      sourceAssetId: true,
      sourceRetentionExpiresAt: true,
      sourceDeletionRequestedAt: true,
      trainingBenchmarkOptIn: true,
      trainingBenchmarkOptInAt: true,
      trainingBenchmarkConsentVersion: true,
      trainingBenchmarkRevokedAt: true,
      sourceAsset: {
        select: {
          storageProvider: true,
          storageKey: true,
        },
      },
    },
  });
  if (!failed) return error("This floor-plan import cannot be retried", 409);
  if (
    failed.sourceDeletionRequestedAt ||
    failed.sourceRetentionExpiresAt.getTime() <= Date.now()
  ) {
    return error("The private source retention period has ended; upload the plan again", 410);
  }
  if (
    failed.sourceAsset.storageProvider === "external" &&
    !failed.sourceAsset.storageKey.trim()
  ) {
    return error("This floor-plan import cannot be retried", 409);
  }

  // Confirm the authorized source can still be read and passes its persisted
  // byte-length/SHA-256 checks before creating another job that would fail.
  try {
    const source = await new PrismaFloorPlanSourceStore().readSource(
      failed.sourceAssetId
    );
    if (!source) return error("This floor-plan import cannot be retried", 409);
  } catch (cause) {
    if (cause instanceof FloorPlanObjectStorageError) {
      return error("The private source is temporarily unavailable; retry later", 503);
    }
    throw cause;
  }

  const repository = new PrismaFloorPlanImportJobRepository();
  const job = await repository.create({
    userId,
    sourceAssetId: failed.sourceAssetId,
    privacy: {
      trainingBenchmarkOptIn: failed.trainingBenchmarkOptIn,
      trainingBenchmarkOptInAt: failed.trainingBenchmarkOptInAt,
      trainingBenchmarkConsentVersion: failed.trainingBenchmarkConsentVersion,
      trainingBenchmarkRevokedAt: failed.trainingBenchmarkRevokedAt,
      sourceRetentionExpiresAt: failed.sourceRetentionExpiresAt,
      sourceDeletionRequestedAt: null,
    },
  });

  return NextResponse.json(
    {
      job: { id: job.id, status: job.status, progress: job.progress },
      next: {
        processUrl: `/api/floor-plan-imports/${job.id}/process`,
        statusUrl: `/api/floor-plan-imports/${job.id}`,
      },
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
