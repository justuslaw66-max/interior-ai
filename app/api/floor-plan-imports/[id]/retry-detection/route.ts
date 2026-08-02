import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { takeSharedRateLimit } from "@/lib/shared-rate-limit";
import { PrismaFloorPlanImportJobRepository } from "@/lib/floor-plan-imports/prisma-repository";

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
  const allowance = rateLimit(
    `floor-plan-retry-detection:${userId}`,
    6,
    60_000
  );
  if (!allowance.ok) return error("Too many floor-plan retries", 429);
  try {
    const sharedAllowance = await takeSharedRateLimit(prisma, {
      scope: "floor-plan-retry-detection",
      subject: userId,
      limit: 6,
      windowMs: 60_000,
    });
    if (!sharedAllowance.ok) return error("Too many floor-plan retries", 429);
  } catch (cause) {
    console.error("Shared floor-plan retry rate limit failed", cause);
    return error("Floor-plan retry protection is temporarily unavailable", 503);
  }

  const now = new Date();
  const sourceJob = await prisma.floorPlanImportJob.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      sourceAssetId: true,
      trainingBenchmarkOptIn: true,
      trainingBenchmarkOptInAt: true,
      trainingBenchmarkConsentVersion: true,
      trainingBenchmarkRevokedAt: true,
      sourceRetentionExpiresAt: true,
      sourceDeletionRequestedAt: true,
      sourceAsset: {
        select: {
          contentDeletedAt: true,
        },
      },
    },
  });
  if (!sourceJob) return error("Floor-plan import not found", 404);
  if (!["needs_review", "failed"].includes(sourceJob.status)) {
    return error("Only paused or failed imports can be retried", 409);
  }
  if (
    sourceJob.sourceAsset.contentDeletedAt ||
    sourceJob.sourceDeletionRequestedAt ||
    sourceJob.sourceRetentionExpiresAt.getTime() <= now.getTime()
  ) {
    return error(
      "The private source is no longer available; upload the plan again",
      409
    );
  }

  const retry = await prisma.$transaction(async (transaction) => {
    const repository = new PrismaFloorPlanImportJobRepository(transaction);
    return repository.create({
      userId,
      sourceAssetId: sourceJob.sourceAssetId,
      privacy: {
        trainingBenchmarkOptIn: sourceJob.trainingBenchmarkOptIn,
        trainingBenchmarkOptInAt: sourceJob.trainingBenchmarkOptInAt,
        trainingBenchmarkConsentVersion:
          sourceJob.trainingBenchmarkConsentVersion,
        trainingBenchmarkRevokedAt: sourceJob.trainingBenchmarkRevokedAt,
        // Reusing retained bytes never extends their original retention window.
        sourceRetentionExpiresAt: sourceJob.sourceRetentionExpiresAt,
        sourceDeletionRequestedAt: null,
      },
    });
  });

  return NextResponse.json(
    {
      job: retry,
      retryOfJobId: sourceJob.id,
      next: {
        processUrl: `/api/floor-plan-imports/${retry.id}/process`,
        statusUrl: `/api/floor-plan-imports/${retry.id}`,
      },
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
