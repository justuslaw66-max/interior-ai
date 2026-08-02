import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { APP_EVENT_TYPES, logAppEvent, type AppEventType } from "@/lib/app-events";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";

const ALLOWED = new Set<AppEventType>(APP_EVENT_TYPES);

function getClientIp(req: Request) {
  const header = req.headers.get("x-forwarded-for") || "";
  return header.split(",")[0].trim() || "unknown";
}

export async function POST(req: Request) {
  const operation = "telemetry.app_event";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
  const session = await auth();
  const body = await readJsonRequest(req, 16 * 1024);
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const { eventType, designId, shareToken, meta } = payload;

  if (typeof eventType !== "string" || !ALLOWED.has(eventType as AppEventType)) {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid event type.");
  }

  const key = session?.user?.id
    ? `user:${session.user.id}:app-event`
    : `ip:${getClientIp(req)}:app-event`;
  const rl = rateLimit(key, 30, 60_000);
  if (!rl.ok) {
    throw new ApiBoundaryError(429, "RATE_LIMITED", "Too many requests.");
  }

  let resolvedDesignId: string | null = null;
  let validatedShareToken: string | null = null;
  if (typeof shareToken === "string" && shareToken.length >= 20 && shareToken.length <= 128) {
    const shared = await prisma.design.findFirst({
      where: { shareToken, shareEnabled: true },
      select: { id: true },
    });
    if (shared) {
      resolvedDesignId = shared.id;
      validatedShareToken = shareToken;
    }
  } else if (
    session?.user?.id &&
    typeof designId === "string" &&
    designId.length > 0 &&
    designId.length <= 64
  ) {
    const owned = await prisma.design.findFirst({
      where: { id: designId, userId: session.user.id },
      select: { id: true },
    });
    resolvedDesignId = owned?.id ?? null;
  }

  const result = await logAppEvent({
    eventType: eventType as AppEventType,
    userId: session?.user?.id ?? null,
    designId: resolvedDesignId,
    shareToken: validatedShareToken,
    meta: typeof meta === "object" && meta && !Array.isArray(meta)
      ? meta as Record<string, unknown>
      : null,
  });

  return NextResponse.json(
    { ok: true, persisted: result.persisted, eventId: result.eventId },
    { headers: apiSuccessHeaders(operationId) }
  );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
