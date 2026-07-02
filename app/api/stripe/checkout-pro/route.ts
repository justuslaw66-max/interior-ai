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

    const { priceId, returnUrl } = await request.json();

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

    // Use environment variable for price ID, fallback to provided
    const actualPriceId = priceId || process.env.STRIPE_PRICE_PRO_MONTHLY;

    if (!actualPriceId) {
      return NextResponse.json(
        { error: "Price ID not configured" },
        { status: 500 }
      );
    }

    // Create Checkout session
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
      success_url: returnUrl || `${process.env.APP_ORIGIN}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnUrl || `${process.env.APP_ORIGIN}/billing/cancel`,
      metadata: {
        userId: user.id,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
        },
      },
    });

    await Promise.all([
      logAppEvent({
        eventType: "upgrade_checkout_started",
        userId: user.id,
        meta: { trigger: "pdf", sessionId: checkoutSession.id },
      }),
      trackMonetization("upgrade_checkout_started", user.id, {
        trigger: "pdf",
        plan: "free",
      }),
    ]);

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
