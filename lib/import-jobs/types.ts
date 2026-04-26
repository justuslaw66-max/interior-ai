export type ImportJobStatus =
  | "received"
  | "normalizing"
  | "optimized"
  | "preview_generated"
  | "metadata_extracted"
  | "needs_mapping"
  | "needs_review"
  | "approved"
  | "published"
  | "failed";

export type CatalogWorkflowStage =
  | "intake"
  | "enrichment"
  | "review"
  | "approved"
  | "published"
  | "blocked";

export type DimensionsVerificationStatus =
  | "pending"
  | "matched"
  | "mismatch"
  | "missing_supplier"
  | "missing_extracted";

export type ImportJobReport = {
  warnings: string[];
  blockers: string[];
  metrics: {
    fileSizeBytes?: number;
    triangleCount?: number;
    textureCount?: number;
    maxTextureSize?: number;
  };
};

export type ImportJobDerivativeUrls = {
  rawFileUrl?: string;
  normalizedFileUrl?: string;
  optimizedFileUrl?: string;
  thumbnailUrl?: string;
  metadataReportUrl?: string;
  qaReportUrl?: string;
};
