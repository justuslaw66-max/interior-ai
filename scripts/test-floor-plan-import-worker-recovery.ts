import assert from "node:assert/strict";
import {
  PrismaFloorPlanImportLeaseService,
  type FloorPlanImportLease,
} from "@/lib/floor-plan-imports/lease";
import type { FloorPlanImportStatus } from "@/lib/floor-plan-imports/types";

type MutableJob = {
  id: string;
  userId: string;
  status: FloorPlanImportStatus;
  progress: number;
  createdAt: Date;
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

function makeJob(
  id: string,
  overrides: Partial<MutableJob> = {}
): MutableJob {
  return {
    id,
    userId: "owner-1",
    status: "received",
    progress: 5,
    createdAt: new Date("2026-07-16T00:00:00.000Z"),
    leaseToken: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    attemptCount: 0,
    retryCount: 0,
    maxAttempts: 5,
    nextAttemptAt: null,
    lastAttemptAt: null,
    lastErrorAt: null,
    lastRecoveredAt: null,
    errorMessage: null,
    ...overrides,
  };
}

function same(left: unknown, right: unknown) {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return left === right;
}

function matchesField(value: unknown, condition: unknown): boolean {
  if (
    !condition ||
    typeof condition !== "object" ||
    condition instanceof Date ||
    Array.isArray(condition)
  ) {
    return same(value, condition);
  }
  const operators = condition as Record<string, unknown>;
  if ("in" in operators && !((operators.in as unknown[]) ?? []).includes(value)) return false;
  if ("not" in operators && same(value, operators.not)) return false;
  if ("lte" in operators) {
    if (!(value instanceof Date) || !(operators.lte instanceof Date)) return false;
    if (value.getTime() > operators.lte.getTime()) return false;
  }
  if ("gt" in operators) {
    if (!(value instanceof Date) || !(operators.gt instanceof Date)) return false;
    if (value.getTime() <= operators.gt.getTime()) return false;
  }
  return true;
}

function matches(row: MutableJob, where: unknown): boolean {
  const query = where as Record<string, unknown>;
  if (Array.isArray(query.AND) && !query.AND.every((entry) => matches(row, entry))) {
    return false;
  }
  if (Array.isArray(query.OR) && !query.OR.some((entry) => matches(row, entry))) {
    return false;
  }
  return Object.entries(query).every(([key, condition]) => {
    if (key === "AND" || key === "OR") return true;
    return matchesField(row[key as keyof MutableJob], condition);
  });
}

function applyData(row: MutableJob, data: unknown) {
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      "increment" in value
    ) {
      const current = row[key as keyof MutableJob];
      if (typeof current !== "number") {
        throw new Error(`Cannot increment non-number field ${key}`);
      }
      (row as unknown as Record<string, unknown>)[key] =
        current + Number((value as { increment: unknown }).increment);
    } else {
      (row as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

class FakeLeasePrisma {
  readonly jobs = new Map<string, MutableJob>();
  private transactionTail: Promise<void> = Promise.resolve();

  readonly floorPlanImportJob = {
    findUnique: async (args: unknown) => {
      const where = (args as { where: { id: string } }).where;
      return this.jobs.get(where.id) ?? null;
    },
    findMany: async (args: unknown) => {
      const input = args as { where: unknown; take?: number };
      return [...this.jobs.values()]
        .filter((row) => matches(row, input.where))
        .slice(0, input.take ?? Number.POSITIVE_INFINITY);
    },
    updateMany: async (args: unknown) => {
      const input = args as { where: unknown; data: unknown };
      let count = 0;
      for (const row of this.jobs.values()) {
        if (!matches(row, input.where)) continue;
        applyData(row, input.data);
        count += 1;
      }
      return { count };
    },
  };

  async $transaction<T>(callback: (client: FakeLeasePrisma) => Promise<T>): Promise<T> {
    let unlock: () => void = () => undefined;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;
    try {
      return await callback(this);
    } finally {
      unlock();
    }
  }
}

function claimedLease(
  result: Awaited<ReturnType<PrismaFloorPlanImportLeaseService["claimById"]>>
): FloorPlanImportLease {
  assert.equal(result.outcome, "claimed");
  if (result.outcome !== "claimed") throw new Error("Expected a claimed lease");
  return result.lease;
}

async function testDuplicateClaims() {
  const database = new FakeLeasePrisma();
  database.jobs.set("duplicate", makeJob("duplicate"));
  const service = new PrismaFloorPlanImportLeaseService(database);
  const now = new Date("2026-07-16T01:00:00.000Z");
  const [first, second] = await Promise.all([
    service.claimById({ jobId: "duplicate", workerId: "worker-a", now }),
    service.claimById({ jobId: "duplicate", workerId: "worker-b", now }),
  ]);
  assert.deepEqual(
    [first.outcome, second.outcome].sort(),
    ["already_processing", "claimed"]
  );
  assert.equal(database.jobs.get("duplicate")?.attemptCount, 1);
}

async function testExpiredLeaseClaimAndRecovery() {
  const database = new FakeLeasePrisma();
  const now = new Date("2026-07-16T02:00:00.000Z");
  database.jobs.set(
    "expired-direct",
    makeJob("expired-direct", {
      status: "rendered",
      progress: 20,
      leaseToken: "old-token",
      leaseOwner: "dead-worker",
      leaseExpiresAt: new Date(now.getTime() - 1_000),
      attemptCount: 1,
    })
  );
  const service = new PrismaFloorPlanImportLeaseService(database);
  const claim = await service.claimById({
    jobId: "expired-direct",
    workerId: "replacement",
    now,
  });
  assert.equal(claim.outcome, "claimed");
  if (claim.outcome === "claimed") {
    assert.equal(claim.recoveredExpiredLease, true);
    assert.equal(claim.lease.attemptNumber, 2);
  }
  assert.equal(database.jobs.get("expired-direct")?.status, "rendered");
  assert.equal(database.jobs.get("expired-direct")?.retryCount, 1);
  assert.equal(database.jobs.get("expired-direct")?.lastRecoveredAt?.getTime(), now.getTime());

  database.jobs.set(
    "expired-sweep",
    makeJob("expired-sweep", {
      status: "scale_solved",
      progress: 55,
      leaseToken: "stale-token",
      leaseOwner: "stale-worker",
      leaseExpiresAt: new Date(now.getTime() - 5_000),
      attemptCount: 1,
    })
  );
  const recovered = await service.recoverExpired({ now });
  assert.equal(recovered.some((job) => job.id === "expired-sweep"), true);
  const swept = database.jobs.get("expired-sweep");
  assert.equal(swept?.status, "scale_solved");
  assert.equal(swept?.leaseToken, null);
  assert.equal(swept?.nextAttemptAt?.getTime(), now.getTime());
}

async function testTerminalJobsAreNeverClaimed() {
  const database = new FakeLeasePrisma();
  database.jobs.set("ready", makeJob("ready", { status: "ready", progress: 100 }));
  database.jobs.set("failed", makeJob("failed", { status: "failed", progress: 100 }));
  const service = new PrismaFloorPlanImportLeaseService(database);
  assert.equal(
    (await service.claimById({ jobId: "ready", workerId: "worker" })).outcome,
    "not_processable"
  );
  assert.equal(
    (await service.claimById({ jobId: "failed", workerId: "worker" })).outcome,
    "not_processable"
  );
  assert.equal(database.jobs.get("ready")?.attemptCount, 0);
  assert.equal(database.jobs.get("failed")?.attemptCount, 0);
}

async function testOwnerIsolation() {
  const database = new FakeLeasePrisma();
  database.jobs.set("private", makeJob("private", { userId: "owner-a" }));
  const service = new PrismaFloorPlanImportLeaseService(database);
  const hidden = await service.claimById({
    jobId: "private",
    workerId: "on-demand-b",
    ownerUserId: "owner-b",
  });
  assert.equal(hidden.outcome, "not_found");
  assert.equal(database.jobs.get("private")?.attemptCount, 0);
  const owner = await service.claimById({
    jobId: "private",
    workerId: "on-demand-a",
    ownerUserId: "owner-a",
  });
  assert.equal(owner.outcome, "claimed");
}

async function testHeartbeatReleaseAndRetry() {
  const database = new FakeLeasePrisma();
  const now = new Date("2026-07-16T03:00:00.000Z");
  database.jobs.set("retry", makeJob("retry", { maxAttempts: 2 }));
  const service = new PrismaFloorPlanImportLeaseService(database);
  const lease = claimedLease(
    await service.claimById({ jobId: "retry", workerId: "worker", now })
  );
  const renewedAt = new Date(now.getTime() + 1_000);
  assert.equal((await service.renew({ lease, now: renewedAt })).renewed, true);
  assert.equal(database.jobs.get("retry")?.heartbeatAt?.getTime(), renewedAt.getTime());
  const failure = await service.releaseAfterFailure({
    lease,
    error: new Error("temporary renderer outage"),
    now: renewedAt,
  });
  assert.equal(failure.outcome, "retry_scheduled");
  assert.equal(database.jobs.get("retry")?.status, "received");
  assert.equal(database.jobs.get("retry")?.retryCount, 1);
  assert.equal(database.jobs.get("retry")?.leaseToken, null);

  const scheduled = await service.claimById({
    jobId: "retry",
    workerId: "too-early",
    now: renewedAt,
  });
  assert.equal(scheduled.outcome, "retry_scheduled");
  const retryAt = database.jobs.get("retry")?.nextAttemptAt;
  assert.ok(retryAt);
  const secondLease = claimedLease(
    await service.claimById({ jobId: "retry", workerId: "retry-worker", now: retryAt })
  );
  const exhausted = await service.releaseAfterFailure({
    lease: secondLease,
    error: new Error("renderer still unavailable"),
    now: new Date(retryAt.getTime() + 1_000),
  });
  assert.equal(exhausted.outcome, "failed");
  assert.equal(database.jobs.get("retry")?.status, "failed");
}

async function main() {
  await testDuplicateClaims();
  await testExpiredLeaseClaimAndRecovery();
  await testTerminalJobsAreNeverClaimed();
  await testOwnerIsolation();
  await testHeartbeatReleaseAndRetry();
  console.log("Floor-plan import worker recovery tests passed");
}

void main();
