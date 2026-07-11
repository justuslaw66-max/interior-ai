import Stripe from "stripe";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import {
  buildCheckoutBoundaryResponsePayload,
  buildProviderFailureBoundaryDiagnostics,
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

export async function POST() {
  try {
    if (!config.features.checkoutEnabled) {
      return NextResponse.json({ error: "Billing portal is disabled" }, { status: 503 });
    }

    const boundary = resolveCheckoutBoundaryDiagnostics();
    if (!boundary.checkoutSafe) {
      return NextResponse.json(buildCheckoutBoundaryResponsePayload(boundary), { status: 503 });
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
    const appOrigin = process.env.APP_ORIGIN || "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: dbUser.stripeCustomerId,
      return_url: `${appOrigin}?refresh_plan=true`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error("Stripe portal error:", message);
    const boundary = resolveCheckoutBoundaryDiagnostics();
    if (isBetaCheckoutBoundary(boundary)) {
      return NextResponse.json(
        buildCheckoutBoundaryResponsePayload(
          buildProviderFailureBoundaryDiagnostics(boundary, "stripe", message),
        ),
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: message || "Unable to create portal session" },
      { status: 500 }
    );
  }
}
