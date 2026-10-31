import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { cancelOwnedFloorPlanImport } from "@/lib/floor-plan-imports/owner-cancel";

export const runtime = "nodejs";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * The owner cancels an unfinished upload, which also stops a read under way (owner-cancel.ts). One
 * that had already failed or been cancelled answers 200 too, so a repeated cancel is harmless.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const allowance = rateLimit(`floor-plan-cancel:${userId}`, 30, 60_000);
  if (!allowance.ok) return error("Too many floor-plan cancellations", 429);
  const { id } = await params;

  const outcome = await cancelOwnedFloorPlanImport({ id, userId });
  if (outcome === "not_found") return error("Floor-plan import not found", 404);
  if (outcome === "too_late") return error("This floor-plan import can no longer be cancelled", 409);

  return NextResponse.json(
    { ok: true, job: { id, status: "failed", progress: 100, cancelled: outcome === "cancelled" } },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
