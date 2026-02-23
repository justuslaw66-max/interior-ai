import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import crypto from "crypto";
import { getPostHogClient } from "@/lib/posthog-server";
import { rateLimit } from "@/lib/rateLimit";
import { logAppEvent } from "@/lib/app-events";
import { sendShareLinkEmail } from "@/lib/email";

function makeToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(_req.url);
  const regenerate = url.searchParams.get("regenerate") === "1";
  const body = await _req.json().catch(() => ({}));
  const recipientEmail = typeof body?.email === "string" ? body.email : null;
  const recipientName = typeof body?.recipientName === "string" ? body.recipientName : null;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`share:${session.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many share requests" }, { status: 429 });
  }

  const design = await prisma.design.findUnique({
    where: { id },
    select: { id: true, title: true, userId: true, shareToken: true, shareEnabled: true },
  });

  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (design.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!regenerate && design.shareEnabled && design.shareToken) {
    return NextResponse.json({ shareToken: design.shareToken });
  }

  let token = regenerate ? makeToken() : design.shareToken ?? makeToken();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const updated = await prisma.design.update({
        where: { id },
        data: { shareEnabled: true, shareToken: token },
        select: { shareToken: true },
      });

      // Server-side PostHog tracking for share link enabled (viral growth)
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: session.user.id,
        event: "share_link_enabled",
        properties: {
          design_id: id,
          is_regenerate: regenerate,
        },
      });

      await logAppEvent({
        eventType: "share_link_created",
        userId: session.user.id,
        designId: id,
        shareToken: updated.shareToken,
        meta: { regenerate },
      });

      if (recipientEmail) {
        const origin = _req.headers.get("origin") || process.env.APP_ORIGIN || "http://localhost:3000";
        const shareUrl = `${origin}/share/${updated.shareToken}`;
        try {
          await sendShareLinkEmail({
            to: recipientEmail,
            designTitle: design.title || "Interior AI Design",
            shareUrl,
            senderName: recipientName ?? session.user.name ?? null,
          });
        } catch (err) {
          console.warn("Share email failed:", err instanceof Error ? err.message : err);
        }
      }

      return NextResponse.json({ shareToken: updated.shareToken });
    } catch {
      token = makeToken();
    }
  }

  return NextResponse.json({ error: "Could not generate token" }, { status: 500 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const design = await prisma.design.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (design.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.design.update({
    where: { id },
    data: { shareEnabled: false },
    select: { shareEnabled: true },
  });

  return NextResponse.json(updated);
}
