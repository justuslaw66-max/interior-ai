import { prisma } from "@/lib/prisma";
import { assertFloorPlanImportTransition, FLOOR_PLAN_IMPORT_PROGRESS } from "./status";
import type {
  FloorPlanImportLeaseGuard,
  FloorPlanImportJobPatch,
  FloorPlanImportJobRepository,
} from "./pipeline";
import type {
  FloorPlanImportJobRecord,
  FloorPlanImportStatus,
  FloorPlanRenderedPage,
  FloorPlanReviewIssue,
} from "./types";

type JobRow = {
  id: string;
  userId: string;
  sourceAssetId: string;
  status: string;
  adapterId: string | null;
  extractionVersion: string | null;
  renderedPagesJson: unknown;
  candidateJson: unknown;
  sourceManifestJson: unknown;
  reviewIssuesJson: unknown;
  progress: number;
  errorMessage: string | null;
  trainingBenchmarkOptIn: boolean;
  trainingBenchmarkOptInAt: Date | null;
  trainingBenchmarkConsentVersion: string | null;
  trainingBenchmarkRevokedAt: Date | null;
  sourceRetentionExpiresAt: Date;
  sourceDeletionRequestedAt: Date | null;
  attemptCount: number;
  retryCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lastErrorAt: Date | null;
  lastRecoveredAt: Date | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
};

type PrismaFloorPlanJobClient = {
  floorPlanImportJob: {
    create(args: unknown): Promise<JobRow>;
    findUnique(args: unknown): Promise<JobRow | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

function asClient(client: unknown): PrismaFloorPlanJobClient {
  return client as PrismaFloorPlanJobClient;
}

function recordArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function recordObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapJob(row: JobRow): FloorPlanImportJobRecord {
  return {
    id: row.id,
    userId: row.userId,
    sourceAssetId: row.sourceAssetId,
    status: row.status as FloorPlanImportStatus,
    adapterId: row.adapterId,
    extractionVersion: row.extractionVersion,
    renderedPages: recordArray<FloorPlanRenderedPage>(row.renderedPagesJson),
    candidate: recordObject(row.candidateJson),
    sourceManifest: recordObject(row.sourceManifestJson),
    reviewIssues: recordArray<FloorPlanReviewIssue>(row.reviewIssuesJson),
    progress: row.progress,
    errorMessage: row.errorMessage,
    privacy: {
      trainingBenchmarkOptIn: row.trainingBenchmarkOptIn,
      trainingBenchmarkOptInAt: row.trainingBenchmarkOptInAt,
      trainingBenchmarkConsentVersion: row.trainingBenchmarkConsentVersion,
      trainingBenchmarkRevokedAt: row.trainingBenchmarkRevokedAt,
      sourceRetentionExpiresAt: row.sourceRetentionExpiresAt,
      sourceDeletionRequestedAt: row.sourceDeletionRequestedAt,
    },
    attemptCount: row.attemptCount,
    retryCount: row.retryCount,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt,
    lastAttemptAt: row.lastAttemptAt,
    lastErrorAt: row.lastErrorAt,
    lastRecoveredAt: row.lastRecoveredAt,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
  };
}

function selectJobFields() {
  return {
    id: true,
    userId: true,
    sourceAssetId: true,
    status: true,
    adapterId: true,
    extractionVersion: true,
    renderedPagesJson: true,
    candidateJson: true,
    sourceManifestJson: true,
    reviewIssuesJson: true,
    progress: true,
    errorMessage: true,
    trainingBenchmarkOptIn: true,
    trainingBenchmarkOptInAt: true,
    trainingBenchmarkConsentVersion: true,
    trainingBenchmarkRevokedAt: true,
    sourceRetentionExpiresAt: true,
    sourceDeletionRequestedAt: true,
    attemptCount: true,
    retryCount: true,
    maxAttempts: true,
    nextAttemptAt: true,
    lastAttemptAt: true,
    lastErrorAt: true,
    lastRecoveredAt: true,
    leaseExpiresAt: true,
    heartbeatAt: true,
  };
}

export class PrismaFloorPlanImportJobRepository implements FloorPlanImportJobRepository {
  constructor(private readonly client: unknown = prisma) {}

  async create(input: {
    userId: string;
    sourceAssetId: string;
    privacy: import("./privacy").FloorPlanImportPrivacy;
  }) {
    const row = await asClient(this.client).floorPlanImportJob.create({
      data: {
        userId: input.userId,
        sourceAssetId: input.sourceAssetId,
        status: "received",
        progress: FLOOR_PLAN_IMPORT_PROGRESS.received,
        trainingBenchmarkOptIn: input.privacy.trainingBenchmarkOptIn,
        trainingBenchmarkOptInAt: input.privacy.trainingBenchmarkOptInAt,
        trainingBenchmarkConsentVersion:
          input.privacy.trainingBenchmarkConsentVersion,
        trainingBenchmarkRevokedAt: input.privacy.trainingBenchmarkRevokedAt,
        sourceRetentionExpiresAt: input.privacy.sourceRetentionExpiresAt,
        sourceDeletionRequestedAt: input.privacy.sourceDeletionRequestedAt,
      },
      select: selectJobFields(),
    });
    return mapJob(row);
  }

  async getById(id: string) {
    const row = await asClient(this.client).floorPlanImportJob.findUnique({
      where: { id },
      select: selectJobFields(),
    });
    return row ? mapJob(row) : null;
  }

  async transition(
    id: string,
    from: FloorPlanImportStatus,
    to: FloorPlanImportStatus,
    patch: FloorPlanImportJobPatch = {},
    lease?: FloorPlanImportLeaseGuard
  ) {
    assertFloorPlanImportTransition(from, to);
    const result = await asClient(this.client).floorPlanImportJob.updateMany({
      where: {
        id,
        status: from,
        ...(lease
          ? {
              leaseToken: lease.token,
              leaseOwner: lease.workerId,
              leaseExpiresAt: { gt: new Date() },
            }
          : {}),
      },
      data: {
        status: to,
        ...(patch.adapterId !== undefined ? { adapterId: patch.adapterId } : {}),
        ...(patch.extractionVersion !== undefined
          ? { extractionVersion: patch.extractionVersion }
          : {}),
        ...(patch.renderedPages !== undefined
          ? { renderedPagesJson: patch.renderedPages }
          : {}),
        ...(patch.candidate !== undefined ? { candidateJson: patch.candidate } : {}),
        ...(patch.sourceManifest !== undefined
          ? { sourceManifestJson: patch.sourceManifest }
          : {}),
        ...(patch.reviewIssues !== undefined
          ? { reviewIssuesJson: patch.reviewIssues }
          : {}),
        ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
        ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
      },
    });
    if (result.count !== 1) {
      throw new Error(`Floor-plan import ${id} changed while processing`);
    }
    const updated = await this.getById(id);
    if (!updated) throw new Error(`Floor-plan import ${id} disappeared while processing`);
    return updated;
  }
}
