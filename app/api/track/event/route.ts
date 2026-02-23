import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const ALLOWED = new Set(["add_to_cart", "checkout", "purchase"]);

export const runtime = "nodejs";

export async function POST(req: Request) {
  await auth();

  const body = await req.json();
  const { clickKey, eventType, value, currency } = body ?? {};

  if (typeof clickKey !== "string" || clickKey.length < 10) {
    return NextResponse.json({ error: "Invalid clickKey" }, { status: 400 });
  }
  if (!ALLOWED.has(String(eventType))) {
    return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
  }

  await prisma.conversionEvent.create({
    data: {
      clickKey,
      eventType: String(eventType),
      value: typeof value === "number" ? value : null,
      currency: typeof currency === "string" ? currency : null,
    },
  });

  return NextResponse.json({ ok: true });
}
