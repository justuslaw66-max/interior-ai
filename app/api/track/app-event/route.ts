import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAppEvent, AppEventType } from "@/lib/app-events";
import { rateLimit } from "@/lib/rateLimit";

const ALLOWED = new Set<AppEventType>([
  "share_link_opened",
  "export_opened",
  "export_printed",
  "export_pdf_clicked",
  "export_upgrade_prompt_shown",
  "upgrade_checkout_started",
  "upgrade_checkout_completed",
  "billing_portal_opened",
  "subscription_canceled",
]);

function getClientIp(req: Request) {
  const header = req.headers.get("x-forwarded-for") || "";
  return header.split(",")[0].trim() || "unknown";
}

export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json().catch(() => ({}));
  const { eventType, designId, shareToken, meta } = body ?? {};

  if (!ALLOWED.has(eventType)) {
    return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
  }

  const key = session?.user?.id
    ? `user:${session.user.id}:app-event`
    : `ip:${getClientIp(req)}:app-event`;
  const rl = rateLimit(key, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await logAppEvent({
    eventType,
    userId: session?.user?.id ?? null,
    designId: typeof designId === "string" ? designId : null,
    shareToken: typeof shareToken === "string" ? shareToken : null,
    meta: typeof meta === "object" && meta ? meta : null,
  });

  return NextResponse.json({ ok: true });
}
