import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { FLOOR_PLAN_IMPORT_PROGRESS } from "./status";
import type { FloorPlanImportStatus } from "./types";

export const FLOOR_PLAN_PROCESSABLE_STATUSES = [
  "received",
  "rendered",
  "extracted",
  "scale_solved",
  "topology_built",
  "validating",
] as const satisfies readonly FloorPlanImportStatus[];

const processableStatuses = new Set<FloorPlanImportStatus>(
  FLOOR_PLAN_PROCESSABLE_STATUSES
);

export const DEFAULT_FLOOR_PLAN_LEASE_MS = 120_000;
export const DEFAULT_FLOOR_PLAN_HEARTBEAT_MS = 30_000;
const MIN_LEASE_MS = 15_000;
const MAX_LEASE_MS = 15 * 60_000;
const MAX_QUEUE_SCAN = 100;

export type FloorPlanImportLease = {
  jobId: string;
  token: string;
  workerId: string;
  expiresAt: Date;
  attemptNumber: number;
};

export type FloorPlanImportWorkerStatus = {
  id: string;
  userId: string;
  status: FloorPlanImportStatus;
  progress: number;
  attemptCount: number;
  retryCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lastErrorAt: Date | null;
  lastRecoveredAt: Date | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  errorMessage: string | null;
};

export type FloorPlanLeaseClaimResult =
  | {
      outcome: "claimed";
      lease: FloorPlanImportLease;
      job: FloorPlanImportWorkerStatus;
      recoveredExpiredLease: boolean;
    }
  | { outcome: "not_found" | "race_lost" }
  | {
      outcome: "already_processing" | "retry_scheduled" | "not_processable";
      job: FloorPlanImportWorkerStatus;
    }
  | { outcome: "attempts_exhausted"; job?: FloorPlanImportWorkerStatus };

export type FloorPlanLeaseFailureResult =
  | {
      outcome: "retry_scheduled" | "failed";
      job: FloorPlanImportWorkerStatus;
    }
  | { outcome: "lease_lost" };

type LeaseJobRow = {
  id: string;
  userId: string;
  status: string;
  progress: number;
  leaseToken: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  attemptCount: number;
  retryCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lastErrorAt: Date | null;
  lastRecoveredAt: Date | null;
  errorMessage: string | null;
};

type LeaseJobDelegate = {
  findUnique(args: unknown): Promise<LeaseJobRow | null>;
  findMany(args: unknown): Promise<LeaseJobRow[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

type LeaseTransactionClient = {
  floorPlanImportJob: LeaseJobDelegate;
};

type LeasePrismaClient = LeaseTransactionClient & {
  $transaction<T>(callback: (transaction: LeaseTransactionClient) => Promise<T>): Promise<T>;
};

function asClient(client: unknown): LeasePrismaClient {
  return client as LeasePrismaClient;
}

function leaseFields() {
  return {
    id: true,
    userId: true,
    status: true,
    progress: true,
    leaseToken: true,
    leaseOwner: true,
    leaseExpiresAt: true,
    heartbeatAt: true,
    attemptCount: true,
    retryCount: true,
    maxAttempts: true,
    nextAttemptAt: true,
    lastAttemptAt: true,
    lastErrorAt: true,
    lastRecoveredAt: true,
    errorMessage: true,
  };
}

function publicStatus(row: LeaseJobRow): FloorPlanImportWorkerStatus {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as FloorPlanImportStatus,
    progress: row.progress,
    attemptCount: row.attemptCount,
    retryCount: row.retryCount,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt,
    lastAttemptAt: row.lastAttemptAt,
    lastErrorAt: row.lastErrorAt,
    lastRecoveredAt: row.lastRecoveredAt,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
    errorMessage: row.errorMessage,
  };
}

function boundedLeaseMs(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_FLOOR_PLAN_LEASE_MS;
  return Math.min(MAX_LEASE_MS, Math.max(MIN_LEASE_MS, Math.round(value!)));
}

function retryDelayMs(retryCount: number) {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.min(6, Math.max(0, retryCount)));
}

function isActiveLease(row: LeaseJobRow, now: Date) {
  return Boolean(
    row.leaseToken && row.leaseExpiresAt && row.leaseExpiresAt.getTime() > now.getTime()
  );
}

function isExpiredLease(row: LeaseJobRow, now: Date) {
  return Boolean(
    row.leaseToken && (!row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= now.getTime())
  );
}

function leaseCasWhere(row: LeaseJobRow) {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    attemptCount: row.attemptCount,
    leaseToken: row.leaseToken,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    nextAttemptAt: row.nextAttemptAt,
  };
}

/**
 * Durable lease operations for import workers. Every state-changing method is
 * atomic and token guarded, so an expired worker can never commit over its
 * replacement worker.
 */
export class PrismaFloorPlanImportLeaseService {
  constructor(private readonly client: unknown = prisma) {}

  async claimById(input: {
    jobId: string;
    workerId: string;
    /** When present, a different owner is intentionally indistinguishable from a missing job. */
    ownerUserId?: string;
    leaseMs?: number;
    now?: Date;
  }): Promise<FloorPlanLeaseClaimResult> {
    const client = asClient(this.client);
    const now = input.now ?? new Date();
    const durationMs = boundedLeaseMs(input.leaseMs);
    const workerId = input.workerId.trim().slice(0, 160);
    if (!workerId) throw new Error("A floor-plan worker ID is required");

    return client.$transaction(async (transaction) => {
      const row = await transaction.floorPlanImportJob.findUnique({
        where: { id: input.jobId },
        select: leaseFields(),
      });
      if (!row || (input.ownerUserId && row.userId !== input.ownerUserId)) {
        return { outcome: "not_found" };
      }

      const status = row.status as FloorPlanImportStatus;
      if (!processableStatuses.has(status)) {
        return { outcome: "not_processable", job: publicStatus(row) };
      }
      if (isActiveLease(row, now)) {
        return { outcome: "already_processing", job: publicStatus(row) };
      }
      if (row.nextAttemptAt && row.nextAttemptAt.getTime() > now.getTime()) {
        return { outcome: "retry_scheduled", job: publicStatus(row) };
      }

      const recoveredExpiredLease = isExpiredLease(row, now);
      if (row.attemptCount >= row.maxAttempts) {
        const exhausted = await transaction.floorPlanImportJob.updateMany({
          where: leaseCasWhere(row),
          data: {
            status: "failed",
            progress: FLOOR_PLAN_IMPORT_PROGRESS.failed,
            leaseToken: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            lastErrorAt: now,
            ...(recoveredExpiredLease ? { lastRecoveredAt: now } : {}),
            errorMessage: `Floor-plan import exhausted ${row.maxAttempts} processing attempts`,
          },
        });
        if (exhausted.count !== 1) return { outcome: "race_lost" };
        const failed = await transaction.floorPlanImportJob.findUnique({
          where: { id: row.id },
          select: leaseFields(),
        });
        return {
          outcome: "attempts_exhausted",
          ...(failed ? { job: publicStatus(failed) } : {}),
        };
      }

      const token = randomUUID();
      const attemptNumber = row.attemptCount + 1;
      const expiresAt = new Date(now.getTime() + durationMs);
      const claimed = await transaction.floorPlanImportJob.updateMany({
        where: leaseCasWhere(row),
        data: {
          leaseToken: token,
          leaseOwner: workerId,
          leaseExpiresAt: expiresAt,
          heartbeatAt: now,
          lastAttemptAt: now,
          nextAttemptAt: null,
          errorMessage: null,
          attemptCount: { increment: 1 },
          ...(recoveredExpiredLease
            ? { retryCount: { increment: 1 }, lastRecoveredAt: now }
            : {}),
        },
      });
      if (claimed.count !== 1) return { outcome: "race_lost" };
      const updated = await transaction.floorPlanImportJob.findUnique({
        where: { id: row.id },
        select: leaseFields(),
      });
      if (!updated) return { outcome: "race_lost" };
      return {
        outcome: "claimed",
        lease: {
          jobId: row.id,
          token,
          workerId,
          expiresAt,
          attemptNumber,
        },
        job: publicStatus(updated),
        recoveredExpiredLease,
      };
    });
  }

  async claimNext(input: {
    workerId: string;
    leaseMs?: number;
    now?: Date;
    scanLimit?: number;
  }): Promise<FloorPlanLeaseClaimResult> {
    const client = asClient(this.client);
    const now = input.now ?? new Date();
    const scanLimit = Math.min(
      MAX_QUEUE_SCAN,
      Math.max(1, Math.round(input.scanLimit ?? 25))
    );
    const candidates = await client.floorPlanImportJob.findMany({
      where: {
        status: { in: [...FLOOR_PLAN_PROCESSABLE_STATUSES] },
        AND: [
          { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          { OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }] },
        ],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      take: scanLimit,
      select: leaseFields(),
    });

    for (const candidate of candidates) {
      const result = await this.claimById({
        jobId: candidate.id,
        workerId: input.workerId,
        leaseMs: input.leaseMs,
        now,
      });
      if (result.outcome === "claimed" || result.outcome === "attempts_exhausted") {
        return result;
      }
    }
    return { outcome: "not_found" };
  }

  async renew(input: {
    lease: FloorPlanImportLease;
    leaseMs?: number;
    now?: Date;
  }) {
    const client = asClient(this.client);
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + boundedLeaseMs(input.leaseMs));
    return client.$transaction(async (transaction) => {
      const renewed = await transaction.floorPlanImportJob.updateMany({
        where: {
          id: input.lease.jobId,
          leaseToken: input.lease.token,
          leaseOwner: input.lease.workerId,
          leaseExpiresAt: { gt: now },
          status: { in: [...FLOOR_PLAN_PROCESSABLE_STATUSES] },
        },
        data: { heartbeatAt: now, leaseExpiresAt: expiresAt },
      });
      return renewed.count === 1 ? { renewed: true as const, expiresAt } : { renewed: false as const };
    });
  }

  async release(input: { lease: FloorPlanImportLease }) {
    const client = asClient(this.client);
    return client.$transaction(async (transaction) => {
      const released = await transaction.floorPlanImportJob.updateMany({
        where: {
          id: input.lease.jobId,
          leaseToken: input.lease.token,
          leaseOwner: input.lease.workerId,
        },
        data: {
          leaseToken: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          errorMessage: null,
        },
      });
      return released.count === 1;
    });
  }

  async releaseAfterFailure(input: {
    lease: FloorPlanImportLease;
    error: unknown;
    retryable?: boolean;
    now?: Date;
  }): Promise<FloorPlanLeaseFailureResult> {
    const client = asClient(this.client);
    const now = input.now ?? new Date();
    const message =
      input.error instanceof Error
        ? input.error.message.slice(0, 4_000)
        : "Floor-plan processing failed";
    return client.$transaction(async (transaction) => {
      const row = await transaction.floorPlanImportJob.findUnique({
        where: { id: input.lease.jobId },
        select: leaseFields(),
      });
      if (
        !row ||
        row.leaseToken !== input.lease.token ||
        row.leaseOwner !== input.lease.workerId
      ) {
        return { outcome: "lease_lost" };
      }

      const status = row.status as FloorPlanImportStatus;
      const canRetry =
        input.retryable !== false &&
        processableStatuses.has(status) &&
        row.attemptCount < row.maxAttempts;
      const nextAttemptAt = canRetry
        ? new Date(now.getTime() + retryDelayMs(row.retryCount))
        : null;
      const changed = await transaction.floorPlanImportJob.updateMany({
        where: {
          ...leaseCasWhere(row),
          leaseToken: input.lease.token,
          leaseOwner: input.lease.workerId,
        },
        data: {
          ...(canRetry
            ? {
                retryCount: { increment: 1 },
                nextAttemptAt,
              }
            : {
                status: "failed",
                progress: FLOOR_PLAN_IMPORT_PROGRESS.failed,
                nextAttemptAt: null,
              }),
          leaseToken: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorAt: now,
          errorMessage: message,
        },
      });
      if (changed.count !== 1) return { outcome: "lease_lost" };
      const updated = await transaction.floorPlanImportJob.findUnique({
        where: { id: row.id },
        select: leaseFields(),
      });
      if (!updated) return { outcome: "lease_lost" };
      return {
        outcome: canRetry ? "retry_scheduled" : "failed",
        job: publicStatus(updated),
      };
    });
  }

  async recoverExpired(input: { now?: Date; limit?: number } = {}) {
    const client = asClient(this.client);
    const now = input.now ?? new Date();
    const limit = Math.min(MAX_QUEUE_SCAN, Math.max(1, Math.round(input.limit ?? 25)));
    const expired = await client.floorPlanImportJob.findMany({
      where: {
        status: { in: [...FLOOR_PLAN_PROCESSABLE_STATUSES] },
        leaseToken: { not: null },
        leaseExpiresAt: { lte: now },
      },
      orderBy: { leaseExpiresAt: "asc" },
      take: limit,
      select: leaseFields(),
    });
    const recovered: FloorPlanImportWorkerStatus[] = [];

    for (const candidate of expired) {
      const updated = await client.$transaction(async (transaction) => {
        const exhausted = candidate.attemptCount >= candidate.maxAttempts;
        const changed = await transaction.floorPlanImportJob.updateMany({
          where: leaseCasWhere(candidate),
          data: {
            ...(exhausted
              ? {
                  status: "failed",
                  progress: FLOOR_PLAN_IMPORT_PROGRESS.failed,
                  nextAttemptAt: null,
                  lastErrorAt: now,
                  errorMessage: `Floor-plan import exhausted ${candidate.maxAttempts} processing attempts after an expired worker lease`,
                }
              : {
                  retryCount: { increment: 1 },
                  nextAttemptAt: now,
                  errorMessage: `Recovered an expired worker lease; processing will resume from ${candidate.status}`,
                }),
            leaseToken: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastRecoveredAt: now,
          },
        });
        if (changed.count !== 1) return null;
        return transaction.floorPlanImportJob.findUnique({
          where: { id: candidate.id },
          select: leaseFields(),
        });
      });
      if (updated) recovered.push(publicStatus(updated));
    }
    return recovered;
  }
}

export function floorPlanLeaseGuard(lease: FloorPlanImportLease) {
  return { token: lease.token, workerId: lease.workerId };
}
