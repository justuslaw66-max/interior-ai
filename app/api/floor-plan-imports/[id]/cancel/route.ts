import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FLOOR_PLAN_IMPORT_PROGRESS } from "@/lib/floor-plan-imports/status";

export const runtime = "nodejs";

const CANCELLABLE_STATUSES = [
  "received",
  "rendered",
  "extracted",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
] as const;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const { id } = await params;
  const now = new Date();

  const cancelled = await prisma.floorPlanImportJob.updateMany({
    where: {
      id,
      userId,
      status: { in: [...CANCELLABLE_STATUSES] },
      appliedDesignId: null,
      revision: null,
      OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: {
      status: "failed",
      progress: FLOOR_PLAN_IMPORT_PROGRESS.failed,
      errorMessage: "Cancelled by owner",
      leaseToken: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    },
  });
  if (cancelled.count !== 1) {
    const owned = await prisma.floorPlanImportJob.findFirst({
      where: { id, userId },
      select: { id: true, status: true, leaseToken: true, leaseExpiresAt: true },
    });
    if (!owned) return error("Floor-plan import not found", 404);
    if (owned.leaseToken && owned.leaseExpiresAt && owned.leaseExpiresAt > now) {
      return error("This import is being processed. Try cancelling after the current stage.", 409);
    }
    return error("This floor-plan import can no longer be cancelled", 409);
  }

  return NextResponse.json(
    { ok: true, job: { id, status: "failed", progress: 100, cancelled: true } },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
