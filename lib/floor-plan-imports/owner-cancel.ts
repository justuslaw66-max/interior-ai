import { prisma } from "@/lib/prisma";
import { FLOOR_PLAN_IMPORT_PROGRESS } from "./status";
import type { FloorPlanImportStatus } from "./types";

/** Unfinished uploads the owner may cancel. One that made a design or a revision is past cancelling. */
export const FLOOR_PLAN_OWNER_CANCELLABLE_STATUSES = [
  "received",
  "rendered",
  "extracted",
  "selecting_page",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
] as const satisfies readonly FloorPlanImportStatus[];

/** `already_stopped`: the job had failed or been cancelled before, so a repeated cancel is answered the same way. */
export type FloorPlanOwnerCancelOutcome = "cancelled" | "already_stopped" | "too_late" | "not_found";

type OwnedJobLease = { status: string; leaseToken: string | null; leaseExpiresAt: Date | null };

/** The two job calls the cancel makes, as on Prisma's client or a test's stand-in for it. */
type OwnerCancelClient = {
  floorPlanImportJob: {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    findFirst(args: {
      where: Record<string, unknown>;
      select: { status: true; leaseToken: true; leaseExpiresAt: true };
    }): Promise<OwnedJobLease | null>;
  };
};

/** One try: the job as read, then a cancel that only lands if its lease is still the one read. */
async function cancelOnce(jobs: OwnerCancelClient["floorPlanImportJob"], input: { id: string; userId: string }, now: Date) {
  const job = await jobs.findFirst({
    where: { id: input.id, userId: input.userId },
    select: { status: true, leaseToken: true, leaseExpiresAt: true },
  });
  if (!job) return "not_found" as const;
  if (job.status === "failed") return "already_stopped" as const;
  const reading = Boolean(job.leaseToken && job.leaseExpiresAt && job.leaseExpiresAt > now);
  const cancelled = await jobs.updateMany({
    where: {
      id: input.id,
      userId: input.userId,
      status: { in: [...FLOOR_PLAN_OWNER_CANCELLABLE_STATUSES] },
      appliedDesignId: null,
      revision: null,
      leaseToken: job.leaseToken,
    },
    data: {
      status: "failed",
      statusChangedAt: now,
      progress: FLOOR_PLAN_IMPORT_PROGRESS.failed,
      errorMessage: "Cancelled by owner",
      leaseToken: null,
      leaseOwner: null,
      // Without its token the lease is no worker's, but the worker can take until then to stop:
      // privacy.ts holds back purges of the job's files till this time passes.
      leaseExpiresAt: reading ? job.leaseExpiresAt : null,
      nextAttemptAt: null,
    },
  });
  return cancelled.count === 1 ? "cancelled" as const : job;
}

/**
 * The owner cancels an unfinished upload, including one a worker is reading now (J, 31 Oct): it
 * used to wait for the read to finish. Taking the lease away stops that worker. Its next write is
 * refused (each one checks the lease and the status it left, prisma-repository.ts), and so is its
 * next heartbeat (every 30 s, lease.ts), which aborts the read and kills the vectorizer. A
 * cancelled job is "failed", which no worker claims again.
 */
export async function cancelOwnedFloorPlanImport(
  input: { id: string; userId: string; now?: Date },
  // Prisma's client by default; typed as unknown, as lease.ts and prisma-repository.ts do, so a test can pass its stand-in.
  client: unknown = prisma
): Promise<FloorPlanOwnerCancelOutcome> {
  const jobs = (client as OwnerCancelClient).floorPlanImportJob;
  const now = input.now ?? new Date();
  // A worker claiming or releasing the job between the read and the cancel changes its lease: read again.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const outcome = await cancelOnce(jobs, input, now);
    if (typeof outcome === "string") return outcome;
    const again = await jobs.findFirst({
      where: { id: input.id, userId: input.userId },
      select: { status: true, leaseToken: true, leaseExpiresAt: true },
    });
    if (!again) return "not_found";
    if (again.leaseToken === outcome.leaseToken) return again.status === "failed" ? "already_stopped" : "too_late";
  }
  return "too_late";
}
