import assert from "node:assert/strict";
import {
  floorPlanLeaseGuard,
  PrismaFloorPlanImportLeaseService,
  type FloorPlanImportLease,
} from "@/lib/floor-plan-imports/lease";
import { cancelOwnedFloorPlanImport } from "@/lib/floor-plan-imports/owner-cancel";
import { assessFloorPlanRetentionPurge } from "@/lib/floor-plan-imports/privacy";
import { PrismaFloorPlanImportJobRepository } from "@/lib/floor-plan-imports/prisma-repository";
import { FLOOR_PLAN_IMPORT_PROGRESS } from "@/lib/floor-plan-imports/status";
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
  appliedDesignId: string | null;
  revision: { id: string } | null;
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
    appliedDesignId: null,
    revision: null,
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
    findFirst: async (args: unknown) => {
      const where = (args as { where: unknown }).where;
      const row = [...this.jobs.values()].find((entry) => matches(entry, where));
      // A copy, as a database read is: a later change to the row doesn't reach what was read.
      return row ? { ...row } : null;
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

async function testReleaseAfterLateHeartbeat() {
  const database = new FakeLeasePrisma();
  const now = new Date("2026-07-16T04:00:00.000Z");
  database.jobs.set("late", makeJob("late"));
  const service = new PrismaFloorPlanImportLeaseService(database);
  const lease = claimedLease(
    await service.claimById({ jobId: "late", workerId: "worker", now })
  );
  // The pipeline's final status write commits before the heartbeat's renewal.
  const row = database.jobs.get("late");
  assert.ok(row);
  row.status = "needs_review";
  row.progress = 85;
  const heartbeat = await service.renew({ lease, now: new Date(now.getTime() + 30_000) });
  assert.equal(heartbeat.renewed, false);
  // runClaimedJob still releases the lease it holds, keeping the result.
  assert.equal(await service.release({ lease }), true);
  assert.equal(row.status, "needs_review");
  assert.equal(row.leaseToken, null);
  assert.equal(row.leaseExpiresAt, null);

  // The release CAS never clears a lease another worker has taken over.
  database.jobs.set(
    "taken",
    makeJob("taken", { status: "ready", progress: 100, leaseToken: "other", leaseOwner: "other" })
  );
  assert.equal(
    await service.release({ lease: { ...lease, jobId: "taken" } }),
    false
  );
  assert.equal(database.jobs.get("taken")?.leaseToken, "other");
}

async function testFinishedJobLeaseIsCleared() {
  const database = new FakeLeasePrisma();
  const now = new Date("2026-07-16T05:00:00.000Z");
  database.jobs.set(
    "finished-stale",
    makeJob("finished-stale", {
      status: "needs_review",
      progress: 85,
      leaseToken: "stale-token",
      leaseOwner: "finished-worker",
      leaseExpiresAt: new Date(now.getTime() - 60_000),
      attemptCount: 1,
    })
  );
  database.jobs.set(
    "finished-active",
    makeJob("finished-active", {
      status: "ready",
      progress: 100,
      leaseToken: "active-token",
      leaseOwner: "releasing-worker",
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      attemptCount: 1,
    })
  );
  const service = new PrismaFloorPlanImportLeaseService(database);
  const recovered = await service.recoverExpired({ now });
  assert.equal(recovered.length, 0);
  const cleared = database.jobs.get("finished-stale");
  assert.equal(cleared?.status, "needs_review");
  assert.equal(cleared?.progress, 85);
  assert.equal(cleared?.leaseToken, null);
  assert.equal(cleared?.leaseOwner, null);
  assert.equal(cleared?.leaseExpiresAt, null);
  assert.equal(cleared?.retryCount, 0);
  assert.equal(cleared?.nextAttemptAt, null);
  assert.equal(cleared?.lastRecoveredAt, null);
  assert.equal(database.jobs.get("finished-active")?.leaseToken, "active-token");
}

/** The owner's Cancel while a worker reads the plan (J, 31 Oct): it used to wait for the read to finish. */
async function testOwnerCancelStopsTheWorkerReadingIt() {
  const database = new FakeLeasePrisma();
  const now = new Date("2026-07-16T06:00:00.000Z");
  database.jobs.set("reading", makeJob("reading"));
  const service = new PrismaFloorPlanImportLeaseService(database);
  const lease = claimedLease(
    await service.claimById({ jobId: "reading", workerId: "worker", now })
  );
  const row = database.jobs.get("reading");
  assert.ok(row);
  row.status = "rendered";

  // Another account's cancel is no different from a missing upload, and leaves the worker alone.
  assert.equal(await cancelOwnedFloorPlanImport({ id: "reading", userId: "owner-2", now }, database), "not_found");
  assert.equal(row.leaseToken, lease.token);

  const leaseEnd = row.leaseExpiresAt;
  assert.ok(leaseEnd && leaseEnd > now);
  assert.equal(await cancelOwnedFloorPlanImport({ id: "reading", userId: "owner-1", now }, database), "cancelled");
  assert.equal(row.status, "failed");
  assert.equal(row.errorMessage, "Cancelled by owner");
  assert.equal(row.progress, FLOOR_PLAN_IMPORT_PROGRESS.failed);
  assert.equal(row.leaseToken, null);
  assert.equal(row.leaseOwner, null);
  // The lease's end stays, without its token: the worker can take until then to stop writing files.
  assert.equal(row.leaseExpiresAt?.getTime(), leaseEnd.getTime());
  // A repeated cancel (a lost answer, a second press) is answered as done.
  assert.equal(await cancelOwnedFloorPlanImport({ id: "reading", userId: "owner-1", now }, database), "already_stopped");
  assert.equal(row.errorMessage, "Cancelled by owner");

  // The worker's next write is refused, so nothing more of the read lands.
  const repository = new PrismaFloorPlanImportJobRepository(database);
  await assert.rejects(
    repository.transition("reading", "rendered", "extracted", {}, floorPlanLeaseGuard(lease)),
    /changed while processing/
  );
  // Its heartbeat fails, which aborts the read and kills the vectorizer (worker.ts).
  const heartbeatAt = new Date(now.getTime() + 30_000);
  assert.equal((await service.renew({ lease, now: heartbeatAt })).renewed, false);
  // Its failure release leaves the cancel as it is, with no retry scheduled.
  const released = await service.releaseAfterFailure({
    lease,
    error: new Error("Floor-plan worker lease was lost"),
    now: heartbeatAt,
  });
  assert.equal(released.outcome, "lease_lost");
  assert.equal(row.status, "failed");
  assert.equal(row.errorMessage, "Cancelled by owner");
  assert.equal(row.nextAttemptAt, null);
  // And no worker takes it up again.
  assert.equal((await service.claimById({ jobId: "reading", workerId: "next", now: heartbeatAt })).outcome, "not_processable");
  assert.notEqual((await service.claimNext({ workerId: "next", now: heartbeatAt })).outcome, "claimed");

  // Deleting the upload's files waits for that lease's end, so nothing the worker writes meanwhile is left behind.
  const purgeAt = (at: Date) =>
    assessFloorPlanRetentionPurge({
      asset: {
        id: "asset-1",
        ownerScope: "owner-1",
        contentDeletedAt: null,
        jobs: [{
          id: "reading", userId: "owner-1", status: row.status,
          sourceRetentionExpiresAt: new Date("2026-08-16T00:00:00.000Z"), sourceDeletionRequestedAt: null,
          leaseToken: row.leaseToken, leaseExpiresAt: row.leaseExpiresAt, revision: null,
        }],
      },
      targetJobId: "reading",
      mode: "owner_requested",
      ownerUserId: "owner-1",
      now: at,
    }).code;
  assert.equal(purgeAt(heartbeatAt), "active_lease");
  assert.equal(purgeAt(new Date(leaseEnd.getTime() + 1)), "purge");
  // A worker that releases or claims the job between the cancel's read and its write changes the lease: the
  // cancel reads again and lands on the new state.
  const lateLeaseEnd = new Date(leaseEnd.getTime() + 60_000);
  for (const [id, race] of [
    ["released", (row: MutableJob) => Object.assign(row, { leaseToken: null, leaseOwner: null, leaseExpiresAt: null })],
    ["claimed", (row: MutableJob) => Object.assign(row, { leaseToken: "late-claim", leaseOwner: "late-worker", leaseExpiresAt: lateLeaseEnd })],
  ] as const) {
    database.jobs.set(id, makeJob(id, { status: "rendered", leaseToken: "first", leaseOwner: "worker", leaseExpiresAt: leaseEnd }));
    const updateMany = database.floorPlanImportJob.updateMany;
    let raced = false;
    database.floorPlanImportJob.updateMany = async (args: unknown) => {
      const row = database.jobs.get(id);
      if (!raced && row) {
        raced = true;
        race(row);
      }
      return updateMany(args);
    };
    assert.equal(await cancelOwnedFloorPlanImport({ id, userId: "owner-1", now }, database), "cancelled");
    database.floorPlanImportJob.updateMany = updateMany;
    const cancelled = database.jobs.get(id);
    assert.equal(cancelled?.status, "failed");
    assert.equal(cancelled?.leaseToken, null);
    // Held for the lease that was live when the cancel landed (the late claim's, not the one first read), and
    // none once the worker had let go.
    assert.equal(cancelled?.leaseExpiresAt?.getTime() ?? null, id === "claimed" ? lateLeaseEnd.getTime() : null);
  }

  // A queued upload (no lease) is cancelled with nothing held back.
  database.jobs.set("queued", makeJob("queued"));
  assert.equal(await cancelOwnedFloorPlanImport({ id: "queued", userId: "owner-1", now }, database), "cancelled");
  assert.equal(database.jobs.get("queued")?.leaseExpiresAt, null);

  // A plan that finished reading, or made a design, is past cancelling.
  database.jobs.set("finished", makeJob("finished", { status: "ready", progress: 100 }));
  database.jobs.set("applied", makeJob("applied", { status: "needs_review", appliedDesignId: "design-1" }));
  for (const id of ["finished", "applied"]) {
    assert.equal(await cancelOwnedFloorPlanImport({ id, userId: "owner-1", now }, database), "too_late");
    assert.notEqual(database.jobs.get(id)?.status, "failed");
  }
}

async function main() {
  await testDuplicateClaims();
  await testExpiredLeaseClaimAndRecovery();
  await testTerminalJobsAreNeverClaimed();
  await testOwnerIsolation();
  await testHeartbeatReleaseAndRetry();
  await testReleaseAfterLateHeartbeat();
  await testFinishedJobLeaseIsCleared();
  await testOwnerCancelStopsTheWorkerReadingIt();
  console.log("Floor-plan import worker recovery tests passed");
}

void main();
