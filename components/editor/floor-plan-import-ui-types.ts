import type { FloorPlanImportStatus } from "@/lib/floor-plan-imports/types";

export type ConsumerFloorPlanImportProgressEstimate = {
  asOf: string;
  activity:
    | "queued"
    | "working"
    | "retrying"
    | "awaiting_user"
    | "complete"
    | "failed"
    | "attention";
  stageLabel: string;
  confirmedPercent: number;
  estimatedPercent: number;
  nextMilestonePercent: number;
  stageElapsedMs: number | null;
  remainingRangeMs: { min: number; max: number } | null;
  confidence: "low" | "medium" | "high" | null;
  sampleCount: number;
  heartbeatHealthy: boolean;
  unusuallySlow: boolean;
  nextAttemptAt: string | null;
  pollAfterMs: number;
};

export type ConsumerFloorPlanImportJob = {
  id: string;
  status: FloorPlanImportStatus;
  progress: number;
  adapterId: string | null;
  extractionVersion: string | null;
  statusChangedAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  progressEstimate?: ConsumerFloorPlanImportProgressEstimate;
  renderedPagesJson: Array<{
    pageNumber: number;
    widthPx: number;
    heightPx: number;
    assetKey: string;
  }>;
  candidateJson: unknown;
  reviewIssuesJson: unknown;
  candidateVersion: number;
  errorMessage: string | null;
  appliedDesignId: string | null;
  sourceRetentionExpiresAt: string;
  sourceDeletionRequestedAt: string | null;
  trainingBenchmarkOptIn: boolean;
  sourceAsset: {
    fileName?: string;
    mimeType?: string;
    contentDeletedAt: string | null;
    contentDeletionReason?: string | null;
  };
};

export type ConsumerFloorPlanImportSummary = Pick<
  ConsumerFloorPlanImportJob,
  | "id"
  | "status"
  | "progress"
  | "adapterId"
  | "candidateVersion"
  | "errorMessage"
  | "appliedDesignId"
  | "sourceRetentionExpiresAt"
  | "sourceDeletionRequestedAt"
  | "sourceAsset"
> & {
  nextAttemptAt: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};
