import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import crypto from "crypto";
import { getPostHogClient } from "@/lib/posthog-server";
import { CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { assertStrictVariantResolution } from "@/lib/catalog/variant-resolver";
import { rateLimit } from "@/lib/rateLimit";
import { ApiBoundaryError, apiErrorResponse, createOperationId, readJsonRequest } from "@/lib/api-boundary";

export const runtime = "nodejs";

function makeClickKey() {
  return crypto.randomBytes(16).toString("base64url");
}

export async function POST(req: Request) {
  const operation = "commerce.affiliate_click";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
    const session = await auth();
    const subject = session?.user?.id ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const rl = rateLimit(`product-click:${subject}`, 60, 60_000);
    if (!rl.ok) throw new ApiBoundaryError(429, "RATE_LIMITED", "Too many product click requests.");

    const body = await readJsonRequest(req, 8 * 1024);
    const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const productId = typeof payload.productId === "string" ? payload.productId : "";
    const variantId = typeof payload.variantId === "string" ? payload.variantId : "";
    if (!productId || productId.length > 128 || !variantId || variantId.length > 128) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid catalog variant.");
    }

    const item = CATALOG_ITEMS_MAP.get(productId);
    if (!item) throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid catalog variant.");
    const resolution = assertStrictVariantResolution(item, variantId);
    if (!resolution.ok || resolution.resolved.commerce.type !== "affiliate") {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "This catalog variant has no affiliate link.");
    }
    const commerce = resolution.resolved.commerce;
    if (!commerce.available || !commerce.url) {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "This catalog variant is unavailable.");
    }
    const canonicalUrl = new URL(commerce.url);
    if (canonicalUrl.protocol !== "https:" && canonicalUrl.protocol !== "http:") {
      throw new ApiBoundaryError(400, "BAD_REQUEST", "This catalog variant has an invalid retailer link.");
    }

    let ownedDesignId: string | null = null;
    if (session?.user?.id && typeof payload.designId === "string" && payload.designId.length <= 64) {
      const owned = await prisma.design.findFirst({
        where: { id: payload.designId, userId: session.user.id },
        select: { id: true },
      });
      ownedDesignId = owned?.id ?? null;
    }

    const clickKey = makeClickKey();
    await prisma.productClick.create({
      data: {
        clickKey,
        userId: session?.user?.id ?? null,
        designId: ownedDesignId,
        productId,
        price: typeof commerce.priceHint === "number" && Number.isFinite(commerce.priceHint)
          ? Math.round(commerce.priceHint)
          : null,
        retailer: commerce.retailer?.slice(0, 120) ?? null,
        buyUrl: canonicalUrl.toString(),
      },
    });

    try {
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: session?.user?.id ?? "anonymous",
        event: "product_clicked",
        properties: {
          design_id: ownedDesignId,
          product_id: productId,
          price: commerce.priceHint,
          retailer: commerce.retailer,
          click_reference_created: true,
        },
      });
    } catch {
      // Analytics is non-blocking.
    }

    return NextResponse.json({ ok: true, clickKey }, {
      headers: { "x-operation-id": operationId },
    });
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
