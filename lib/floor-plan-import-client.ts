import type { FloorPlanImportStatus } from "@/lib/floor-plan-imports/types";

export const ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY =
  "interior-ai:active-floor-plan-import:v1";

export const RESUMABLE_FLOOR_PLAN_IMPORT_STATUSES = new Set<FloorPlanImportStatus>([
  "received",
  "rendered",
  "extracted",
  "selecting_page",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
  "ready",
]);

export const PAUSED_FLOOR_PLAN_IMPORT_STATUSES = new Set<FloorPlanImportStatus>([
  "selecting_page",
  "needs_review",
  "ready",
  "applied",
  "published",
  "failed",
]);

export function isPausedFloorPlanImportStatus(status: FloorPlanImportStatus) {
  return PAUSED_FLOOR_PLAN_IMPORT_STATUSES.has(status);
}

type PollableFloorPlanImportJob = {
  status: FloorPlanImportStatus;
  progress: number;
  leaseExpiresAt?: string | null;
  progressEstimate?: {
    pollAfterMs?: number;
  };
};

function abortError() {
  const aborted = new Error("Floor-plan import polling was cancelled");
  aborted.name = "AbortError";
  return aborted;
}

function visiblePollInterval(job: PollableFloorPlanImportJob) {
  if (
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    return 10_000;
  }
  const suggested = job.progressEstimate?.pollAfterMs;
  return typeof suggested === "number" && Number.isFinite(suggested)
    ? Math.max(750, Math.min(5_000, Math.round(suggested)))
    : 1_500;
}

function hasLiveLease(job: PollableFloorPlanImportJob, now = Date.now()) {
  const expiresAt = job.leaseExpiresAt
    ? Date.parse(job.leaseExpiresAt)
    : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/**
 * Starts processing without awaiting the long request, then immediately polls
 * the durable job. The starter promise is always observed so closing the
 * consumer workspace cannot create an unhandled rejection.
 */
export async function startAndPollFloorPlanImport<
  TJob extends PollableFloorPlanImportJob,
>(input: {
  initialJob: TJob;
  startProcessing: () => Promise<unknown>;
  loadJob: () => Promise<TJob>;
  onProgress?: (job: TJob) => void;
  signal?: AbortSignal;
  wait?: (intervalMs: number) => Promise<void>;
  now?: () => number;
  startFailureGraceMs?: number;
  isPaused?: (job: TJob) => boolean;
}) {
  const wait =
    input.wait ??
    ((durationMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  const now = input.now ?? Date.now;
  const startFailureGraceMs = input.startFailureGraceMs ?? 3_000;
  let startError: unknown = null;
  let startFailedAt: number | null = null;
  let job = input.initialJob;
  const isPaused =
    input.isPaused ?? ((candidate: TJob) =>
      isPausedFloorPlanImportStatus(candidate.status));
  const initialStatus = job.status;
  const initialProgress = job.progress;

  void input.startProcessing().catch((cause) => {
    startError = cause;
    startFailedAt = now();
  });

  let firstLoad = true;
  while (!isPaused(job)) {
    if (input.signal?.aborted) throw abortError();
    input.onProgress?.(job);
    if (!firstLoad) await wait(visiblePollInterval(job));
    firstLoad = false;
    if (input.signal?.aborted) throw abortError();
    job = await input.loadJob();

    const advanced =
      job.status !== initialStatus || job.progress > initialProgress;
    const failedLongEnough =
      startFailedAt !== null && now() - startFailedAt >= startFailureGraceMs;
    if (
      startError &&
      failedLongEnough &&
      !advanced &&
      !hasLiveLease(job, now())
    ) {
      throw startError;
    }
  }
  input.onProgress?.(job);
  return job;
}

export async function pollFloorPlanImportJobUntilPaused<
  TJob extends PollableFloorPlanImportJob,
>(input: {
  initialJob: TJob;
  loadJob: () => Promise<TJob>;
  onProgress?: (job: TJob) => void;
  intervalMs?: number;
  wait?: (intervalMs: number) => Promise<void>;
  signal?: AbortSignal;
}) {
  const intervalMs = input.intervalMs ?? 1_250;
  const wait = input.wait ?? ((durationMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, durationMs)));
  let job = input.initialJob;

  while (!isPausedFloorPlanImportStatus(job.status)) {
    if (input.signal?.aborted) {
      throw abortError();
    }
    input.onProgress?.(job);
    await wait(intervalMs);
    if (input.signal?.aborted) {
      throw abortError();
    }
    job = await input.loadJob();
  }

  return job;
}

export function isResumableFloorPlanImportStatus(status: FloorPlanImportStatus) {
  return RESUMABLE_FLOOR_PLAN_IMPORT_STATUSES.has(status);
}

export function readActiveFloorPlanImportId(storage: Pick<Storage, "getItem">) {
  const value = storage.getItem(ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)?.trim();
  return value && /^[a-z0-9_-]{8,160}$/i.test(value) ? value : null;
}

export function writeActiveFloorPlanImportId(
  storage: Pick<Storage, "setItem" | "removeItem">,
  jobId: string | null
) {
  if (jobId) storage.setItem(ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY, jobId);
  else storage.removeItem(ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY);
}
