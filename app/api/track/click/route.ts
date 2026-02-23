import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import crypto from "crypto";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";

function makeClickKey() {
  return crypto.randomBytes(16).toString("base64url");
}

export async function POST(req: Request) {
  const session = await auth();

  const body = await req.json();
  const { designId, productId, price, retailer, buyUrl } = body ?? {};

  if (typeof productId !== "string" || productId.length < 3) {
    return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
  }

  const clickKey = makeClickKey();

  await prisma.productClick.create({
    data: {
      clickKey,
      userId: session?.user?.id ?? null,
      designId: typeof designId === "string" ? designId : null,
      productId,
      price: typeof price === "number" ? Math.round(price) : null,
      retailer: typeof retailer === "string" ? retailer : null,
      buyUrl: typeof buyUrl === "string" ? buyUrl : null,
    },
  });

  // Server-side PostHog tracking for product click (affiliate tracking)
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: session?.user?.id ?? "anonymous",
    event: "product_clicked",
    properties: {
      click_key: clickKey,
      design_id: designId ?? null,
      product_id: productId,
      price: typeof price === "number" ? price : null,
      retailer: retailer ?? null,
    },
  });

  return NextResponse.json({ ok: true, clickKey });
}
