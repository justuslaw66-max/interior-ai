import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordBrowserAnalyticsEvent } from "@/lib/app-events";
import { ingestBrowserAppEvent } from "@/lib/browser-app-event-ingestion";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";

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
    const key = session?.user?.id
      ? `user:${session.user.id}:app-event`
      : `ip:${getClientIp(req)}:app-event`;
    const rl = rateLimit(key, 30, 60_000);
    if (!rl.ok) {
      throw new ApiBoundaryError(429, "RATE_LIMITED", "Too many requests.");
    }

    const result = await ingestBrowserAppEvent(
      body,
      { userId: session?.user?.id ?? null },
      {
        findSharedDesignId: async (shareToken) => {
          const shared = await prisma.design.findFirst({
            where: { shareToken, shareEnabled: true },
            select: { id: true },
          });
          return shared?.id ?? null;
        },
        findOwnedDesignId: async (designId, userId) => {
          const owned = await prisma.design.findFirst({
            where: { id: designId, userId },
            select: { id: true },
          });
          return owned?.id ?? null;
        },
        recordBrowserEvent: recordBrowserAnalyticsEvent,
      }
    );

    if (!result.ok) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid event type.");
    }

    return NextResponse.json(
      { ok: true, persisted: result.persisted, eventId: result.eventId },
      { headers: apiSuccessHeaders(operationId) }
    );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
