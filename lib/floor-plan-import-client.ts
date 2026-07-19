import type { FloorPlanImportStatus } from "@/lib/floor-plan-imports/types";

export const ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY =
  "interior-ai:active-floor-plan-import:v1";

export const RESUMABLE_FLOOR_PLAN_IMPORT_STATUSES = new Set<FloorPlanImportStatus>([
  "received",
  "rendered",
  "extracted",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
  "ready",
]);

export const PAUSED_FLOOR_PLAN_IMPORT_STATUSES = new Set<FloorPlanImportStatus>([
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
};

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
      const aborted = new Error("Floor-plan import polling was cancelled");
      aborted.name = "AbortError";
      throw aborted;
    }
    input.onProgress?.(job);
    await wait(intervalMs);
    if (input.signal?.aborted) {
      const aborted = new Error("Floor-plan import polling was cancelled");
      aborted.name = "AbortError";
      throw aborted;
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
