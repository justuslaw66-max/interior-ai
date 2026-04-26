import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/lib/app-events";
import { trackMonetization } from "@/lib/monetization-tracking";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  const sig = (await headers()).get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    await logAppEvent({
      eventType: "webhook_failed",
      meta: { provider: "stripe", reason: message || "signature" },
    });
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;

        if (!customerId) break;

        const users = await prisma.user.findMany({
          where: { stripeCustomerId: customerId },
          select: { id: true, plan: true },
        });

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: "pro" },
        });

        await Promise.all(
          users.map((user) =>
            Promise.all([
              logAppEvent({
                eventType: "upgrade_checkout_completed",
                userId: user.id,
                meta: { provider: "stripe", customerId },
              }),
              trackMonetization("upgrade_checkout_completed", user.id, {
                plan: "pro",
              }),
            ])
          )
        );
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        const isActive = sub.status === "active" || sub.status === "trialing";

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            plan: isActive ? "pro" : "free",
            stripeSubscriptionId: sub.id,
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        const users = await prisma.user.findMany({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        });

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: "free", stripeSubscriptionId: null },
        });

        await Promise.all(
          users.map((user) =>
            Promise.all([
              logAppEvent({
                eventType: "subscription_canceled",
                userId: user.id,
                meta: { provider: "stripe", subscriptionId: sub.id },
              }),
              trackMonetization("subscription_canceled", user.id, {
                plan: "free",
              }),
            ])
          )
        );
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    await logAppEvent({
      eventType: "webhook_failed",
      meta: { provider: "stripe", reason: message || "handler" },
    });
    console.error("Webhook handler error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
