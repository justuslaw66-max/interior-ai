/**
 * Stripe Checkout - Pro Subscription
 * 
 * Creates a Stripe Checkout session for Pro plan upgrade.
 * Uses live Stripe keys in production.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { logAppEvent } from "@/lib/app-events";
import { trackMonetization } from "@/lib/monetization-tracking";
import {
  buildProEntitlementMetadata,
  resolveConfiguredProPriceId,
  resolveSafeCheckoutReturnUrl,
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

function getStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2026-01-28.clover",
  });
}

export async function POST(request: Request) {
  try {
    if (!config.features.checkoutEnabled) {
      return NextResponse.json({ error: "Checkout is disabled" }, { status: 503 });
    }

    const boundary = resolveCheckoutBoundaryDiagnostics();
    if (!boundary.checkoutSafe) {
      return NextResponse.json(buildCheckoutBoundaryResponsePayload(boundary), { status: 503 });
    }

    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const rl = rateLimit(`stripe:${session.user.email.toLowerCase()}`, 8, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many Stripe checkout requests" }, { status: 429 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }

    const stripe = getStripeClient(stripeSecretKey);

    const requestBody = await request.json().catch(() => ({}));
    const body =
      requestBody && typeof requestBody === "object" && !Array.isArray(requestBody)
        ? (requestBody as Record<string, unknown>)
        : {};

    // Get or create Stripe customer
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, stripeCustomerId: true, plan: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if already Pro
    if (user.plan === "pro") {
      return NextResponse.json(
        { error: "Already subscribed to Pro" },
        { status: 400 }
      );
    }

    let customerId = user.stripeCustomerId;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const actualPriceId = resolveConfiguredProPriceId("monthly");

    if (!actualPriceId) {
      if (isBetaCheckoutBoundary(boundary)) {
        return NextResponse.json(
          buildCheckoutBoundaryResponsePayload(
            buildProviderFailureBoundaryDiagnostics(
              boundary,
              "stripe",
              "STRIPE_PRICE_PRO_MONTHLY is not configured",
            ),
          ),
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "Price ID not configured" },
        { status: 500 }
      );
    }

    const appOrigin = process.env.APP_ORIGIN || "http://localhost:3000";
    const successUrl = resolveSafeCheckoutReturnUrl(
      body.returnUrl,
      appOrigin,
      "/billing/success?session_id={CHECKOUT_SESSION_ID}",
    );
    const cancelUrl = resolveSafeCheckoutReturnUrl(
      body.returnUrl,
      appOrigin,
      "/billing/cancel",
    );
    const entitlementMetadata = buildProEntitlementMetadata(user.id);

    // Create Checkout session from the configured Pro price only.
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: actualPriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: entitlementMetadata,
      subscription_data: {
        metadata: entitlementMetadata,
      },
    });

    const insertId = `stripe-upgrade-checkout-started:${checkoutSession.id}`;
    const [checkoutStartedEvent] = await Promise.all([
      logAppEvent({
        eventType: "upgrade_checkout_started",
        userId: user.id,
        idempotencyKey: insertId,
        meta: { trigger: "pdf", sessionId: checkoutSession.id },
      }),
      trackMonetization("upgrade_checkout_started", user.id, {
        trigger: "pdf",
        plan: "free",
        insertId,
        occurredAt: new Date(checkoutSession.created * 1000),
      }).catch((trackingError) => {
        console.warn("Unable to send checkout-start analytics:", trackingError);
      }),
    ]);
    if (!checkoutStartedEvent.persisted && !checkoutStartedEvent.duplicate) {
      await stripe.checkout.sessions.expire(checkoutSession.id).catch(() => undefined);
      throw new Error("Unable to persist checkout-start event");
    }

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    const boundary = resolveCheckoutBoundaryDiagnostics();
    if (isBetaCheckoutBoundary(boundary)) {
      return NextResponse.json(
        buildCheckoutBoundaryResponsePayload(
          buildProviderFailureBoundaryDiagnostics(
            boundary,
            "stripe",
            getErrorMessage(error),
          ),
        ),
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
