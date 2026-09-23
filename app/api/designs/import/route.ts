import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
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

const MAX_IMPORT_DESIGNS = 10;

export async function POST(req: Request) {
  const operation = "design.import";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
    }

    const body = await readJsonRequest(req, 5 * 1024 * 1024);
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
    if (!Array.isArray(payload.designs)) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "Import must contain a designs array.");
    }
    if (payload.designs.length > MAX_IMPORT_DESIGNS) {
      throw new ApiBoundaryError(
        400,
        "BAD_REQUEST",
        `Import supports at most ${MAX_IMPORT_DESIGNS} designs at a time.`
      );
    }
    if (payload.designs.length === 0) {
      return NextResponse.json(
        { ok: true, created: 0 },
        { headers: apiSuccessHeaders(operationId) }
      );
    }

    const parsedDesigns = payload.designs.map((entry, index) => {
      const parsed = parseDesignCreatePayload(entry);
      if (!parsed.ok) {
        throw new ApiBoundaryError(
          400,
          "BAD_REQUEST",
          `Design ${index + 1} is invalid: ${parsed.error}`
        );
      }
      return parsed.value;
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const isProUser = user?.plan === "pro";
    if (!isProUser) {
      const existingCount = await prisma.design.count({ where: { userId } });
      if (existingCount + parsedDesigns.length > 20) {
        throw new ApiBoundaryError(
          403,
          "FORBIDDEN",
          "Free beta limit reached (max 20 designs). Upgrade to import more."
        );
      }
      if (parsedDesigns.some((design) => Array.isArray(design.items) && design.items.length > 20)) {
        throw new ApiBoundaryError(
          403,
          "FORBIDDEN",
          "Free beta limit: max 20 items per design."
        );
      }
    }

    const created = await prisma.$transaction(async (transaction) => {
      const results = [];
      for (const design of parsedDesigns) {
        const snapshot = design.snapshot
          ? (
              await sanitizePrivateFloorPlanUnderlayForSave({
                snapshot: design.snapshot,
                ownerUserId: userId,
                client: transaction,
              })
            ).snapshot
          : null;
        const stored = await transaction.design.create({
          data: {
            user: { connect: { id: userId } },
            title: design.title,
            roomWidth: design.roomWidth,
            roomDepth: design.roomDepth,
            items: design.items as Prisma.InputJsonValue,
            zones: design.zones as Prisma.InputJsonValue,
            savedViews: design.savedViews as Prisma.InputJsonValue,
            ...(snapshot ? { snapshot: snapshot as Prisma.InputJsonValue } : {}),
            style: design.style,
            budget: design.budget,
            mode: design.mode,
            notes: design.notes,
            shareEnabled: false,
            shareToken: null,
          },
        });
        await syncFloorPlanDesignReference({
          client: transaction,
          designId: stored.id,
          ownerUserId: userId,
          snapshot: stored.snapshot,
        });
        results.push(stored);
      }
      return results;
    });

    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 200,
      meta: { createdCount: created.length },
    });
    return NextResponse.json(
      { ok: true, created: created.length },
      { headers: apiSuccessHeaders(operationId) }
    );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
