import type {
  CatalogWorkflowStage,
  DimensionsVerificationStatus,
  ImportJobReport,
  ImportJobStatus,
} from "./types";

export type AdminImportWorkflowJob = {
  id: string;
  status: ImportJobStatus;
  workflowStage: CatalogWorkflowStage;
  workflowBlockers: string[];
  nextAction: string | null;
  reviewNotes: string | null;
  dimensionsVerificationStatus: DimensionsVerificationStatus | null;
  sourceBrand: string | null;
  sourceSku: string | null;
  sourceProductUrl: string | null;
  sourceFileName: string;
  errorMessage: string | null;
  rawMetadataJson: unknown;
  reportJson: unknown;
  normalizedAssetId: string | null;
  catalogItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ImportWorkflowQueueKey = "scrape" | "normalize" | "review" | "publish";

function parseImportReport(value: unknown): ImportJobReport {
  if (!value || typeof value !== "object") {
    return { warnings: [], blockers: [], metrics: {} };
  }

  const candidate = value as Partial<ImportJobReport>;
  return {
    warnings: Array.isArray(candidate.warnings)
      ? candidate.warnings.filter((entry): entry is string => typeof entry === "string")
      : [],
    blockers: Array.isArray(candidate.blockers)
      ? candidate.blockers.filter((entry): entry is string => typeof entry === "string")
      : [],
    metrics: candidate.metrics && typeof candidate.metrics === "object" ? candidate.metrics : {},
  };
}

export function getPrimaryImportWorkflowQueue(
  job: AdminImportWorkflowJob
): ImportWorkflowQueueKey {
  if (job.status === "received" || job.workflowStage === "intake") {
    return "scrape";
  }

  if (job.status === "needs_review" || job.workflowStage === "review") {
    return "review";
  }

  if (
    job.status === "approved" ||
    job.status === "published" ||
    job.workflowStage === "approved" ||
    job.workflowStage === "published"
  ) {
    return "publish";
  }

  return "normalize";
}

export function getImportJobValidationBlockers(job: AdminImportWorkflowJob): string[] {
  const report = parseImportReport(job.reportJson);
  const blockers = new Set<string>();

  for (const blocker of job.workflowBlockers) blockers.add(blocker);
  for (const blocker of report.blockers) blockers.add(blocker);

  if (job.errorMessage?.trim()) {
    blockers.add(job.errorMessage.trim());
  }

  if (job.status === "failed" && !job.errorMessage?.trim()) {
    blockers.add("Import job failed before completion.");
  }

  if (job.dimensionsVerificationStatus === "mismatch") {
    blockers.add("Supplier dimensions do not match extracted dimensions.");
  }
  if (job.dimensionsVerificationStatus === "missing_supplier") {
    blockers.add("Supplier dimensions are missing.");
  }
  if (job.dimensionsVerificationStatus === "missing_extracted") {
    blockers.add("Extracted dimensions are missing.");
  }

  if ((job.status === "approved" || job.status === "published") && !job.normalizedAssetId) {
    blockers.add("Normalized asset id is missing.");
  }

  if (job.status === "published" && !job.catalogItemId) {
    blockers.add("Catalog item link is missing for publish.");
  }

  return Array.from(blockers);
}