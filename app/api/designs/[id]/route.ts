import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { trackServerEvent } from "@/lib/server-analytics";
import { buildDesignUpdatePayload } from "@/lib/design-route-payload";
import { sanitizePrivateFloorPlanUnderlayForSave } from "@/lib/floor-plan-imports/retention";
import { projectSharedStoredDesign } from "@/lib/shared-design-snapshot";
import { syncFloorPlanDesignReference } from "@/lib/floor-plan-design-reference";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";
import { logOperationalEvent } from "@/lib/observability";

class DesignRevisionConflictError extends Error {}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const operation = "design.get";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const { id } = await params;
    const session = await auth();
    const requestedShareToken = new URL(req.url).searchParams.get("shareToken");
    const design = await prisma.design.findUnique({
      where: { id },
    });

    if (!design) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");

    const isOwner = Boolean(session?.user?.id && design.userId === session.user.id);
    const hasValidShareToken = Boolean(
      requestedShareToken &&
        design.shareEnabled &&
        design.shareToken &&
        requestedShareToken === design.shareToken
    );

    if (!isOwner && !hasValidShareToken) {
      // Return the same response as a missing object so IDs cannot be probed.
      throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");
    }

    const responseSnapshot = isOwner
      ? design.snapshot ?? null
      : projectSharedStoredDesign(design.snapshot);

    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 200,
      meta: { access: isOwner ? "owner" : "shared" },
    });
    return NextResponse.json({
      id: design.id,
      title: design.title,
      roomWidth: design.roomWidth,
      roomDepth: design.roomDepth,
      items: design.items,
      snapshot: responseSnapshot,
      zones: design.zones ?? [],
      savedViews: design.savedViews ?? [],
      style: design.style,
      budget: design.budget,
      mode: design.mode,
      notes: design.notes,
      updatedAt: design.updatedAt,
      shareToken: isOwner ? design.shareToken : null,
      shareEnabled: isOwner ? design.shareEnabled : hasValidShareToken,
    }, { headers: apiSuccessHeaders(operationId) });
  } catch (err) {
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const operation = "design.update";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }
    const userId = session.user.id;

    const design = await prisma.design.findFirst({ where: { id, userId } });
    if (!design) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");

    const body = await readJsonRequest(req, 5 * 1024 * 1024);
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const items = payload.items;
    const expectedUpdatedAt = payload.expectedUpdatedAt;
    if (
      expectedUpdatedAt !== undefined &&
      (typeof expectedUpdatedAt !== "string" ||
        !Number.isFinite(Date.parse(expectedUpdatedAt)))
    ) {
      throw new ApiBoundaryError(
        400,
        "BAD_REQUEST",
        "expectedUpdatedAt must be a valid revision timestamp."
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const isProUser = user?.plan === "pro";
    const itemsArr = Array.isArray(items) ? items : [];
    if (!isProUser && itemsArr.length > 20) {
        throw new ApiBoundaryError(403, "FORBIDDEN", "Free beta limit: max 20 items per design.");
    }

    const updatePayload = buildDesignUpdatePayload(payload);
    if (!updatePayload.ok) {
      throw new ApiBoundaryError(updatePayload.status, "BAD_REQUEST", updatePayload.error);
    }
    const updateData = updatePayload.value;
    if (updateData.items) updateData.items = updateData.items as Prisma.InputJsonValue;
    if (updateData.zones) updateData.zones = updateData.zones as Prisma.InputJsonValue;
    if (updateData.savedViews) updateData.savedViews = updateData.savedViews as Prisma.InputJsonValue;
    const updated = await prisma.$transaction(async (transaction) => {
      if (updateData.snapshot) {
        updateData.snapshot = (
          await sanitizePrivateFloorPlanUnderlayForSave({
            snapshot: updateData.snapshot,
            ownerUserId: userId,
            client: transaction,
          })
        ).snapshot as Prisma.InputJsonValue;
      }
      let saved;
      if (typeof expectedUpdatedAt === "string") {
        const result = await transaction.design.updateMany({
          where: {
            id,
            userId,
            updatedAt: new Date(expectedUpdatedAt),
          },
          data: updateData,
        });
        if (result.count !== 1) {
          throw new DesignRevisionConflictError(
            "This design changed in another session. Reload it before saving again."
          );
        }
        saved = await transaction.design.findUniqueOrThrow({ where: { id } });
      } else {
        const result = await transaction.design.updateMany({
          where: { id, userId },
          data: updateData,
        });
        if (result.count !== 1) {
          throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");
        }
        saved = await transaction.design.findFirstOrThrow({ where: { id, userId } });
      }
      await syncFloorPlanDesignReference({
        client: transaction,
        designId: saved.id,
        ownerUserId: userId,
        snapshot: saved.snapshot,
      });
      return saved;
    });

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
    if (err instanceof DesignRevisionConflictError) {
      return apiErrorResponse(
        new ApiBoundaryError(409, "CONFLICT", err.message),
        { operation, operationId, startedAt }
      );
    }
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const operation = "design.delete";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }

    const design = await prisma.design.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!design) throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");

    const deleted = await prisma.design.deleteMany({
      where: { id, userId: session.user.id },
    });
    if (deleted.count !== 1) {
      throw new ApiBoundaryError(404, "NOT_FOUND", "Design not found.");
    }

    trackServerEvent("design_deleted", session.user.id, {
      design_id: id,
      style: design.style ?? null,
      budget: design.budget ?? null,
      mode: design.mode ?? null,
    });

    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 200,
    });
    return NextResponse.json({ ok: true }, { headers: apiSuccessHeaders(operationId) });
  } catch (err) {
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}
