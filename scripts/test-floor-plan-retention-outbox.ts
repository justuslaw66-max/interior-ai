import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  enqueueFloorPlanExternalDeletion,
} from "@/lib/floor-plan-imports/retention-outbox";
import {
  processNextFloorPlanObjectDeletion,
} from "@/lib/floor-plan-imports/retention-outbox-runner";
import {
  PrismaFloorPlanObjectDeletionLeaseService,
} from "@/lib/floor-plan-imports/retention-outbox-worker";
import { PrismaFloorPlanRetentionService } from "@/lib/floor-plan-imports/retention";

type Queue = {
  id: string;
  createdAt: Date;
  kind: "source" | "derived";
  sourceAssetId: string | null;
  derivedAssetId: string | null;
  storageKey: string;
  deletionReason: "retention_expired" | "owner_requested";
  status: "pending" | "processing" | "completed" | "dead_letter";
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leaseToken: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  lastAttemptAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  completedAt: Date | null;
};

type Source = {
  id: string;
  sha256: string;
  ownerScope: string;
  storageProvider: "external";
  storageKey: string;
  contentDeletedAt: Date | null;
  fileName: string;
  importJobs: Array<{ id: string }>;
};

function matchesValue(value: unknown, condition: unknown) {
  if (!condition || typeof condition !== "object" || condition instanceof Date) {
    return value instanceof Date && condition instanceof Date
      ? value.getTime() === condition.getTime()
      : value === condition;
  }
  const operators = condition as Record<string, unknown>;
  if ("lte" in operators) {
    return value instanceof Date && operators.lte instanceof Date &&
      value.getTime() <= operators.lte.getTime();
  }
  return true;
}

function matches(row: Record<string, unknown>, where: unknown) {
  return Object.entries(where as Record<string, unknown>).every(
    ([key, condition]) => matchesValue(row[key], condition)
  );
}

function applyData(row: Record<string, unknown>, data: unknown) {
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (
      value && typeof value === "object" && !(value instanceof Date) &&
      "increment" in value
    ) {
      row[key] = Number(row[key]) + Number((value as { increment: number }).increment);
    } else {
      row[key] = value;
    }
  }
}

class FakeOutboxPrisma {
  readonly queues = new Map<string, Queue>();
  readonly sources = new Map<string, Source>();
  readonly designs = new Map<string, { id: string; userId: string; snapshot: unknown }>();
  transactionDepth = 0;

  readonly floorPlanObjectDeletionOutbox = {
    upsert: async (args: unknown) => {
      const input = args as {
        where: { sourceAssetId?: string; derivedAssetId?: string };
        create: Omit<Queue, "id" | "createdAt" | "status" | "attemptCount" |
          "maxAttempts" | "nextAttemptAt" | "leaseToken" | "leaseOwner" |
          "leaseExpiresAt" | "lastAttemptAt" | "lastErrorAt" |
          "lastErrorMessage" | "completedAt">;
        update: Partial<Queue>;
      };
      let row = [...this.queues.values()].find((candidate) =>
        input.where.sourceAssetId
          ? candidate.sourceAssetId === input.where.sourceAssetId
          : candidate.derivedAssetId === input.where.derivedAssetId
      );
      if (!row) {
        row = {
          ...input.create,
          id: `queue-${this.queues.size + 1}`,
          createdAt: new Date(),
          status: "pending",
          attemptCount: 0,
          maxAttempts: 10,
          nextAttemptAt: new Date(),
          leaseToken: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastAttemptAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          completedAt: null,
        };
        this.queues.set(row.id, row);
      } else {
        Object.assign(row, input.update);
      }
      return { id: row.id, status: row.status };
    },
    findMany: async (args: unknown) => {
      const input = args as { where: unknown; take?: number };
      return [...this.queues.values()]
        .filter((row) => matches(row as unknown as Record<string, unknown>, input.where))
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .slice(0, input.take ?? Number.POSITIVE_INFINITY);
    },
    findUnique: async (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      const row = this.queues.get(id);
      if (!row) return null;
      return {
        ...row,
        sourceAsset: row.sourceAssetId
          ? this.sources.get(row.sourceAssetId) ?? null
          : null,
        derivedAsset: null,
      };
    },
    updateMany: async (args: unknown) => {
      const input = args as { where: unknown; data: unknown };
      let count = 0;
      for (const row of this.queues.values()) {
        if (!matches(row as unknown as Record<string, unknown>, input.where)) continue;
        applyData(row as unknown as Record<string, unknown>, input.data);
        count += 1;
      }
      return { count };
    },
  };

  readonly floorPlanSourceAsset = {
    updateMany: async (args: unknown) => {
      const input = args as { where: unknown; data: unknown };
      let count = 0;
      for (const row of this.sources.values()) {
        if (!matches(row as unknown as Record<string, unknown>, input.where)) continue;
        applyData(row as unknown as Record<string, unknown>, input.data);
        count += 1;
      }
      return { count };
    },
  };

  readonly floorPlanDerivedAsset = {
    updateMany: async () => ({ count: 0 }),
  };

  readonly design = {
    findMany: async (args: unknown) => {
      const userId = (args as { where: { userId: string } }).where.userId;
      return [...this.designs.values()].filter((design) => design.userId === userId);
    },
    updateMany: async (args: unknown) => {
      const input = args as {
        where: { id: string; userId: string };
        data: { snapshot: unknown };
      };
      const design = this.designs.get(input.where.id);
      if (!design || design.userId !== input.where.userId) return { count: 0 };
      design.snapshot = input.data.snapshot;
      return { count: 1 };
    },
  };

  async $queryRaw() {
    return [];
  }

  async $transaction<T>(callback: (client: FakeOutboxPrisma) => Promise<T>) {
    this.transactionDepth += 1;
    try {
      return await callback(this);
    } finally {
      this.transactionDepth -= 1;
    }
  }
}

function addSourceQueue(database: FakeOutboxPrisma, overrides: Partial<Queue> = {}) {
  const source: Source = {
    id: "source-1",
    sha256: "a".repeat(64),
    ownerScope: "user-1",
    storageProvider: "external",
    storageKey: "private/source/object-1",
    contentDeletedAt: null,
    fileName: "home.pdf",
    importJobs: [{ id: "job-1" }],
  };
  const queue: Queue = {
    id: "queue-1",
    createdAt: new Date(),
    kind: "source",
    sourceAssetId: source.id,
    derivedAssetId: null,
    storageKey: source.storageKey,
    deletionReason: "owner_requested",
    status: "pending",
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: new Date(Date.now() - 1_000),
    leaseToken: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastAttemptAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    completedAt: null,
    ...overrides,
  };
  database.sources.set(source.id, source);
  database.queues.set(queue.id, queue);
  return { source, queue };
}

async function testIdempotentEnqueue() {
  const database = new FakeOutboxPrisma();
  const first = await enqueueFloorPlanExternalDeletion(database, {
    kind: "source",
    assetId: "source-1",
    storageKey: "private/source/object-1",
    reason: "retention_expired",
  });
  const second = await enqueueFloorPlanExternalDeletion(database, {
    kind: "source",
    assetId: "source-1",
    storageKey: "private/source/object-1",
    reason: "owner_requested",
  });
  assert.equal(first.id, second.id);
  assert.equal(database.queues.size, 1);
  assert.equal(database.queues.get(first.id)?.deletionReason, "owner_requested");
}

async function testRetentionTransactionOnlyEnqueuesExternalObjects() {
  const queued: Array<{ kind: string; assetId: string; storageKey: string }> = [];
  const summaryJob = {
    id: "job-external",
    userId: "user-1",
    status: "ready",
    sourceRetentionExpiresAt: new Date(Date.now() - 60_000),
    sourceDeletionRequestedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    revision: null,
  };
  let sourceTombstoneWrites = 0;
  const transaction = {
    $queryRaw: async () => [],
    floorPlanImportJob: {
      findUnique: async (args: { select?: Record<string, unknown> }) =>
        args.select && "sourceAsset" in args.select
          ? {
              ...summaryJob,
              sourceAssetId: "source-external",
              sourceManifestJson: {},
              sourceAsset: {
                id: "source-external",
                sha256: "b".repeat(64),
                ownerScope: "user-1",
                storageProvider: "external",
                storageKey: "private/source/external",
                contentDeletedAt: null,
                importJobs: [summaryJob],
              },
            }
          : {
              id: summaryJob.id,
              userId: summaryJob.userId,
              sourceAssetId: "source-external",
            },
      findMany: async () => [{ id: summaryJob.id, sourceManifestJson: {} }],
      updateMany: async () => ({ count: 0 }),
    },
    floorPlanDerivedAsset: {
      findMany: async () => [{
        id: "derived-external",
        jobId: summaryJob.id,
        storageProvider: "external",
        storageKey: "private/derived/external",
        contentDeletedAt: null,
      }],
      updateMany: async () => ({ count: 0 }),
    },
    floorPlanSupplementarySource: { findMany: async () => [] },
    floorPlanConstructionSource: { findMany: async () => [] },
    floorPlanSourceAsset: {
      updateMany: async () => {
        sourceTombstoneWrites += 1;
        return { count: 1 };
      },
    },
    floorPlanObjectDeletionOutbox: {
      upsert: async (args: unknown) => {
        const create = (args as {
          create: { kind: string; sourceAssetId: string | null;
            derivedAssetId: string | null; storageKey: string };
        }).create;
        queued.push({
          kind: create.kind,
          assetId: create.sourceAssetId ?? create.derivedAssetId ?? "",
          storageKey: create.storageKey,
        });
        return { id: `queued-${queued.length}`, status: "pending" as const };
      },
    },
    design: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
  };
  const client = {
    ...transaction,
    $transaction: async <T>(callback: (value: typeof transaction) => Promise<T>) =>
      callback(transaction),
  };
  const result = await new PrismaFloorPlanRetentionService(
    client
  ).requestOwnerDeletion({
    jobId: summaryJob.id,
    ownerUserId: summaryJob.userId,
  });
  assert.equal(result.externalContentQueued, 2);
  assert.equal(result.sourceContentDeleted, false);
  assert.equal(result.derivedContentDeleted, 0);
  assert.equal(sourceTombstoneWrites, 0);
  assert.deepEqual(queued.map((entry) => entry.kind).sort(), ["derived", "source"]);
}

async function testFailureRetryAndTombstoneOrdering() {
  const database = new FakeOutboxPrisma();
  const { source, queue } = addSourceQueue(database);
  const service = new PrismaFloorPlanObjectDeletionLeaseService(database);
  const failed = await processNextFloorPlanObjectDeletion({
    leaseService: service,
    workerId: "worker-1",
    deleter: async () => {
      assert.equal(database.transactionDepth, 0, "external delete ran in a transaction");
      throw new Error("temporary S3 outage");
    },
  });
  assert.equal(failed.outcome, "retry_scheduled");
  assert.equal(source.contentDeletedAt, null, "failure must not tombstone the asset");
  assert.equal(queue.status, "pending");
  assert.match(queue.lastErrorMessage ?? "", /temporary S3 outage/);
  assert.ok(queue.nextAttemptAt);

  database.designs.set("design-1", {
    id: "design-1",
    userId: "user-1",
    snapshot: {
      floorPlan: {
        underlay: { sourceJobId: "job-1", sourceAssetSha256: source.sha256 },
        canonicalDocument: { id: "doc-1" },
      },
    },
  });
  let deletes = 0;
  const completed = await processNextFloorPlanObjectDeletion({
    leaseService: service,
    workerId: "worker-2",
    now: new Date((queue.nextAttemptAt as Date).getTime() + 1),
    deleter: async () => {
      assert.equal(database.transactionDepth, 0, "external delete ran in a transaction");
      deletes += 1;
    },
  });
  assert.equal(completed.outcome, "completed");
  assert.equal(deletes, 1);
  assert.ok(source.contentDeletedAt, "success must atomically tombstone the asset");
  assert.equal(queue.status, "completed");
  assert.equal(
    (database.designs.get("design-1")?.snapshot as {
      floorPlan: { underlay: unknown };
    }).floorPlan.underlay,
    null
  );
  const idempotent = await processNextFloorPlanObjectDeletion({
    leaseService: service,
    workerId: "worker-3",
    deleter: async () => { deletes += 1; },
  });
  assert.equal(idempotent.outcome, "no_work");
  assert.equal(deletes, 1, "completed queue rows must never be deleted twice");
}

async function testCrashAfterDeleteRecoversIdempotently() {
  const database = new FakeOutboxPrisma();
  const { source, queue } = addSourceQueue(database);
  class CrashOnceService extends PrismaFloorPlanObjectDeletionLeaseService {
    private crash = true;
    override async complete(input: Parameters<PrismaFloorPlanObjectDeletionLeaseService["complete"]>[0]) {
      if (this.crash) {
        this.crash = false;
        throw new Error("database unavailable after object deletion");
      }
      return super.complete(input);
    }
  }
  const service = new CrashOnceService(database);
  let deleteCalls = 0;
  const deleter = async () => { deleteCalls += 1; };
  const first = await processNextFloorPlanObjectDeletion({
    leaseService: service,
    workerId: "crashing-worker",
    deleter,
  });
  assert.equal(first.outcome, "retry_scheduled");
  assert.equal(source.contentDeletedAt, null);
  assert.ok(queue.nextAttemptAt);
  const resumed = await processNextFloorPlanObjectDeletion({
    leaseService: service,
    workerId: "replacement-worker",
    now: new Date((queue.nextAttemptAt as Date).getTime() + 1),
    deleter,
  });
  assert.equal(resumed.outcome, "completed");
  assert.equal(deleteCalls, 2, "the object-store delete contract must be idempotent");
  assert.ok(source.contentDeletedAt);
}

async function testExpiredLeaseAndDeadLetterRecovery() {
  const database = new FakeOutboxPrisma();
  const expiredAt = new Date(Date.now() - 1_000);
  const { queue } = addSourceQueue(database, {
    status: "processing",
    attemptCount: 3,
    maxAttempts: 3,
    nextAttemptAt: null,
    leaseToken: "orphan-token",
    leaseOwner: "dead-worker",
    leaseExpiresAt: expiredAt,
  });
  const recovered = await new PrismaFloorPlanObjectDeletionLeaseService(
    database
  ).recoverExpired({ now: new Date() });
  assert.equal(recovered, 1);
  assert.equal(queue.status, "dead_letter");
  assert.equal(queue.leaseToken, null);
  assert.equal(queue.nextAttemptAt, null);
}

async function main() {
  await testIdempotentEnqueue();
  await testRetentionTransactionOnlyEnqueuesExternalObjects();
  await testFailureRetryAndTombstoneOrdering();
  await testCrashAfterDeleteRecoversIdempotently();
  await testExpiredLeaseAndDeadLetterRecovery();

  const retentionSource = fs.readFileSync(
    path.join(process.cwd(), "lib/floor-plan-imports/retention.ts"), "utf8"
  );
  const runnerSource = fs.readFileSync(
    path.join(process.cwd(), "lib/floor-plan-imports/retention-outbox-runner.ts"),
    "utf8"
  );
  const migration = fs.readFileSync(
    path.join(
      process.cwd(),
      "prisma/migrations/20260717024500_add_floor_plan_object_deletion_outbox/migration.sql"
    ),
    "utf8"
  );
  assert.doesNotMatch(retentionSource, /deleteObject|await input\.deleter/);
  assert.match(runnerSource, /await input\.deleter/);
  assert.match(migration, /FloorPlanObjectDeletionOutbox_state_check/);
  assert.match(migration, /FloorPlanObjectDeletionOutbox_asset_kind_check/);
  console.log("Floor-plan retention deletion outbox tests passed");
}

void main();
