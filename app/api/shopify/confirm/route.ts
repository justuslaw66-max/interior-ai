import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { trackServerEvent } from "@/lib/server-analytics";
import { logAppEvent } from "@/lib/app-events";
import { rateLimit } from "@/lib/rateLimit";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";
import { logOperationalEvent } from "@/lib/observability";

export async function POST(req: Request) {
  const operation = "shopify.checkout_return";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const session = await auth();
    const body = await readJsonRequest(req, 4 * 1024);
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const orderRef = typeof payload.orderRef === "string" ? payload.orderRef.trim() : "";
    if (
      orderRef.length < 3 ||
      orderRef.length > 200 ||
      !/^[\x20-\x7e]+$/.test(orderRef)
    ) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid checkout reference.");
    }

    const userId = session?.user?.id ?? null;
    const rateKey = userId ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const rl = rateLimit(`checkout-return:${rateKey}`, 30, 60_000);
    if (!rl.ok) {
      throw new ApiBoundaryError(429, "RATE_LIMITED", "Too many checkout return requests.");
    }

    let ownedDesignId: string | null = null;
    if (userId && typeof payload.designId === "string" && payload.designId.length <= 64) {
      const ownedDesign = await prisma.design.findFirst({
        where: { id: payload.designId, userId },
        select: { id: true },
      });
      ownedDesignId = ownedDesign?.id ?? null;
    }

    // This endpoint only records that the browser returned from Shopify. Order and
    // revenue confirmation must come from a provider-verified webhook.
    await logAppEvent({
      eventType: "checkout_return_observed",
      userId,
      designId: ownedDesignId,
      meta: { providerReferencePresent: true },
    });

    trackServerEvent("checkout_return_observed", userId ?? "anonymous", {
      design_id: ownedDesignId,
      provider_reference_present: true,
      order_verified: false,
    });

    logOperationalEvent({
      operation,
      operationId,
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      status: 200,
      meta: { authenticated: Boolean(userId), designLinked: Boolean(ownedDesignId) },
    });
    return NextResponse.json(
      { ok: true, status: "unverified_return" },
      { headers: apiSuccessHeaders(operationId) }
    );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
