import { prisma } from "@/lib/prisma";
import type { AppEventType } from "@/lib/app-event-contract";
import { createHash } from "node:crypto";

export type { AppEventType } from "@/lib/app-event-contract";

export type AppEventPayload = {
  eventType: AppEventType;
  userId?: string | null;
  designId?: string | null;
  shareToken?: string | null;
  meta?: Record<string, unknown> | null;
  idempotencyKey?: string;
};

export type AppEventLogResult = {
  persisted: boolean;
  eventId: string | null;
  error?: string;
  duplicate?: boolean;
};

function eventIdFromIdempotencyKey(key: string) {
  return `evt_${createHash("sha256").update(key).digest("hex")}`;
}

export async function logAppEvent(payload: AppEventPayload) {
  try {
    const metaValue = payload.meta
      ? JSON.parse(JSON.stringify(payload.meta))
      : undefined;

    const event = await prisma.appEvent.create({
      data: {
        id: payload.idempotencyKey
          ? eventIdFromIdempotencyKey(payload.idempotencyKey)
          : undefined,
        eventType: payload.eventType,
        userId: payload.userId ?? null,
        designId: payload.designId ?? null,
        shareToken: payload.shareToken ?? null,
        meta: metaValue,
      },
    });

    return { persisted: true, eventId: event.id } satisfies AppEventLogResult;
  } catch (err) {
    const errorCode =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: unknown }).code
        : null;
    if (payload.idempotencyKey && errorCode === "P2002") {
      return {
        persisted: false,
        eventId: eventIdFromIdempotencyKey(payload.idempotencyKey),
        duplicate: true,
      } satisfies AppEventLogResult;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[AppEvent] Failed to log event:", message);
    return { persisted: false, eventId: null, error: message } satisfies AppEventLogResult;
  }
}
