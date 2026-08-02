const DEFAULT_MAX_QUEUE_WAIT_MS = 10 * 60 * 1_000;

export type FloorPlanQueueSnapshot = {
  queued: number;
  active: number;
  expiredLeases: number;
  failedLast24Hours: number;
  oldestQueuedAt: Date | null;
};

export type FloorPlanQueueHealth = FloorPlanQueueSnapshot & {
  status: "ok" | "degraded" | "error";
  oldestQueuedAgeMs: number | null;
  maxQueueWaitMs: number;
  reasons: string[];
};

function configuredMaxQueueWaitMs(environment: Readonly<Record<string, string | undefined>>) {
  const raw = environment.FLOOR_PLAN_QUEUE_MAX_WAIT_SECONDS?.trim();
  if (!raw) return DEFAULT_MAX_QUEUE_WAIT_MS;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 30 || seconds > 86_400) {
    throw new Error(
      "FLOOR_PLAN_QUEUE_MAX_WAIT_SECONDS must be between 30 and 86400 seconds"
    );
  }
  return Math.round(seconds * 1_000);
}

export function assessFloorPlanQueueHealth(input: {
  snapshot: FloorPlanQueueSnapshot;
  now?: Date;
  environment?: Readonly<Record<string, string | undefined>>;
}): FloorPlanQueueHealth {
  const now = input.now ?? new Date();
  const maxQueueWaitMs = configuredMaxQueueWaitMs(input.environment ?? process.env);
  const oldestQueuedAgeMs = input.snapshot.oldestQueuedAt
    ? Math.max(0, now.getTime() - input.snapshot.oldestQueuedAt.getTime())
    : null;
  const reasons: string[] = [];
  const workerActivationGraceMs = Math.min(maxQueueWaitMs, 60_000);
  if (input.snapshot.expiredLeases > 0) {
    reasons.push(`${input.snapshot.expiredLeases} expired worker lease(s) need recovery`);
  }
  if (oldestQueuedAgeMs !== null && oldestQueuedAgeMs > maxQueueWaitMs) {
    reasons.push("oldest queued import exceeded the processing SLO");
  }
  if (
    input.snapshot.queued > 0 &&
    input.snapshot.active === 0 &&
    oldestQueuedAgeMs !== null &&
    oldestQueuedAgeMs > workerActivationGraceMs
  ) {
    reasons.push("queued imports have no active worker lease");
  }

  return {
    ...input.snapshot,
    status:
      input.snapshot.expiredLeases > 0
        ? "error"
        : reasons.length > 0
          ? "degraded"
          : "ok",
    oldestQueuedAgeMs,
    maxQueueWaitMs,
    reasons,
  };
}
