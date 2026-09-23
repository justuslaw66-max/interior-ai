import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { rateLimit } from "@/lib/rateLimit";
import { ApiBoundaryError, apiErrorResponse, createOperationId, readJsonRequest } from "@/lib/api-boundary";

const ALLOWED = new Set(["add_to_cart", "checkout", "purchase"]);

export const runtime = "nodejs";

export async function POST(req: Request) {
  const operation = "commerce.test_conversion_event";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      throw new ApiBoundaryError(404, "NOT_FOUND", "Not found.");
    }
    const rl = rateLimit(`test-conversion:${session.user.id ?? session.user.email}`, 30, 60_000);
    if (!rl.ok) throw new ApiBoundaryError(429, "RATE_LIMITED", "Too many test events.");

    const body = await readJsonRequest(req, 4 * 1024);
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const clickKey = typeof payload.clickKey === "string" ? payload.clickKey : "";
    const eventType = typeof payload.eventType === "string" ? payload.eventType : "";
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(clickKey)) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid click reference.");
    }
    if (!ALLOWED.has(eventType)) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid event type.");
    }
    const click = await prisma.productClick.findUnique({
      where: { clickKey },
      select: { clickKey: true },
    });
    if (!click) throw new ApiBoundaryError(404, "NOT_FOUND", "Click reference not found.");

    // This admin-only endpoint creates test funnel events. Client-reported value
    // and currency are deliberately ignored and can never become revenue data.
    await prisma.conversionEvent.create({
      data: { clickKey, eventType, value: null, currency: null },
    });

    return NextResponse.json({ ok: true, testEvent: true }, {
      headers: { "x-operation-id": operationId },
    });
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
