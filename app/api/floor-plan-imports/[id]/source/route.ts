import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import {
  FloorPlanRetentionError,
  PrismaFloorPlanRetentionService,
} from "@/lib/floor-plan-imports/retention";

export const runtime = "nodejs";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Database bytes are tombstoned immediately. External objects are durably
 * queued and return 202; a separate leased worker tombstones their asset rows
 * only after the private object store confirms deletion.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return error("Unauthorized", 401);
  const allowance = rateLimit(`floor-plan-source-delete:${userId}`, 12, 60_000);
  if (!allowance.ok) return error("Too many source deletion requests", 429);
  const { id } = await params;

  try {
    const result = await new PrismaFloorPlanRetentionService().requestOwnerDeletion({
      jobId: id,
      ownerUserId: userId,
    });
    const sourceContentDeleted =
      result.sourceContentDeleted || result.sourceAlreadyDeleted;
    const deletionQueued = result.externalContentQueued > 0;
    if (
      !deletionQueued &&
      (result.externalContentSkipped > 0 || !sourceContentDeleted)
    ) {
      return error(
        "External source deletion could not be queued; contact support before retrying",
        503
      );
    }
    return NextResponse.json(
      {
        ok: true,
        deletionState: deletionQueued ? "queued" : "deleted",
        sourceContentDeleted,
        derivedContentDeleted: result.derivedContentDeleted,
        externalContentQueued: result.externalContentQueued,
        externalContentSkipped: result.externalContentSkipped,
        designUnderlaysScrubbed: result.designUnderlaysScrubbed,
        persistedUnderlayCleared: result.designUnderlaysScrubbed > 0,
        affectedImportCount: result.affectedJobIds.length,
        designPreserved: true,
      },
      {
        status: deletionQueued ? 202 : 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (cause) {
    if (cause instanceof FloorPlanRetentionError) {
      if (cause.code === "not_found" || cause.code === "owner_boundary") {
        return error("Floor-plan import not found", 404);
      }
      return error(cause.message, 409);
    }
    console.error("Private floor-plan source deletion failed", cause);
    return error("Unable to delete the private floor-plan source", 500);
  }
}
