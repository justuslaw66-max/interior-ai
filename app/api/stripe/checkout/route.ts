import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { recordServerAnalyticsEvent } from "@/lib/app-events";
import {
  isActiveProSubscription,
  listBlockingManagedProSubscriptions,
  ProBillingConfigurationError,
  resolveProCheckoutSelection,
  resolveProPriceCatalog,
} from "@/lib/stripe-pro-billing";
import {
  buildProviderFailureBoundaryDiagnostics,
  buildCheckoutBoundaryResponsePayload,
  isBetaCheckoutBoundary,
  resolveCheckoutBoundaryDiagnostics,
} from "@/lib/beta-checkout-boundary";
import { readJsonRequest } from "@/lib/api-boundary";

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

    const body = await readJsonRequest(req, 2 * 1024).catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must include a billing interval", code: "invalid_request" },
        { status: 400 }
      );
    }
    const bodyKeys = Object.keys(body);
    if (bodyKeys.some((key) => key !== "interval")) {
      return NextResponse.json(
        { error: "Only the billing interval may be selected", code: "invalid_request" },
        { status: 400 }
      );
    }
    const requestedInterval =
      body && typeof body === "object" ? (body as { interval?: unknown }).interval : undefined;

    let selection: ReturnType<typeof resolveProCheckoutSelection>;
    try {
      selection = resolveProCheckoutSelection(requestedInterval);
    } catch (error) {
      if (!(error instanceof ProBillingConfigurationError)) throw error;
      if (isBetaCheckoutBoundary(boundary)) {
        return NextResponse.json(
          buildCheckoutBoundaryResponsePayload(
            buildProviderFailureBoundaryDiagnostics(
              boundary,
              "stripe",
              error.message
            )
          ),
          { status: 503 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    if (!selection) {
      return NextResponse.json(
        { error: "interval must be monthly or yearly", code: "invalid_interval" },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const priceCatalog = resolveProPriceCatalog();

    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (dbUser.plan === "pro") {
      return NextResponse.json(
        { error: "Already subscribed to Pro", code: "already_pro" },
        { status: 409 }
      );
    }

    let customerId = dbUser.stripeCustomerId;

    if (customerId) {
      const blockingSubscriptions = await listBlockingManagedProSubscriptions(
        stripe,
        customerId,
        priceCatalog
      );
      const activeSubscription = blockingSubscriptions.find(isActiveProSubscription);
      if (activeSubscription) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { plan: "pro", stripeSubscriptionId: activeSubscription.id },
        });
      }
      if (blockingSubscriptions.length > 0) {
        return NextResponse.json(
          {
            error: activeSubscription
              ? "Already subscribed to Pro"
              : "A Pro subscription is already being processed",
            code: "subscription_exists",
          },
          { status: 409 }
        );
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email ?? undefined,
        metadata: { userId: dbUser.id },
      }, {
        idempotencyKey: `interior-ai:pro-customer:${dbUser.id}`,
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const origin = process.env.APP_ORIGIN || new URL(req.url).origin;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: dbUser.id,
      line_items: [{ price: selection.priceId, quantity: 1 }],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing/cancel`,
      allow_promotion_codes: true,
      metadata: {
        userId: dbUser.id,
        plan: "pro",
        interval: selection.interval,
        priceId: selection.priceId,
      },
      subscription_data: {
        metadata: {
          userId: dbUser.id,
          plan: "pro",
          interval: selection.interval,
          priceId: selection.priceId,
        },
      },
    });

    await recordServerAnalyticsEvent({
      eventType: "checkout_started",
      userId: session.user.id,
      meta: {
        provider: "stripe",
        interval: selection.interval,
        priceId: selection.priceId,
        sessionId: checkoutSession.id,
      },
    });

    return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url });
  } catch (error: unknown) {
    console.error("Stripe checkout failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });

    const boundary = resolveCheckoutBoundaryDiagnostics();
    if (isBetaCheckoutBoundary(boundary)) {
      return NextResponse.json(
        buildCheckoutBoundaryResponsePayload(
          buildProviderFailureBoundaryDiagnostics(
            boundary,
            "stripe",
            "Checkout provider request failed"
          )
        ),
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Unable to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}
