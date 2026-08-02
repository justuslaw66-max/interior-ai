import {
  floorPlanObjectDeletionErrorMessage,
  type FloorPlanExternalContentDeleter,
  type FloorPlanObjectDeletionKind,
} from "./retention-outbox";
import {
  PrismaFloorPlanObjectDeletionLeaseService,
  createFloorPlanObjectDeletionWorkerId,
} from "./retention-outbox-worker";

export type FloorPlanObjectDeletionWorkerResult =
  | {
      outcome: "completed";
      queueId: string;
      kind: FloorPlanObjectDeletionKind;
      attemptNumber: number;
      designUnderlaysScrubbed: number;
    }
  | {
      outcome: "retry_scheduled" | "dead_letter";
      queueId: string;
      attemptNumber: number;
      error: string;
    }
  | {
      outcome: "lease_lost";
      queueId: string;
      attemptNumber: number;
    }
  | { outcome: "no_work" };

function boundedBatchLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 25;
  return Math.min(100, Math.max(1, Math.round(value!)));
}

export async function processNextFloorPlanObjectDeletion(input: {
  deleter: FloorPlanExternalContentDeleter;
  workerId?: string;
  now?: Date;
  leaseMs?: number;
  leaseService?: PrismaFloorPlanObjectDeletionLeaseService;
}): Promise<FloorPlanObjectDeletionWorkerResult> {
  const service =
    input.leaseService ?? new PrismaFloorPlanObjectDeletionLeaseService();
  const now = input.now ?? new Date();
  await service.recoverExpired({ now });
  const lease = await service.claimNext({
    workerId: input.workerId ?? createFloorPlanObjectDeletionWorkerId(),
    now,
    leaseMs: input.leaseMs,
  });
  if (!lease) return { outcome: "no_work" };
  try {
    // This is intentionally outside every database transaction. deleteObject
    // must be idempotent because a crash can occur before the completion CAS.
    await input.deleter({ kind: lease.kind, storageKey: lease.storageKey });
    const completed = await service.complete({ lease, now: new Date() });
    if (!completed.completed) {
      return {
        outcome: "lease_lost",
        queueId: lease.queueId,
        attemptNumber: lease.attemptNumber,
      };
    }
    return {
      outcome: "completed",
      queueId: lease.queueId,
      kind: lease.kind,
      attemptNumber: lease.attemptNumber,
      designUnderlaysScrubbed: completed.designUnderlaysScrubbed,
    };
  } catch (cause) {
    const outcome = await service.releaseAfterFailure({
      lease,
      error: cause,
      now: new Date(),
    });
    if (outcome === "lease_lost") {
      return {
        outcome,
        queueId: lease.queueId,
        attemptNumber: lease.attemptNumber,
      };
    }
    return {
      outcome,
      queueId: lease.queueId,
      attemptNumber: lease.attemptNumber,
      error: floorPlanObjectDeletionErrorMessage(cause),
    };
  }
}

export async function processFloorPlanObjectDeletionBatch(input: {
  deleter: FloorPlanExternalContentDeleter;
  limit?: number;
  workerId?: string;
  leaseService?: PrismaFloorPlanObjectDeletionLeaseService;
}) {
  const limit = boundedBatchLimit(input.limit);
  const workerId =
    input.workerId ??
    createFloorPlanObjectDeletionWorkerId("floor-plan-deletion-batch");
  const results: FloorPlanObjectDeletionWorkerResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processNextFloorPlanObjectDeletion({
      deleter: input.deleter,
      workerId,
      leaseService: input.leaseService,
    });
    if (result.outcome === "no_work") break;
    results.push(result);
  }
  return {
    processed: results.length,
    completed: results.filter((result) => result.outcome === "completed").length,
    retryScheduled: results.filter(
      (result) => result.outcome === "retry_scheduled"
    ).length,
    deadLettered: results.filter(
      (result) => result.outcome === "dead_letter"
    ).length,
    leaseLost: results.filter((result) => result.outcome === "lease_lost").length,
    results,
  };
}
