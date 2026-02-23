import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { logAppEvent } from "@/lib/app-events";

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

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`stripe:${session.user.id}`, 8, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many checkout requests" }, { status: 429 });
    }

    const { priceId, interval } = await req.json().catch(() => ({}));

    const fallbackPriceId =
      interval === "yearly"
        ? process.env.STRIPE_PRICE_PRO_YEARLY
        : process.env.STRIPE_PRICE_PRO_MONTHLY;

    const resolvedPriceId =
      typeof priceId === "string" && priceId.trim().length > 0 ? priceId : fallbackPriceId;

    if (!resolvedPriceId || resolvedPriceId.includes("...")) {
      return NextResponse.json(
        {
          error:
            interval === "yearly"
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

    const origin = req.headers.get("origin") || process.env.APP_ORIGIN || "http://localhost:3000";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing/cancel`,
      allow_promotion_codes: true,
    });

    await logAppEvent({
      eventType: "checkout_started",
      userId: session.user.id,
      meta: { provider: "stripe", priceId: resolvedPriceId },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("Stripe checkout error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Unable to create checkout session" },
      { status: 500 }
    );
  }
}
