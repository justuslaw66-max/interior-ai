import Stripe from "stripe";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { recordServerAnalyticsEvent } from "@/lib/app-events";
import { trackMonetization } from "@/lib/monetization-tracking";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.includes("...")) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(secretKey);
}

// Lazy load prisma to avoid initialization issues
type PrismaModule = typeof import("@/lib/prisma");
let prisma: PrismaModule["prisma"] | null = null;
async function getPrisma() {
  if (!prisma) {
    const { prisma: p } = await import("@/lib/prisma");
    prisma = p;
  }
  return prisma;
}

export async function POST(req: Request) {
  try {
    if (!config.features.checkoutEnabled) {
      return NextResponse.json({ error: "Billing portal is disabled" }, { status: 503 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`stripe-portal:${session.user.id}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many portal requests" }, { status: 429 });
    }

    const db = await getPrisma();
    const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
    
    if (!dbUser?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer found for user. Please complete checkout first." },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const origin = process.env.APP_ORIGIN || new URL(req.url).origin;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: dbUser.stripeCustomerId,
      return_url: `${origin}/design?refresh_plan=true`,
    });

    await Promise.allSettled([
      recordServerAnalyticsEvent({
        eventType: "billing_portal_opened",
        userId: dbUser.id,
      }),
      trackMonetization("billing_portal_opened", dbUser.id, {
        plan: dbUser.plan === "pro" ? "pro" : "free",
      }),
    ]);

    return NextResponse.json({ url: portalSession.url });
  } catch (error: unknown) {
    console.error("Stripe portal request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Unable to create portal session. Please try again." },
      { status: 500 }
    );
  }
}
