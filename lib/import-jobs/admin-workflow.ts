import { prisma } from "@/lib/prisma";
import {
  getImportJobValidationBlockers,
  getPrimaryImportWorkflowQueue,
  type AdminImportWorkflowJob,
  type ImportWorkflowQueueKey,
} from "./admin-workflow-shared";

export {
  getImportJobValidationBlockers,
  getPrimaryImportWorkflowQueue,
  type AdminImportWorkflowJob,
  type ImportWorkflowQueueKey,
} from "./admin-workflow-shared";

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
