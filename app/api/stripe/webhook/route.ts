import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/lib/app-events";
import { trackMonetization } from "@/lib/monetization-tracking";
import {
  hasProEntitlementMetadata,
  isActiveProSubscription,
  selectActiveProSubscription,
  subscriptionRepresentsProEntitlement,
} from "@/lib/stripe-pro-entitlement";

const MAX_STRIPE_WEBHOOK_BODY_BYTES = 1024 * 1024;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function readBoundedWebhookBody(req: Request) {
  const declaredLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_STRIPE_WEBHOOK_BODY_BYTES
  ) {
    return null;
  }
  if (!req.body) return Buffer.alloc(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > MAX_STRIPE_WEBHOOK_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytesRead);
}

async function synchronizeCustomerProEntitlement(
  stripe: Stripe,
  customerId: string,
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext('stripe-pro-entitlement'),
        hashtext(${customerId})
      )
    `;
    const users = await transaction.user.findMany({
      where: { stripeCustomerId: customerId },
      select: { id: true, plan: true },
    });
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const activeProSubscriptions = subscriptions.data.filter((subscription) =>
      isActiveProSubscription(subscription),
    );
    const activeProSubscription = selectActiveProSubscription(subscriptions.data);
    const nextPlan = activeProSubscription ? "pro" : "free";

    await transaction.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        plan: nextPlan,
        stripeSubscriptionId: activeProSubscription?.id ?? null,
      },
    });

    return {
      users,
      activeProSubscription,
      activeProSubscriptionIds: activeProSubscriptions.map((subscription) => subscription.id),
    };
  }, { maxWait: 5_000, timeout: 20_000 });
}

async function shouldSynchronizeSubscription(
  subscription: Stripe.Subscription,
  customerId: string,
) {
  if (subscriptionRepresentsProEntitlement(subscription)) return true;
  const knownSubscription = await prisma.user.findFirst({
    where: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
    },
    select: { id: true },
  });
  return Boolean(knownSubscription);
}

export async function POST(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    timeout: 5_000,
    maxNetworkRetries: 1,
  });
  const sig = (await headers()).get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await readBoundedWebhookBody(req).catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Webhook body too large" }, { status: 413 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    // Do not persist untrusted signature failures: this public endpoint must not be a DB-write amplifier.
    console.warn("Webhook signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (
          session.mode !== "subscription" ||
          !hasProEntitlementMetadata(session.metadata) ||
          (session.payment_status !== "paid" && session.payment_status !== "no_payment_required")
        ) {
          break;
        }
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!customerId || !subscriptionId) break;

        const { users, activeProSubscriptionIds } =
          await synchronizeCustomerProEntitlement(stripe, customerId);
        if (!activeProSubscriptionIds.includes(subscriptionId)) break;

        await Promise.all(
          users.map(async (user: (typeof users)[number]) => {
            const insertId = `stripe-checkout-completed:${session.id}:${user.id}`;
            const [eventResult] = await Promise.all([
              logAppEvent({
                eventType: "upgrade_checkout_completed",
                userId: user.id,
                idempotencyKey: insertId,
                meta: {
                  provider: "stripe",
                  customerId,
                  sessionId: session.id,
                  subscriptionId,
                },
              }),
              trackMonetization("upgrade_checkout_completed", user.id, {
                plan: "pro",
                insertId,
                occurredAt: new Date(event.created * 1000),
              }),
            ]);
            if (!eventResult.persisted && !eventResult.duplicate) {
              throw new Error("Unable to persist Stripe checkout completion event");
            }
          })
        );
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        if (!(await shouldSynchronizeSubscription(sub, customerId))) break;
        await synchronizeCustomerProEntitlement(stripe, customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        if (!(await shouldSynchronizeSubscription(sub, customerId))) break;

        const { users, activeProSubscription } =
          await synchronizeCustomerProEntitlement(stripe, customerId);
        if (activeProSubscription) break;

        await Promise.all(
          users.map(async (user: (typeof users)[number]) => {
            const insertId = `stripe-subscription-canceled:${sub.id}:${user.id}`;
            const [eventResult] = await Promise.all([
              logAppEvent({
                eventType: "subscription_canceled",
                userId: user.id,
                idempotencyKey: insertId,
                meta: { provider: "stripe", subscriptionId: sub.id },
              }),
              trackMonetization("subscription_canceled", user.id, {
                plan: "free",
                insertId,
                occurredAt: new Date(event.created * 1000),
              }),
            ]);
            if (!eventResult.persisted && !eventResult.duplicate) {
              throw new Error("Unable to persist Stripe cancellation event");
            }
          })
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
