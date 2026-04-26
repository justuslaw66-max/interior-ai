import { prisma } from "@/lib/prisma";
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

export type ImportWorkflowQueue = {
  key: ImportWorkflowQueueKey;
  title: string;
  description: string;
  jobs: AdminImportWorkflowJob[];
};

export type ImportWorkflowBlockerJob = AdminImportWorkflowJob & {
  validationBlockers: string[];
};

export type AdminImportWorkflowData = {
  jobs: AdminImportWorkflowJob[];
  queues: ImportWorkflowQueue[];
  blockers: ImportWorkflowBlockerJob[];
  summary: {
    total: number;
    scrape: number;
    normalize: number;
    review: number;
    publish: number;
    blocked: number;
  };
};

type ImportJobRow = AdminImportWorkflowJob;

const QUEUE_META: Record<ImportWorkflowQueueKey, { title: string; description: string }> = {
  scrape: {
    title: "Scrape queue",
    description: "Fresh supplier files waiting for intake, source checks, and first-pass triage.",
  },
  normalize: {
    title: "Normalize queue",
    description: "Assets moving through normalization, optimization, metadata extraction, and mapping prep.",
  },
  review: {
    title: "Review queue",
    description: "Human QA review, preset validation, and authoring checks before approval.",
  },
  publish: {
    title: "Publish queue",
    description: "Approved imports ready to link, publish, or verify after launch.",
  },
};

const prismaCompat = prisma as unknown as {
  importJob: {
    findMany: (args: {
      orderBy: { updatedAt: "desc" };
      take: number;
      select: {
        id: true;
        status: true;
        workflowStage: true;
        workflowBlockers: true;
        nextAction: true;
        reviewNotes: true;
        dimensionsVerificationStatus: true;
        sourceBrand: true;
        sourceSku: true;
        sourceProductUrl: true;
        sourceFileName: true;
        errorMessage: true;
        rawMetadataJson: true;
        reportJson: true;
        normalizedAssetId: true;
        catalogItemId: true;
        createdAt: true;
        updatedAt: true;
      };
    }) => Promise<ImportJobRow[]>;
  };
};

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

export function getPrimaryImportWorkflowQueue(job: AdminImportWorkflowJob): ImportWorkflowQueueKey {
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

export async function getAdminImportWorkflowData(): Promise<AdminImportWorkflowData> {
  const jobs = await prismaCompat.importJob.findMany({
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: {
      id: true,
      status: true,
      workflowStage: true,
      workflowBlockers: true,
      nextAction: true,
      reviewNotes: true,
      dimensionsVerificationStatus: true,
      sourceBrand: true,
      sourceSku: true,
      sourceProductUrl: true,
      sourceFileName: true,
      errorMessage: true,
      rawMetadataJson: true,
      reportJson: true,
      normalizedAssetId: true,
      catalogItemId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const blockers = jobs
    .map((job) => ({ ...job, validationBlockers: getImportJobValidationBlockers(job) }))
    .filter((job) => job.validationBlockers.length > 0);

  const queues = (Object.keys(QUEUE_META) as ImportWorkflowQueueKey[]).map((key) => ({
    key,
    title: QUEUE_META[key].title,
    description: QUEUE_META[key].description,
    jobs: jobs.filter((job) => getPrimaryImportWorkflowQueue(job) === key),
  }));

  return {
    jobs,
    queues,
    blockers,
    summary: {
      total: jobs.length,
      scrape: queues.find((queue) => queue.key === "scrape")?.jobs.length ?? 0,
      normalize: queues.find((queue) => queue.key === "normalize")?.jobs.length ?? 0,
      review: queues.find((queue) => queue.key === "review")?.jobs.length ?? 0,
      publish: queues.find((queue) => queue.key === "publish")?.jobs.length ?? 0,
      blocked: blockers.length,
    },
  };
}
