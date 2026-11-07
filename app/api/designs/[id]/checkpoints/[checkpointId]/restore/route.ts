import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { recordDesignCheckpoint, restoredDesignData } from "@/lib/design-checkpoints";
import { sanitizePrivateFloorPlanUnderlayForSave } from "@/lib/floor-plan-imports/retention";
import { FloorPlanDesignReferenceSyncError, syncFloorPlanDesignReference } from "@/lib/floor-plan-design-reference";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";
import { logOperationalEvent } from "@/lib/observability";

class DesignRevisionConflictError extends Error {}

const CHANGED_ELSEWHERE = "This design changed in another session. Reload it before restoring an earlier version.";

/** Keeps the design as it stands, then writes the earlier version over it, on the expected revision. */
async function restoreCheckpointInTransaction(
  transaction: Prisma.TransactionClient,
  input: { designId: string; checkpointId: string; userId: string; expectedUpdatedAt: string }
) {
  const { designId: id, checkpointId, userId } = input;
  const design = await transaction.design.findFirst({ where: { id, userId } });
  if (!design) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");
  if (design.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt)) throw new DesignRevisionConflictError(CHANGED_ELSEWHERE);
  const checkpoint = await transaction.designCheckpoint.findFirst({ where: { id: checkpointId, designId: id } });
  if (!checkpoint) throw new ApiBoundaryError(404, "NOT_FOUND", "That earlier version is no longer kept.");

  const items = Array.isArray(checkpoint.items) ? checkpoint.items : [];
  if (items.length > 20) {
    const user = await transaction.user.findUnique({ where: { id: userId }, select: { plan: true } });
    if (user?.plan !== "pro") throw new ApiBoundaryError(403, "FORBIDDEN", "Free beta limit: max 20 items per design.");
  }
  await recordDesignCheckpoint(transaction, design.id, "restore");
  const data = restoredDesignData(checkpoint, design);
  if (data.snapshot) {
    data.snapshot = (
      await sanitizePrivateFloorPlanUnderlayForSave({ snapshot: data.snapshot, ownerUserId: userId, client: transaction })
    ).snapshot as Prisma.InputJsonValue;
  }
  const result = await transaction.design.updateMany({ where: { id, userId, updatedAt: design.updatedAt }, data });
  if (result.count !== 1) throw new DesignRevisionConflictError(CHANGED_ELSEWHERE);
  const saved = await transaction.design.findUniqueOrThrow({ where: { id } });
  await syncFloorPlanDesignReference({
    client: transaction,
    designId: saved.id,
    ownerUserId: userId,
    snapshot: saved.snapshot, previousSnapshot: design.snapshot,
  });
  return saved;
}

/**
 * Restores one of the design's earlier versions on the revision the editor holds. The design as
 * it stands is kept as a checkpoint first, so the restore can itself be undone.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; checkpointId: string }> }
) {
  const operation = "design.checkpoints.restore";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const { id, checkpointId } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }
    const userId = session.user.id;
    const body = await readJsonRequest(req, 4 * 1024);
    const expectedUpdatedAt = body && typeof body === "object"
      ? (body as Record<string, unknown>).expectedUpdatedAt
      : undefined;
    if (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "expectedUpdatedAt must be a valid revision timestamp.");
    }

    // A version is read and written whole (up to 5 MB), so this transaction gets more than the default 5 s.
    const updated = await prisma.$transaction((transaction) =>
      restoreCheckpointInTransaction(transaction, { designId: id, checkpointId, userId, expectedUpdatedAt }),
    { timeout: 20_000 });

    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 200,
    });
    return NextResponse.json(
      { id: updated.id, updatedAt: updated.updatedAt },
      { headers: apiSuccessHeaders(operationId) }
    );
  } catch (err) {
    if (err instanceof FloorPlanDesignReferenceSyncError) {
      // The version's floor plan was replaced or removed since, so it can't come back as it was.
      return apiErrorResponse(new ApiBoundaryError(409, "CONFLICT",
        "This version's floor plan is no longer available, so it can't be restored."), { operation, operationId, startedAt });
    }
    if (err instanceof DesignRevisionConflictError) {
      return apiErrorResponse(new ApiBoundaryError(409, "CONFLICT", err.message), { operation, operationId, startedAt });
    }
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}
