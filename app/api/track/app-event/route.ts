import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { APP_EVENT_TYPES, logAppEvent, type AppEventType } from "@/lib/app-events";
import { rateLimit } from "@/lib/rateLimit";

const ALLOWED = new Set<AppEventType>(APP_EVENT_TYPES);

function getClientIp(req: Request) {
  const header = req.headers.get("x-forwarded-for") || "";
  return header.split(",")[0].trim() || "unknown";
}

export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json().catch(() => ({}));
  const { eventType, designId, shareToken, meta } = body ?? {};

  if (typeof eventType !== "string" || !ALLOWED.has(eventType as AppEventType)) {
    return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
  }

  const key = session?.user?.id
    ? `user:${session.user.id}:app-event`
    : `ip:${getClientIp(req)}:app-event`;
  const rl = rateLimit(key, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const result = await logAppEvent({
    eventType: eventType as AppEventType,
    userId: session?.user?.id ?? null,
    designId: typeof designId === "string" ? designId : null,
    shareToken: typeof shareToken === "string" ? shareToken : null,
    meta: typeof meta === "object" && meta ? meta : null,
  });

  return NextResponse.json({
    ok: true,
    persisted: result.persisted,
    eventId: result.eventId,
  });
}
