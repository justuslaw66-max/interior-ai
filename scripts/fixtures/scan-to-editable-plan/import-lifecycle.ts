import type { ConsumerFloorPlanImportJob } from "@/components/editor/floor-plan-import-ui-types";
import { calibratedScaleFixture } from "./scale-review";

export function lifecycleImportJob(id: string, status: ConsumerFloorPlanImportJob["status"] = "ready"): ConsumerFloorPlanImportJob {
  return { id, status, progress: status === "ready" ? 100 : 80, adapterId: "pdf-raster-hybrid", extractionVersion: "authored-lifecycle",
    statusChangedAt: null, lastAttemptAt: null, nextAttemptAt: null, leaseExpiresAt: null, heartbeatAt: null,
    renderedPagesJson: [1, 2].map((pageNumber) => ({ pageNumber, widthPx: 1000, heightPx: 800, assetKey: `page-${pageNumber}` })),
    candidateJson: status === "selecting_page" ? { kind: "floor_plan_deterministic_evidence_v2", selectedPageNumber: null,
      pageCandidates: [1, 2].map((pageNumber) => ({ pageNumber, rank: pageNumber, widthPx: 1000, heightPx: 800 })) } : calibratedScaleFixture(),
    reviewIssuesJson: [], candidateVersion: 7, errorMessage: status === "failed" ? "Authored recognition failure" : null,
    appliedDesignId: null, sourceRetentionExpiresAt: "2030-01-01T00:00:00Z", sourceDeletionRequestedAt: null, trainingBenchmarkOptIn: false,
    sourceAsset: { fileName: `${id}.png`, mimeType: "image/png", contentDeletedAt: null } };
}
