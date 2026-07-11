import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { logAppEvent } from "@/lib/app-events";
import {
  buildCheckoutStartedEventMeta,
  normalizeCheckoutTrackingContext,
} from "@/lib/checkout-app-event";
import {
  buildProEntitlementMetadata,
  resolveConfiguredProPriceId,
} from "@/lib/stripe-pro-entitlement";
import {
  buildProviderFailureBoundaryDiagnostics,
  buildCheckoutBoundaryResponsePayload,
  isBetaCheckoutBoundary,
  resolveCheckoutBoundaryDiagnostics,
} from "@/lib/beta-checkout-boundary";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.includes("...")) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return new Stripe(secretKey);
}

export async function POST(req: Request) {
  try {
    if (!config.features.checkoutEnabled) {
      return NextResponse.json({ error: "Checkout is disabled" }, { status: 503 });
    }

    const boundary = resolveCheckoutBoundaryDiagnostics();
    if (!boundary.checkoutSafe) {
      return NextResponse.json(buildCheckoutBoundaryResponsePayload(boundary), { status: 503 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`stripe:${session.user.id}`, 8, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many checkout requests" }, { status: 429 });
    }

    const requestBody = await req.json().catch(() => ({}));
    const body =
      requestBody && typeof requestBody === "object" && !Array.isArray(requestBody)
        ? (requestBody as Record<string, unknown>)
        : {};
    const checkoutTracking = normalizeCheckoutTrackingContext(body);
    const resolvedPriceId = resolveConfiguredProPriceId(checkoutTracking.interval);

    if (!resolvedPriceId || resolvedPriceId.includes("...")) {
      if (isBetaCheckoutBoundary(boundary)) {
        return NextResponse.json(
          buildCheckoutBoundaryResponsePayload(
            buildProviderFailureBoundaryDiagnostics(
              boundary,
              "stripe",
              checkoutTracking.interval === "yearly"
                ? "STRIPE_PRICE_PRO_YEARLY is not configured"
                : "STRIPE_PRICE_PRO_MONTHLY is not configured"
            )
          ),
          { status: 503 }
        );
      }

      return NextResponse.json(
        {
          error:
            checkoutTracking.interval === "yearly"
              ? "STRIPE_PRICE_PRO_YEARLY is not configured"
              : "STRIPE_PRICE_PRO_MONTHLY is not configured",
        },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();

    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (dbUser.plan === "pro") {
      return NextResponse.json({ error: "Already subscribed to Pro" }, { status: 400 });
    }

    let customerId = dbUser.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email ?? undefined,
        metadata: { userId: dbUser.id },
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const appOrigin = process.env.APP_ORIGIN || "http://localhost:3000";
    const entitlementMetadata = buildProEntitlementMetadata(session.user.id);

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: `${appOrigin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/billing/cancel`,
      allow_promotion_codes: true,
      metadata: entitlementMetadata,
      subscription_data: {
        metadata: entitlementMetadata,
      },
    });

    const checkoutStartedEvent = await logAppEvent({
      eventType: "checkout_started",
      userId: session.user.id,
      idempotencyKey: `stripe-checkout-started:${checkoutSession.id}`,
      designId: checkoutTracking.designId,
      meta: buildCheckoutStartedEventMeta({
        tracking: checkoutTracking,
        priceId: resolvedPriceId,
        sessionId: checkoutSession.id,
      }),
    });
    if (!checkoutStartedEvent.persisted && !checkoutStartedEvent.duplicate) {
      await stripe.checkout.sessions.expire(checkoutSession.id).catch(() => undefined);
      throw new Error("Unable to persist checkout-start event");
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Stripe checkout error:", message);

    const boundary = resolveCheckoutBoundaryDiagnostics();
    if (isBetaCheckoutBoundary(boundary)) {
      return NextResponse.json(
        buildCheckoutBoundaryResponsePayload(
          buildProviderFailureBoundaryDiagnostics(boundary, "stripe", message)
        ),
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: message || "Unable to create checkout session" },
      { status: 500 }
    );
  }
}
