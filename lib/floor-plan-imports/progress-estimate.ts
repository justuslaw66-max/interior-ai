import { FLOOR_PLAN_IMPORT_PROGRESS } from "./status";
import type { FloorPlanImportStatus } from "./types";

export type FloorPlanImportProgressActivity =
  | "queued"
  | "working"
  | "retrying"
  | "awaiting_user"
  | "complete"
  | "failed"
  | "attention";

export type FloorPlanImportProgressConfidence = "low" | "medium" | "high";

export type FloorPlanImportProgressEstimate = {
  asOf: string;
  activity: FloorPlanImportProgressActivity;
  stageLabel: string;
  confirmedPercent: number;
  estimatedPercent: number;
  nextMilestonePercent: number;
  stageElapsedMs: number | null;
  remainingRangeMs: { min: number; max: number } | null;
  confidence: FloorPlanImportProgressConfidence | null;
  sampleCount: number;
  heartbeatHealthy: boolean;
  unusuallySlow: boolean;
  nextAttemptAt: string | null;
  pollAfterMs: number;
};

export type FloorPlanStageDurationSample = {
  fromStatus: FloorPlanImportStatus;
  durationMs: number;
  pageCount?: number | null;
};

export type FloorPlanProgressEstimateJob = {
  status: FloorPlanImportStatus;
  progress: number;
  statusChangedAt: Date | null;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  renderedPageCount: number;
};

type StageRange = {
  min: number;
  max: number;
  sampleCount: number;
  confidence: FloorPlanImportProgressConfidence;
};

const POLL_AFTER_MS = 1_500;
const HEARTBEAT_STALE_MS = 75_000;
const MIN_SAMPLE_MS = 50;
const MAX_SAMPLE_MS = 15 * 60_000;

const AUTOMATIC_STAGES = [
  "received",
  "rendered",
  "extracted",
  "scale_solved",
  "topology_built",
  "validating",
] as const satisfies readonly FloorPlanImportStatus[];

const FALLBACK_RANGES: Record<(typeof AUTOMATIC_STAGES)[number], StageRange> = {
  received: { min: 1_000, max: 5_000, sampleCount: 0, confidence: "low" },
  rendered: { min: 75_000, max: 125_000, sampleCount: 0, confidence: "low" },
  extracted: { min: 90_000, max: 135_000, sampleCount: 0, confidence: "low" },
  scale_solved: { min: 3_000, max: 15_000, sampleCount: 0, confidence: "low" },
  topology_built: { min: 1_000, max: 5_000, sampleCount: 0, confidence: "low" },
  validating: { min: 1_000, max: 10_000, sampleCount: 0, confidence: "low" },
};

const NEXT_MILESTONE: Record<(typeof AUTOMATIC_STAGES)[number], number> = {
  received: FLOOR_PLAN_IMPORT_PROGRESS.rendered,
  rendered: FLOOR_PLAN_IMPORT_PROGRESS.extracted,
  extracted: FLOOR_PLAN_IMPORT_PROGRESS.scale_solved,
  scale_solved: FLOOR_PLAN_IMPORT_PROGRESS.topology_built,
  topology_built: FLOOR_PLAN_IMPORT_PROGRESS.validating,
  validating: FLOOR_PLAN_IMPORT_PROGRESS.ready,
};

export const FLOOR_PLAN_IMPORT_STAGE_LABELS: Record<
  FloorPlanImportStatus,
  string
> = {
  received: "Preparing the drawing",
  rendered: "Detecting walls, rooms, labels and openings",
  extracted: "Checking dimensions and scale",
  selecting_page: "Waiting for your page selection",
  scale_solved: "Building editable rooms and walls",
  topology_built: "Checking the editable plan",
  validating: "Checking the editable plan",
  needs_review: "Waiting for your review",
  ready: "Editable plan ready",
  applied: "Editable plan created",
  published: "Floor plan published",
  failed: "Floor-plan import stopped",
};

function percentile(values: readonly number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)
  );
  return sorted[index];
}

function pageBucket(pageCount: number | null | undefined) {
  if (!pageCount || pageCount <= 1) return "single";
  if (pageCount <= 5) return "small";
  return "large";
}

export function floorPlanStageRange(
  status: (typeof AUTOMATIC_STAGES)[number],
  samples: readonly FloorPlanStageDurationSample[],
  renderedPageCount = 0
): StageRange {
  const valid = samples.filter(
    (sample) =>
      sample.fromStatus === status &&
      Number.isFinite(sample.durationMs) &&
      sample.durationMs >= MIN_SAMPLE_MS &&
      sample.durationMs <= MAX_SAMPLE_MS
  );
  const matchingBucket = valid.filter(
    (sample) =>
      sample.pageCount != null &&
      pageBucket(sample.pageCount) === pageBucket(renderedPageCount)
  );
  const selected = matchingBucket.length >= 8 ? matchingBucket : valid;
  const durations = selected.map((sample) => sample.durationMs);
  const fallback = FALLBACK_RANGES[status];

  if (durations.length < 8) {
    if (!durations.length) return fallback;
    return {
      min: Math.min(fallback.min, percentile(durations, 0.4)),
      max: Math.max(fallback.max, percentile(durations, 0.9)),
      sampleCount: durations.length,
      confidence: "low",
    };
  }
  if (durations.length < 30) {
    return {
      min: percentile(durations, 0.4),
      max: percentile(durations, 0.9),
      sampleCount: durations.length,
      confidence: "medium",
    };
  }
  return {
    min: percentile(durations, 0.5),
    max: percentile(durations, 0.85),
    sampleCount: durations.length,
    confidence: "high",
  };
}

function stageStartedAt(job: FloorPlanProgressEstimateJob) {
  const candidates = [job.statusChangedAt, job.lastAttemptAt].filter(
    (value): value is Date => value instanceof Date
  );
  if (!candidates.length) return null;
  return new Date(Math.max(...candidates.map((value) => value.getTime())));
}

function lowestConfidence(
  ranges: readonly StageRange[]
): FloorPlanImportProgressConfidence {
  if (ranges.some((range) => range.confidence === "low")) return "low";
  if (ranges.some((range) => range.confidence === "medium")) return "medium";
  return "high";
}

function pausedEstimate(
  job: FloorPlanProgressEstimateJob,
  now: Date,
  activity: FloorPlanImportProgressActivity
): FloorPlanImportProgressEstimate {
  const confirmedPercent =
    job.status === "failed" ? 0 : FLOOR_PLAN_IMPORT_PROGRESS[job.status];
  return {
    asOf: now.toISOString(),
    activity,
    stageLabel: FLOOR_PLAN_IMPORT_STAGE_LABELS[job.status],
    confirmedPercent,
    estimatedPercent: confirmedPercent,
    nextMilestonePercent: confirmedPercent,
    stageElapsedMs: null,
    remainingRangeMs: null,
    confidence: null,
    sampleCount: 0,
    heartbeatHealthy: false,
    unusuallySlow: false,
    nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
    pollAfterMs: POLL_AFTER_MS,
  };
}

export function estimateFloorPlanImportProgress(input: {
  job: FloorPlanProgressEstimateJob;
  samples: readonly FloorPlanStageDurationSample[];
  now?: Date;
}): FloorPlanImportProgressEstimate {
  const now = input.now ?? new Date();
  const { job, samples } = input;

  if (job.status === "failed") return pausedEstimate(job, now, "failed");
  if (["ready", "applied", "published"].includes(job.status)) {
    return pausedEstimate(job, now, "complete");
  }
  if (job.status === "selecting_page" || job.status === "needs_review") {
    return pausedEstimate(job, now, "awaiting_user");
  }
  if (job.nextAttemptAt && job.nextAttemptAt.getTime() > now.getTime()) {
    return pausedEstimate(job, now, "retrying");
  }

  const automaticIndex = AUTOMATIC_STAGES.indexOf(
    job.status as (typeof AUTOMATIC_STAGES)[number]
  );
  if (automaticIndex < 0) return pausedEstimate(job, now, "attention");

  const leaseActive = Boolean(
    job.leaseExpiresAt && job.leaseExpiresAt.getTime() > now.getTime()
  );
  if (!leaseActive) return pausedEstimate(job, now, "queued");

  const heartbeatHealthy = Boolean(
    job.heartbeatAt &&
      now.getTime() - job.heartbeatAt.getTime() <= HEARTBEAT_STALE_MS
  );
  const currentStatus = AUTOMATIC_STAGES[automaticIndex];
  const currentRange = floorPlanStageRange(
    currentStatus,
    samples,
    job.renderedPageCount
  );
  const startedAt = stageStartedAt(job);
  const stageElapsedMs = startedAt
    ? Math.max(0, now.getTime() - startedAt.getTime())
    : null;
  const unusuallySlow =
    stageElapsedMs !== null && stageElapsedMs > currentRange.max;

  const confirmedPercent = Math.max(
    0,
    Math.min(99, FLOOR_PLAN_IMPORT_PROGRESS[job.status])
  );
  const nextMilestonePercent = NEXT_MILESTONE[currentStatus];
  const progressRatio =
    heartbeatHealthy && stageElapsedMs !== null
      ? Math.max(0, Math.min(0.95, stageElapsedMs / currentRange.max))
      : 0;
  const estimatedPercent = Math.min(
    nextMilestonePercent - 1,
    Math.max(
      confirmedPercent,
      Math.round(
        confirmedPercent +
          (nextMilestonePercent - confirmedPercent) * progressRatio
      )
    )
  );

  const futureRanges = AUTOMATIC_STAGES.slice(automaticIndex + 1).map(
    (status) => floorPlanStageRange(status, samples, job.renderedPageCount)
  );
  const elapsed = stageElapsedMs ?? 0;
  const currentRemaining = unusuallySlow
    ? {
        min: 30_000,
        max: Math.max(60_000, Math.round(currentRange.max * 0.5)),
      }
    : {
        min: Math.max(0, currentRange.min - elapsed),
        max: Math.max(0, currentRange.max - elapsed),
      };
  const remainingRangeMs = heartbeatHealthy
    ? {
        min:
          currentRemaining.min +
          futureRanges.reduce((total, range) => total + range.min, 0),
        max:
          currentRemaining.max +
          futureRanges.reduce((total, range) => total + range.max, 0),
      }
    : null;
  const allRanges = [currentRange, ...futureRanges];

  return {
    asOf: now.toISOString(),
    activity: heartbeatHealthy
      ? unusuallySlow
        ? "attention"
        : "working"
      : "attention",
    stageLabel: FLOOR_PLAN_IMPORT_STAGE_LABELS[job.status],
    confirmedPercent,
    estimatedPercent,
    nextMilestonePercent,
    stageElapsedMs,
    remainingRangeMs,
    confidence: lowestConfidence(allRanges),
    sampleCount: currentRange.sampleCount,
    heartbeatHealthy,
    unusuallySlow,
    nextAttemptAt: null,
    pollAfterMs: POLL_AFTER_MS,
  };
}

export function formatFloorPlanRemainingTime(
  range: FloorPlanImportProgressEstimate["remainingRangeMs"],
  confidence: FloorPlanImportProgressEstimate["confidence"]
) {
  if (!range) return null;
  if (range.max < 45_000) return "Less than a minute remaining";
  const lowerMinutes = Math.max(1, Math.round(range.min / 60_000));
  const upperMinutes = Math.max(lowerMinutes, Math.ceil(range.max / 60_000));
  if (lowerMinutes === upperMinutes && confidence !== "low") {
    return `About ${upperMinutes} min remaining`;
  }
  const widenedUpper =
    confidence === "low" && upperMinutes === lowerMinutes
      ? upperMinutes + 1
      : upperMinutes;
  return `About ${lowerMinutes}–${widenedUpper} min remaining`;
}
