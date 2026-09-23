import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  FloorPlanImportProgressEstimate,
} from "./progress-estimate";
import type { FloorPlanImportStatus } from "./types";

const MAX_POSTGRES_INT = 2_147_483_647;
const recordedPredictions = new Map<string, number>();
const RECORD_CACHE_MS = 10 * 60_000;

function boundedInt(value: number) {
  return Math.max(
    0,
    Math.min(MAX_POSTGRES_INT, Math.round(value) || 0)
  );
}

function clearExpiredPredictionKeys(now: number) {
  for (const [key, expiresAt] of recordedPredictions) {
    if (expiresAt <= now) recordedPredictions.delete(key);
  }
}

export async function recordFloorPlanEtaPrediction(input: {
  jobId: string;
  status: FloorPlanImportStatus;
  adapterId: string | null;
  extractionVersion: string | null;
  estimate: FloorPlanImportProgressEstimate;
}) {
  const range = input.estimate.remainingRangeMs;
  if (
    !range ||
    !input.estimate.heartbeatHealthy ||
    !["working", "attention"].includes(input.estimate.activity)
  ) {
    return;
  }
  const now = Date.now();
  clearExpiredPredictionKeys(now);
  const cacheKey = `${input.jobId}:${input.status}`;
  if (recordedPredictions.has(cacheKey)) return;
  recordedPredictions.set(cacheKey, now + RECORD_CACHE_MS);
  try {
    await prisma.floorPlanImportEtaPrediction.create({
      data: {
        jobId: input.jobId,
        fromStatus: input.status,
        adapterId: input.adapterId,
        extractionVersion: input.extractionVersion,
        lowerMs: boundedInt(range.min),
        upperMs: boundedInt(range.max),
        confidence: input.estimate.confidence,
        sampleCount: boundedInt(input.estimate.sampleCount),
      },
    });
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return;
    }
    recordedPredictions.delete(cacheKey);
    throw cause;
  }
}

type EtaPredictionClient = {
  floorPlanImportEtaPrediction?: {
    findMany(args: unknown): Promise<Array<{ id: string; createdAt: Date }>>;
    update(args: unknown): Promise<unknown>;
  };
};

export async function completeFloorPlanEtaPredictions(
  client: unknown,
  input: {
    jobId: string;
    outcomeStatus: FloorPlanImportStatus;
    completedAt?: Date;
  }
) {
  const delegate = (client as EtaPredictionClient).floorPlanImportEtaPrediction;
  if (!delegate) return;
  const completedAt = input.completedAt ?? new Date();
  const predictions = await delegate.findMany({
    where: { jobId: input.jobId, completedAt: null },
    select: { id: true, createdAt: true },
  });
  await Promise.all(
    predictions.map((prediction) =>
      delegate.update({
        where: { id: prediction.id },
        data: {
          completedAt,
          outcomeStatus: input.outcomeStatus,
          actualRemainingMs: boundedInt(
            completedAt.getTime() - prediction.createdAt.getTime()
          ),
        },
      })
    )
  );
}
