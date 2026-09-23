import { prisma } from "@/lib/prisma";
import {
  estimateFloorPlanImportProgress,
  type FloorPlanImportProgressEstimate,
  type FloorPlanProgressEstimateJob,
  type FloorPlanStageDurationSample,
} from "./progress-estimate";
import {
  floorPlanTimingProfileCacheKey,
  readFloorPlanTimingProfileCache,
  writeFloorPlanTimingProfileCache,
} from "./progress-timing-cache";
import type { FloorPlanImportStatus } from "./types";

const MAX_SAMPLES_PER_STAGE = 200;
const MAX_AUTOMATIC_STAGES = 6;

function pageCountMetric(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const pageCount = (value as Record<string, unknown>).pageCount;
  return typeof pageCount === "number" && Number.isFinite(pageCount)
    ? Math.max(1, Math.round(pageCount))
    : null;
}

async function loadTimingSamples(
  adapterId: string | null,
  extractionVersion: string | null
) {
  if (!adapterId || !extractionVersion) return [];
  const key = floorPlanTimingProfileCacheKey(adapterId, extractionVersion);
  const cached = readFloorPlanTimingProfileCache(key);
  if (cached) return cached;

  const rows = await prisma.floorPlanImportStageEvent.findMany({
    where: {
      adapterId,
      extractionVersion,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
      durationMs: { gte: 50, lte: 15 * 60_000 },
    },
    select: {
      fromStatus: true,
      durationMs: true,
      metricsJson: true,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_SAMPLES_PER_STAGE * MAX_AUTOMATIC_STAGES,
  });
  const counts = new Map<string, number>();
  const samples: FloorPlanStageDurationSample[] = [];
  for (const row of rows) {
    const status = row.fromStatus as FloorPlanImportStatus;
    const count = counts.get(status) ?? 0;
    if (count >= MAX_SAMPLES_PER_STAGE) continue;
    counts.set(status, count + 1);
    samples.push({
      fromStatus: status,
      durationMs: row.durationMs,
      pageCount: pageCountMetric(row.metricsJson),
    });
  }
  writeFloorPlanTimingProfileCache(key, samples);
  return samples;
}

export async function buildFloorPlanProgressEstimate(input: {
  job: FloorPlanProgressEstimateJob;
  adapterId: string | null;
  extractionVersion: string | null;
  now?: Date;
}): Promise<FloorPlanImportProgressEstimate> {
  let samples: FloorPlanStageDurationSample[] = [];
  try {
    samples = await loadTimingSamples(
      input.adapterId,
      input.extractionVersion
    );
  } catch (cause) {
    console.warn("Floor-plan timing profile could not be loaded", cause);
  }
  return estimateFloorPlanImportProgress({
    job: input.job,
    samples,
    now: input.now,
  });
}
