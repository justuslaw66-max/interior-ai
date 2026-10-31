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

export type FloorPlanOwnerCancelOutcome = "cancelled" | "too_late" | "not_found";

/** The two job calls the cancel makes, as on Prisma's client or a test's stand-in for it. */
type OwnerCancelClient = {
  floorPlanImportJob: {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    findFirst(args: { where: Record<string, unknown>; select: { id: true } }): Promise<{ id: string } | null>;
  };
};

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
  const cancelled = await jobs.updateMany({
    where: {
      id: input.id,
      userId: input.userId,
      status: { in: [...FLOOR_PLAN_OWNER_CANCELLABLE_STATUSES] },
      appliedDesignId: null,
      revision: null,
    },
    data: {
      status: "failed",
      statusChangedAt: now,
      progress: FLOOR_PLAN_IMPORT_PROGRESS.failed,
      errorMessage: "Cancelled by owner",
      leaseToken: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    },
  });
  if (cancelled.count === 1) return "cancelled";
  const owned = await jobs.findFirst({ where: { id: input.id, userId: input.userId }, select: { id: true } });
  return owned ? "too_late" : "not_found";
}
