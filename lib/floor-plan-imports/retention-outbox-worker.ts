import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  floorPlanContentDeletionPatch,
  floorPlanObjectDeletionErrorMessage,
  floorPlanObjectDeletionRetryDelayMs,
  floorPlanSourceContentDeletionPatch,
  type FloorPlanObjectDeletionKind,
  type FloorPlanObjectDeletionStatus,
} from "./retention-outbox";
import { scrubPrivateFloorPlanUnderlayFromSnapshot } from "./retention-underlay";

export const DEFAULT_FLOOR_PLAN_DELETION_LEASE_MS = 5 * 60_000;
const DEFAULT_RECOVERY_LIMIT = 100;
const MAX_BATCH_SIZE = 100;

type QueueRow = {
  id: string;
  kind: FloorPlanObjectDeletionKind;
  storageKey: string;
  deletionReason: "retention_expired" | "owner_requested";
  status: FloorPlanObjectDeletionStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leaseToken: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
};

type CompletionRow = QueueRow & {
  sourceAssetId: string | null;
  derivedAssetId: string | null;
  sourceAsset: {
    id: string;
    sha256: string;
    ownerScope: string;
    storageProvider: "database" | "external";
    storageKey: string;
    contentDeletedAt: Date | null;
    importJobs: Array<{ id: string }>;
  } | null;
  derivedAsset: {
    id: string;
    storageProvider: "database" | "external";
    storageKey: string;
    contentDeletedAt: Date | null;
  } | null;
};

type OutboxTransaction = {
  $queryRaw<T>(query: unknown): Promise<T>;
  floorPlanObjectDeletionOutbox: {
    findMany(args: unknown): Promise<QueueRow[]>;
    findUnique(args: unknown): Promise<CompletionRow | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  floorPlanSourceAsset: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  floorPlanDerivedAsset: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  design: {
    findMany(args: unknown): Promise<Array<{ id: string; snapshot: unknown }>>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

type OutboxClient = OutboxTransaction & {
  $transaction<T>(
    callback: (transaction: OutboxTransaction) => Promise<T>
  ): Promise<T>;
};

export type FloorPlanObjectDeletionLease = {
  queueId: string;
  kind: FloorPlanObjectDeletionKind;
  storageKey: string;
  token: string;
  workerId: string;
  attemptNumber: number;
  maxAttempts: number;
};

function outboxClient(client: unknown): OutboxClient {
  return client as OutboxClient;
}

function boundedLimit(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.round(value!)));
}

export function createFloorPlanObjectDeletionWorkerId(
  prefix = "floor-plan-deletion"
) {
  return `${prefix}:${hostname()}:${process.pid}:${randomUUID()}`.slice(0, 160);
}

export class PrismaFloorPlanObjectDeletionLeaseService {
  constructor(private readonly client: unknown = prisma) {}

  private clientRef() {
    return outboxClient(this.client);
  }

  async recoverExpired(input: {
    now?: Date;
    limit?: number;
  } = {}): Promise<number> {
    const now = input.now ?? new Date();
    const expired = await this.clientRef().floorPlanObjectDeletionOutbox.findMany({
      where: { status: "processing", leaseExpiresAt: { lte: now } },
      orderBy: [{ leaseExpiresAt: "asc" }, { id: "asc" }],
      take: boundedLimit(input.limit, DEFAULT_RECOVERY_LIMIT),
      select: {
        id: true,
        kind: true,
        storageKey: true,
        deletionReason: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        nextAttemptAt: true,
        leaseToken: true,
        leaseOwner: true,
        leaseExpiresAt: true,
      },
    });
    let recovered = 0;
    for (const row of expired) {
      const exhausted = row.attemptCount >= row.maxAttempts;
      const updated = await this.clientRef().floorPlanObjectDeletionOutbox.updateMany({
        where: {
          id: row.id,
          status: "processing",
          leaseToken: row.leaseToken,
          leaseExpiresAt: { lte: now },
        },
        data: {
          status: exhausted ? "dead_letter" : "pending",
          nextAttemptAt: exhausted ? null : now,
          leaseToken: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorAt: now,
          lastErrorMessage: "Deletion worker lease expired before completion",
        },
      });
      recovered += updated.count;
    }
    return recovered;
  }

  async claimNext(input: {
    workerId: string;
    now?: Date;
    leaseMs?: number;
  }): Promise<FloorPlanObjectDeletionLease | null> {
    const now = input.now ?? new Date();
    const leaseMs = Math.max(30_000, input.leaseMs ?? DEFAULT_FLOOR_PLAN_DELETION_LEASE_MS);
    for (let contentionAttempt = 0; contentionAttempt < 3; contentionAttempt += 1) {
      const claimed = await this.clientRef().$transaction(async (transaction) => {
        const candidates = await transaction.floorPlanObjectDeletionOutbox.findMany({
          where: { status: "pending", nextAttemptAt: { lte: now } },
          orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          take: 20,
          select: {
            id: true,
            kind: true,
            storageKey: true,
            deletionReason: true,
            status: true,
            attemptCount: true,
            maxAttempts: true,
            nextAttemptAt: true,
            leaseToken: true,
            leaseOwner: true,
            leaseExpiresAt: true,
          },
        });
        for (const exhausted of candidates.filter(
          (row) => row.attemptCount >= row.maxAttempts
        )) {
          await transaction.floorPlanObjectDeletionOutbox.updateMany({
            where: {
              id: exhausted.id,
              status: "pending",
              attemptCount: exhausted.attemptCount,
            },
            data: { status: "dead_letter", nextAttemptAt: null },
          });
        }
        const candidate = candidates.find(
          (row) => row.attemptCount < row.maxAttempts
        );
        if (!candidate) return null;
        const token = randomUUID();
        const updated = await transaction.floorPlanObjectDeletionOutbox.updateMany({
          where: {
            id: candidate.id,
            status: "pending",
            attemptCount: candidate.attemptCount,
            nextAttemptAt: { lte: now },
            leaseToken: null,
          },
          data: {
            status: "processing",
            attemptCount: { increment: 1 },
            nextAttemptAt: null,
            leaseToken: token,
            leaseOwner: input.workerId,
            leaseExpiresAt: new Date(now.getTime() + leaseMs),
            lastAttemptAt: now,
            lastErrorMessage: null,
          },
        });
        if (updated.count !== 1) return null;
        return {
          queueId: candidate.id,
          kind: candidate.kind,
          storageKey: candidate.storageKey,
          token,
          workerId: input.workerId,
          attemptNumber: candidate.attemptCount + 1,
          maxAttempts: candidate.maxAttempts,
        } satisfies FloorPlanObjectDeletionLease;
      });
      if (claimed) return claimed;
    }
    return null;
  }

  async complete(input: { lease: FloorPlanObjectDeletionLease; now?: Date }) {
    const now = input.now ?? new Date();
    return this.clientRef().$transaction(async (transaction) => {
      const row = await transaction.floorPlanObjectDeletionOutbox.findUnique({
        where: { id: input.lease.queueId },
        select: {
          id: true,
          kind: true,
          sourceAssetId: true,
          derivedAssetId: true,
          storageKey: true,
          deletionReason: true,
          status: true,
          attemptCount: true,
          maxAttempts: true,
          nextAttemptAt: true,
          leaseToken: true,
          leaseOwner: true,
          leaseExpiresAt: true,
          sourceAsset: {
            select: {
              id: true,
              sha256: true,
              ownerScope: true,
              storageProvider: true,
              storageKey: true,
              contentDeletedAt: true,
              importJobs: { select: { id: true } },
            },
          },
          derivedAsset: {
            select: {
              id: true,
              storageProvider: true,
              storageKey: true,
              contentDeletedAt: true,
            },
          },
        },
      });
      if (
        !row ||
        row.status !== "processing" ||
        row.leaseToken !== input.lease.token
      ) {
        return { completed: false, designUnderlaysScrubbed: 0 };
      }
      const finalized = await transaction.floorPlanObjectDeletionOutbox.updateMany({
        where: {
          id: row.id,
          status: "processing",
          leaseToken: input.lease.token,
        },
        data: {
          status: "completed",
          nextAttemptAt: null,
          leaseToken: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: now,
          lastErrorMessage: null,
        },
      });
      if (finalized.count !== 1) {
        return { completed: false, designUnderlaysScrubbed: 0 };
      }

      let designUnderlaysScrubbed = 0;
      if (row.kind === "source") {
        const source = row.sourceAsset;
        if (
          !source ||
          source.storageProvider !== "external" ||
          source.storageKey !== row.storageKey
        ) {
          throw new Error("FLOOR_PLAN_DELETION_SOURCE_INTEGRITY_MISMATCH");
        }
        if (!source.contentDeletedAt) {
          const deleted = await transaction.floorPlanSourceAsset.updateMany({
            where: {
              id: source.id,
              storageProvider: "external",
              storageKey: row.storageKey,
              contentDeletedAt: null,
            },
            data: floorPlanSourceContentDeletionPatch(row.deletionReason, now),
          });
          if (deleted.count !== 1) {
            throw new Error("FLOOR_PLAN_DELETION_SOURCE_RACE");
          }
        }
        if (row.deletionReason === "owner_requested") {
          await transaction.$queryRaw(
            Prisma.sql`SELECT "id" FROM "Design" WHERE "userId" = ${source.ownerScope} FOR UPDATE`
          );
          const designs = await transaction.design.findMany({
            where: { userId: source.ownerScope, snapshot: { not: Prisma.DbNull } },
            select: { id: true, snapshot: true },
          });
          const affectedJobIds = source.importJobs.map((job) => job.id);
          for (const design of designs) {
            const scrubbed = scrubPrivateFloorPlanUnderlayFromSnapshot({
              snapshot: design.snapshot,
              affectedJobIds,
              sourceAssetSha256: source.sha256,
            });
            if (!scrubbed.scrubbed) continue;
            const updated = await transaction.design.updateMany({
              where: { id: design.id, userId: source.ownerScope },
              data: { snapshot: scrubbed.snapshot as Prisma.InputJsonValue },
            });
            if (updated.count !== 1) {
              throw new Error("FLOOR_PLAN_DELETION_DESIGN_RACE");
            }
            designUnderlaysScrubbed += 1;
          }
        }
      } else {
        const derived = row.derivedAsset;
        if (
          !derived ||
          derived.storageProvider !== "external" ||
          derived.storageKey !== row.storageKey
        ) {
          throw new Error("FLOOR_PLAN_DELETION_DERIVED_INTEGRITY_MISMATCH");
        }
        if (!derived.contentDeletedAt) {
          const deleted = await transaction.floorPlanDerivedAsset.updateMany({
            where: {
              id: derived.id,
              storageProvider: "external",
              storageKey: row.storageKey,
              contentDeletedAt: null,
            },
            data: floorPlanContentDeletionPatch(row.deletionReason, now),
          });
          if (deleted.count !== 1) {
            throw new Error("FLOOR_PLAN_DELETION_DERIVED_RACE");
          }
        }
      }
      return { completed: true, designUnderlaysScrubbed };
    });
  }

  async releaseAfterFailure(input: {
    lease: FloorPlanObjectDeletionLease;
    error: unknown;
    now?: Date;
  }): Promise<"retry_scheduled" | "dead_letter" | "lease_lost"> {
    const now = input.now ?? new Date();
    const exhausted = input.lease.attemptNumber >= input.lease.maxAttempts;
    const updated = await this.clientRef().floorPlanObjectDeletionOutbox.updateMany({
      where: {
        id: input.lease.queueId,
        status: "processing",
        leaseToken: input.lease.token,
      },
      data: {
        status: exhausted ? "dead_letter" : "pending",
        nextAttemptAt: exhausted
          ? null
          : new Date(
              now.getTime() +
                floorPlanObjectDeletionRetryDelayMs(input.lease.attemptNumber)
            ),
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorAt: now,
        lastErrorMessage: floorPlanObjectDeletionErrorMessage(input.error),
      },
    });
    if (updated.count !== 1) return "lease_lost";
    return exhausted ? "dead_letter" : "retry_scheduled";
  }
}
