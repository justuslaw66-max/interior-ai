import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { trackServerEvent } from "@/lib/server-analytics";
import { config } from "@/lib/config";
import { parseDesignCreatePayload } from "@/lib/design-route-payload";
import { sanitizePrivateFloorPlanUnderlayForSave } from "@/lib/floor-plan-imports/retention";
import { syncFloorPlanDesignReference } from "@/lib/floor-plan-design-reference";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";
import { logOperationalEvent } from "@/lib/observability";

export const runtime = "nodejs";

export async function GET(_req: Request) {
  const operation = "design.list";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const session = await auth();

    if (!session?.user?.id) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }
    const userId = session.user.id;

    const designs = await prisma.design.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 200,
      meta: { resultCount: designs.length },
    });
    return NextResponse.json(designs, {
      status: 200,
      headers: apiSuccessHeaders(operationId),
    });
  } catch (err) {
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}

export async function POST(req: Request) {
  const operation = "design.create";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const session = await auth();

    if (!session?.user?.id) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }
    const userId = session.user.id;

    const body = await readJsonRequest(req, 5 * 1024 * 1024);
    const parsed = parseDesignCreatePayload(body);
    const rawPayload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

    if (config.logLevel === "debug") {
      console.log("Received design payload:", {
        titleType: typeof rawPayload.title,
        roomWidth: rawPayload.roomWidth,
        roomDepth: rawPayload.roomDepth,
        itemsLength: Array.isArray(rawPayload.items) ? rawPayload.items.length : null,
        hasSnapshot: Boolean(rawPayload.snapshot),
      });
    }

    if (!parsed.ok) {
      if (config.logLevel === "debug") {
        console.log("Validation failed:", {
          roomWidthType: typeof rawPayload.roomWidth,
          roomDepthType: typeof rawPayload.roomDepth,
          itemsIsArray: Array.isArray(rawPayload.items),
        });
      }
      throw new ApiBoundaryError(parsed.status, "BAD_REQUEST", parsed.error);
    }
    const payload = parsed.value;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const isProUser = user?.plan === "pro";

    if (!isProUser) {
      const count = await prisma.design.count({
        where: { userId },
      });
      if (count >= 20) {
        throw new ApiBoundaryError(
          403,
          "FORBIDDEN",
          "Free beta limit reached (max 20 designs). Upgrade to create more."
        );
      }
    }

    const design = await prisma.$transaction(async (transaction) => {
      const snapshot = payload.snapshot
        ? (
            await sanitizePrivateFloorPlanUnderlayForSave({
              snapshot: payload.snapshot,
              ownerUserId: userId,
              client: transaction,
            })
          ).snapshot
        : null;
      const created = await transaction.design.create({
        data: {
          title: payload.title,
          roomWidth: payload.roomWidth,
          roomDepth: payload.roomDepth,
          items: payload.items as Prisma.InputJsonValue,
          ...(snapshot
            ? { snapshot: snapshot as Prisma.InputJsonValue }
            : {}),
          zones: payload.zones as Prisma.InputJsonValue,
          savedViews: payload.savedViews as Prisma.InputJsonValue,
          user: { connect: { id: userId } },
          style: payload.style,
          budget: payload.budget,
          mode: payload.mode,
          notes: payload.notes,
        },
      });
      await syncFloorPlanDesignReference({
        client: transaction,
        designId: created.id,
        ownerUserId: userId,
        snapshot: created.snapshot,
      });
      return created;
    });

    if (config.logLevel === "debug") {
      console.log("Design created successfully:", design.id);
    }

    trackServerEvent("design_created", userId, {
      design_id: design.id,
      items_count: Array.isArray(rawPayload.items) ? rawPayload.items.length : 0,
      style: payload.style,
      budget: payload.budget,
      mode: payload.mode,
      room_width: payload.roomWidth,
      room_depth: payload.roomDepth,
      is_pro: isProUser,
    });

    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 201,
      meta: { itemCount: Array.isArray(payload.items) ? payload.items.length : 0 },
    });
    return NextResponse.json(
      { id: design.id, updatedAt: design.updatedAt },
      { status: 201, headers: apiSuccessHeaders(operationId) }
    );
  } catch (err) {
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}

export async function DELETE() {
  const operation = "design.delete_all";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const session = await auth();

    if (!session?.user?.id) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }

    const result = await prisma.design.deleteMany({
      where: { userId: session.user.id },
    });

    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 200,
      meta: { deletedCount: result.count },
    });
    return NextResponse.json(
      { deleted: result.count },
      { status: 200, headers: apiSuccessHeaders(operationId) }
    );
  } catch (err) {
    return apiErrorResponse(err, { operation, operationId, startedAt });
  }
}
