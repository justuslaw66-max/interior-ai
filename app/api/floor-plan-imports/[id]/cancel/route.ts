import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelOwnedFloorPlanImport } from "@/lib/floor-plan-imports/owner-cancel";

export const runtime = "nodejs";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** The owner cancels an unfinished upload, which also stops a read under way (owner-cancel.ts). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const { id } = await params;

  const outcome = await cancelOwnedFloorPlanImport({ id, userId });
  if (outcome === "not_found") return error("Floor-plan import not found", 404);
  if (outcome === "too_late") return error("This floor-plan import can no longer be cancelled", 409);

  return NextResponse.json(
    { ok: true, job: { id, status: "failed", progress: 100, cancelled: true } },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
