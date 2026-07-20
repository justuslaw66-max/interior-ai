import Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/lib/app-events";
import { trackMonetization } from "@/lib/monetization-tracking";
import {
  checkoutSessionUsesManagedProPrice,
  isActiveProSubscription,
  listActiveManagedProSubscriptions,
  resolveProPriceCatalog,
  stripeCustomerId,
  stripeSubscriptionId,
  subscriptionUsesManagedProPrice,
  type ProPriceCatalog,
} from "@/lib/stripe-pro-billing";

type EntitlementDecision = {
  plan: "free" | "pro";
  subscriptionId: string | null;
  reason: string;
};

type AppliedEntitlement = {
  duplicate: boolean;
  users: Array<{ id: string; plan: string }>;
  decision: EntitlementDecision | null;
};

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.includes("...")) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(secretKey);
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || secret.includes("...")) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

async function reconcileSubscriptionDecision(
  stripe: Stripe,
  customerId: string,
  catalog: ProPriceCatalog,
  eventSubscription?: Stripe.Subscription
): Promise<EntitlementDecision> {
  const activeSubscriptions = await listActiveManagedProSubscriptions(
    stripe,
    customerId,
    catalog
  );

  if (
    eventSubscription &&
    isActiveProSubscription(eventSubscription) &&
    subscriptionUsesManagedProPrice(eventSubscription, catalog) &&
    !activeSubscriptions.some((subscription) => subscription.id === eventSubscription.id)
  ) {
    activeSubscriptions.push(eventSubscription);
  }

  activeSubscriptions.sort((left, right) => {
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return right.created - left.created;
  });

  const activeSubscription = activeSubscriptions[0] ?? null;
  return activeSubscription
    ? {
        plan: "pro",
        subscriptionId: activeSubscription.id,
        reason: "active_managed_subscription",
      }
    : {
        plan: "free",
        subscriptionId: null,
        reason: "no_active_managed_subscription",
      };
}

async function applyEntitlementOnce(
  event: Stripe.Event,
  customerId: string | null,
  decision: EntitlementDecision | null
): Promise<AppliedEntitlement> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.appEvent.createMany({
      data: [
        {
          id: `stripe:${event.id}`,
          eventType: "stripe_webhook_processed",
          meta: {
            stripeEventId: event.id,
            stripeEventType: event.type,
            customerId,
            decision: decision?.plan ?? "ignored",
            reason: decision?.reason ?? "not_managed",
          },
        },
      ],
      skipDuplicates: true,
    });

    if (claim.count === 0) {
      return { duplicate: true, users: [], decision };
    }

    if (!customerId || !decision) {
      return { duplicate: false, users: [], decision };
    }

    const users = await tx.user.findMany({
      where: { stripeCustomerId: customerId },
      select: { id: true, plan: true },
    });

    if (users.length > 0) {
      await tx.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          plan: decision.plan,
          stripeSubscriptionId: decision.subscriptionId,
        },
      });
    }

    return { duplicate: false, users, decision };
  });
}

async function trackAppliedEntitlement(event: Stripe.Event, applied: AppliedEntitlement) {
  if (applied.duplicate || !applied.decision) return;

  const jobs: Array<Promise<unknown>> = [];
  for (const user of applied.users) {
    if (applied.decision.plan === "pro" && user.plan !== "pro") {
      jobs.push(
        logAppEvent({
          eventType: "upgrade_checkout_completed",
          userId: user.id,
          meta: {
            provider: "stripe",
            stripeEventId: event.id,
            subscriptionId: applied.decision.subscriptionId,
          },
        }),
        trackMonetization("upgrade_checkout_completed", user.id, { plan: "pro" })
      );
    }

    if (applied.decision.plan === "free" && user.plan === "pro") {
      jobs.push(
        logAppEvent({
          eventType: "subscription_canceled",
          userId: user.id,
          meta: {
            provider: "stripe",
            stripeEventId: event.id,
          },
        }),
        trackMonetization("subscription_canceled", user.id, { plan: "free" })
      );
    }
  }

  await Promise.allSettled(jobs);
}

export async function POST(req: Request) {
  let stripe: Stripe;
  let webhookSecret: string;
  let catalog: ProPriceCatalog;
  try {
    stripe = getStripeClient();
    webhookSecret = getWebhookSecret();
    catalog = resolveProPriceCatalog();
  } catch (error) {
    console.error("Stripe webhook configuration unavailable", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "Webhook service unavailable" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    await logAppEvent({
      eventType: "webhook_failed",
      meta: { provider: "stripe", reason: "signature" },
    });
    console.warn("Webhook signature verification failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    let customerId: string | null = null;
    let decision: EntitlementDecision | null = null;

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      customerId = stripeCustomerId(session.customer);
      const managed = await checkoutSessionUsesManagedProPrice(stripe, session, catalog);
      if (managed && customerId) {
        decision = {
          plan: "pro",
          subscriptionId: stripeSubscriptionId(session.subscription),
          reason: "managed_checkout_completed",
        };
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      customerId = stripeCustomerId(subscription.customer);

      if (customerId) {
        const user = await prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
          select: { stripeSubscriptionId: true },
        });
        const affectsManagedSubscription =
          subscriptionUsesManagedProPrice(subscription, catalog) ||
          user?.stripeSubscriptionId === subscription.id;

        if (affectsManagedSubscription) {
          decision = await reconcileSubscriptionDecision(
            stripe,
            customerId,
            catalog,
            event.type === "customer.subscription.deleted" ? undefined : subscription
          );
        }
      }
    } else {
      return NextResponse.json({ received: true, ignored: true });
    }

    const applied = await applyEntitlementOnce(event, customerId, decision);
    await trackAppliedEntitlement(event, applied);

    return NextResponse.json({
      received: true,
      duplicate: applied.duplicate,
      entitlement: applied.decision?.plan ?? "ignored",
    });
  } catch (error) {
    await logAppEvent({
      eventType: "webhook_failed",
      meta: {
        provider: "stripe",
        stripeEventId: event.id,
        reason: "handler",
      },
    });
    console.error("Webhook handler failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
