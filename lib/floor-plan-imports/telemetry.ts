import type { Prisma, PrismaClient } from "@prisma/client";
import {
  isFloorPlanMvpBlockingIssue,
  type FloorPlanImportStatus,
  type FloorPlanReviewIssue,
} from "./types";
import { invalidateFloorPlanTimingProfile } from "./progress-timing-cache";
import { completeFloorPlanEtaPredictions } from "./eta-calibration";

const MAX_METRICS = 40;
const MAX_METRIC_ABS = 1_000_000_000_000;
const MAX_POSTGRES_INT = 2_147_483_647;
const OPERATIONAL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/;

// Metric names are code-owned. Adding a metric requires review here so an
// adapter cannot encode a room label, address or filename in a dynamic key.
const APPROVED_STAGE_METRIC_KEYS = new Set([
  "pageCount",
  "vectorPageCount",
  "rasterLineworkPageCount",
  "candidatePlanPageCount",
  "visionAttempted",
  "visionSucceeded",
  "labelObservationCount",
  "roomBoundaryProposalCount",
  "dimensionObservationCount",
  "openingObservationCount",
  "geometrySnapRejectCount",
  "geometryInvalidProposalRejectCount",
  "geometryPlanRegionRejectCount",
  "geometryUnsupportedEdgeRejectCount",
  "geometryCornerRejectCount",
  "geometryPolygonRejectCount",
  "geometryLabelRejectCount",
  "geometryResidualRejectCount",
  "geometryMedianSourceDeviationPx",
  "geometryMaxSourceDeviationPx",
  "manualRepairCount",
  "scaleSolved",
  "scaleDimensionCount",
  "scaleResidualMm",
  "scaleSingleSegmentCandidateCount",
  "scaleCompoundSpanCandidateCount",
  "scaleUnsupportedSpanCount",
  "roomCount",
  "wallCount",
  "openingCount",
  "entityCount",
  "pathCount",
  "textCount",
  "parseFailed",
  // Retained for generic observer contract tests and future residual rollups.
  "residual",
]);

export type FloorPlanImportStageTelemetry = {
  jobId: string;
  adapterId: string | null;
  extractionVersion: string | null;
  from: FloorPlanImportStatus;
  to: FloorPlanImportStatus;
  durationMs: number;
  metrics?: Record<string, number | string | boolean | null>;
  reviewIssues: readonly FloorPlanReviewIssue[];
};

export interface FloorPlanImportTelemetryObserver {
  transition(event: FloorPlanImportStageTelemetry): Promise<void> | void;
}

export function safeFloorPlanStageMetrics(
  metrics: FloorPlanImportStageTelemetry["metrics"]
) {
  if (!metrics) return {};
  return Object.fromEntries(
    Object.entries(metrics)
      .filter(
        ([key, value]) =>
          APPROVED_STAGE_METRIC_KEYS.has(key) &&
          ((typeof value === "number" &&
            Number.isFinite(value) &&
            Math.abs(value) <= MAX_METRIC_ABS) ||
            typeof value === "boolean" ||
            value === null)
      )
      .slice(0, MAX_METRICS)
  ) as Record<string, number | boolean | null>;
}

function issueCounts(issues: readonly FloorPlanReviewIssue[]) {
  const bounded = (value: number) =>
    Math.max(0, Math.min(MAX_POSTGRES_INT, Math.trunc(value)));
  return {
    issueCount: bounded(issues.length),
    criticalIssueCount: bounded(issues.filter(isFloorPlanMvpBlockingIssue).length),
    warningIssueCount: bounded(issues.filter(
      (issue) => issue.severity === "warning" && !issue.resolved
    ).length),
  };
}

function operationalId(value: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  return OPERATIONAL_ID.test(normalized) ? normalized : null;
}

export function projectFloorPlanImportStageEvent(
  event: FloorPlanImportStageTelemetry
) {
  return {
    jobId: event.jobId,
    adapterId: operationalId(event.adapterId),
    extractionVersion: operationalId(event.extractionVersion),
    fromStatus: event.from,
    toStatus: event.to,
    durationMs: Math.max(
      0,
      Math.min(MAX_POSTGRES_INT, Math.round(event.durationMs) || 0)
    ),
    ...issueCounts(event.reviewIssues),
    metrics: safeFloorPlanStageMetrics(event.metrics),
  };
}

/**
 * Local operational telemetry only. It deliberately excludes user IDs,
 * filenames, source hashes, addresses, geometry, labels and review text.
 */
export function createFloorPlanImportTelemetryObserver(options: {
  log?: (message: string) => void;
} = {}): FloorPlanImportTelemetryObserver {
  return {
    transition(event) {
      const projected = projectFloorPlanImportStageEvent(event);
      (options.log ?? console.info)(
        JSON.stringify({
          event: "floor_plan_import_stage_transition",
          job_id: projected.jobId,
          adapter_id: projected.adapterId,
          extraction_version: projected.extractionVersion,
          from_status: projected.fromStatus,
          to_status: projected.toStatus,
          duration_ms: projected.durationMs,
          issue_count: projected.issueCount,
          critical_issue_count: projected.criticalIssueCount,
          warning_issue_count: projected.warningIssueCount,
          ...projected.metrics,
        })
      );
    },
  };
}

type StageEventClient = Pick<PrismaClient, "floorPlanImportStageEvent">;

/** Persists only the same bounded, content-free projection used by local logs. */
export function createPrismaFloorPlanImportTelemetryObserver(
  client: StageEventClient
): FloorPlanImportTelemetryObserver {
  return {
    async transition(event) {
      const projected = projectFloorPlanImportStageEvent(event);
      await client.floorPlanImportStageEvent.create({
        data: {
          jobId: projected.jobId,
          adapterId: projected.adapterId,
          extractionVersion: projected.extractionVersion,
          fromStatus: projected.fromStatus,
          toStatus: projected.toStatus,
          durationMs: projected.durationMs,
          issueCount: projected.issueCount,
          criticalIssueCount: projected.criticalIssueCount,
          warningIssueCount: projected.warningIssueCount,
          metricsJson: projected.metrics as Prisma.InputJsonValue,
        },
      });
      invalidateFloorPlanTimingProfile(
        projected.adapterId,
        projected.extractionVersion
      );
      if (
        ["selecting_page", "needs_review", "ready", "failed"].includes(
          projected.toStatus
        )
      ) {
        await completeFloorPlanEtaPredictions(client, {
          jobId: projected.jobId,
          outcomeStatus: projected.toStatus,
        });
      }
    },
  };
}

/**
 * Fan-out is best-effort per observer. A database or logger outage must never
 * fail, retry, or roll back a successfully committed import stage.
 */
export function composeFloorPlanImportTelemetryObservers(
  observers: readonly FloorPlanImportTelemetryObserver[],
  options: { onError?: (cause: unknown) => void } = {}
): FloorPlanImportTelemetryObserver {
  return {
    async transition(event) {
      await Promise.all(
        observers.map(async (observer) => {
          try {
            await observer.transition(event);
          } catch (cause) {
            try {
              options.onError?.(cause);
            } catch {
              // Telemetry error reporting is itself non-critical.
            }
          }
        })
      );
    },
  };
}
