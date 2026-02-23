import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json().catch(() => ({}));
  const { orderRef, designId, currency, total } = body ?? {};

  if (typeof orderRef !== "string" || orderRef.length < 3) {
    return NextResponse.json({ error: "Invalid orderRef" }, { status: 400 });
  }

  const userId = session?.user?.id ?? null;

  await prisma.shopifyOrder.upsert({
    where: { orderRef },
    update: {
      userId,
      designId: typeof designId === "string" ? designId : null,
      currency: typeof currency === "string" ? currency : null,
      total: typeof total === "number" ? total : null,
    },
    create: {
      orderRef,
      userId,
      designId: typeof designId === "string" ? designId : null,
      currency: typeof currency === "string" ? currency : null,
      total: typeof total === "number" ? total : null,
    },
  });

  // Server-side PostHog tracking for order confirmation (revenue event)
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: userId ?? "anonymous",
    event: "order_confirmed",
    properties: {
      order_ref: orderRef,
      design_id: designId ?? null,
      currency: currency ?? null,
      total: typeof total === "number" ? total : null,
    },
  });

  return NextResponse.json({ ok: true });
}
