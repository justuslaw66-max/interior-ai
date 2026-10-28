import {
  FLOOR_PLAN_IMPORT_STATUSES,
  type FloorPlanImportStatus,
} from "@/lib/floor-plan-imports/types";

export const ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY =
  "interior-ai:active-floor-plan-import:v1";

/** What the browser last heard about the stored upload, kept beside its id (which stays a plain string). */
export const ACTIVE_FLOOR_PLAN_IMPORT_HINT_STORAGE_KEY =
  "interior-ai:active-floor-plan-import-hint:v1";

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

/**
 * The stored upload as this browser last saw it: its status and file name, whether the server was still working on it,
 * and a short hash of the account it belongs to. It only decides what the upload window shows before the server
 * answers, and only for the same account; the job itself is always loaded before any action.
 */
export type FloorPlanImportHint = {
  id: string;
  status: FloorPlanImportStatus;
  fileName: string | null;
  /** An attempt is scheduled or a worker holds the lease: still being read, whatever the status says. */
  busy: boolean;
  account: string;
};

function isFloorPlanImportStatus(value: unknown): value is FloorPlanImportStatus {
  return FLOOR_PLAN_IMPORT_STATUSES.some((status) => status === value);
}

/** A short, stable hash (FNV-1a) of the account key, so the hint doesn't keep the account's id or email itself. */
export function floorPlanImportHintAccount(accountKey: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < accountKey.length; index++) {
    hash ^= accountKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** The hint for a job the window has just heard about. */
export function floorPlanImportHintFor(
  job: { id: string; status: FloorPlanImportStatus; nextAttemptAt: string | null; leaseExpiresAt: string | null;
    sourceAsset?: { fileName?: string } },
  accountKey: string,
  now = Date.now()
): FloorPlanImportHint {
  const leaseExpiresAt = job.leaseExpiresAt ? Date.parse(job.leaseExpiresAt) : Number.NaN;
  return {
    id: job.id,
    status: job.status,
    fileName: job.sourceAsset?.fileName ?? null,
    busy: Boolean(job.nextAttemptAt) || (Number.isFinite(leaseExpiresAt) && leaseExpiresAt > now),
    account: floorPlanImportHintAccount(accountKey),
  };
}

/** The hint for this upload and account, or null. Storage that can't be read means no hint. */
export function readFloorPlanImportHint(
  storage: Pick<Storage, "getItem">,
  jobId: string,
  accountKey: string
): FloorPlanImportHint | null {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(storage.getItem(ACTIVE_FLOOR_PLAN_IMPORT_HINT_STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { id, status, fileName, busy, account } = parsed as Record<string, unknown>;
  if (id !== jobId || !isFloorPlanImportStatus(status) || typeof busy !== "boolean") return null;
  if (account !== floorPlanImportHintAccount(accountKey)) return null;
  return {
    id: jobId,
    status,
    fileName: typeof fileName === "string" && fileName.trim() ? fileName.trim().slice(0, 200) : null,
    busy,
    account,
  };
}

/** Best effort: storage that is full or blocked leaves the hint as it was, and never fails an import. */
export function writeFloorPlanImportHint(
  storage: Pick<Storage, "setItem" | "removeItem">,
  hint: FloorPlanImportHint | null
) {
  try {
    if (hint) storage.setItem(ACTIVE_FLOOR_PLAN_IMPORT_HINT_STORAGE_KEY, JSON.stringify(hint));
    else storage.removeItem(ACTIVE_FLOOR_PLAN_IMPORT_HINT_STORAGE_KEY);
  } catch {
    // A missing or stale hint only means the window reopens the upload, as it did before hints.
  }
}

/** Uploads that wait on the person: offered to continue, not reopened by themselves. */
const WAITING_FOR_PERSON_STATUSES = new Set<FloorPlanImportStatus>([
  "selecting_page",
  "needs_review",
  "ready",
  "failed",
]);

/**
 * What the upload window does with the stored upload when it opens. An upload still being read
 * (by its status, or busy: a chosen page or a saved review waiting for the worker) reopens, as one
 * with no hint for this account does; one waiting on the person is offered as a card beside Choose a
 * file, so opening the window to upload a new plan doesn't first load the old one.
 */
export function planFloorPlanImportReopen(
  storedJobId: string | null,
  hint: FloorPlanImportHint | null
): { resumeJobId: string | null; lastUpload: FloorPlanImportHint | null } {
  if (!storedJobId) return { resumeJobId: null, lastUpload: null };
  if (!hint || hint.busy) return { resumeJobId: storedJobId, lastUpload: null };
  if (WAITING_FOR_PERSON_STATUSES.has(hint.status)) return { resumeJobId: null, lastUpload: hint };
  if (isPausedFloorPlanImportStatus(hint.status)) return { resumeJobId: null, lastUpload: null };
  return { resumeJobId: storedJobId, lastUpload: null };
}
