import type { FloorPlanImportStatus } from "@/lib/floor-plan-imports/types";

export type ConsumerFloorPlanImportJob = {
  id: string;
  status: FloorPlanImportStatus;
  progress: number;
  adapterId: string | null;
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
