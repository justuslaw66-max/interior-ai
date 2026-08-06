import Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackMonetization } from "@/lib/monetization-tracking";
import {
  buildTrustedLifecycleProvenance,
  type VerifiedStripeWebhookContext,
} from "@/lib/app-event-provenance";
import {
  claimTrustedLifecycleEvent,
  claimTrustedLifecycleEventInTransaction,
  recordTrustedLifecycleEventInTransaction,
} from "@/lib/trusted-app-events";
import {
  applyVerifiedStripeEntitlementOnce,
  verifyStripeWebhookEnvelope,
  type AppliedStripeEntitlement,
  type StripeEntitlementDecision,
  type StripeWebhookTransactionPort,
} from "@/lib/stripe-webhook-transaction";
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

type EntitlementDecision = StripeEntitlementDecision;
type AppliedEntitlement = AppliedStripeEntitlement;

type ResolvedWebhookEntitlement = {
  handled: boolean;
  customerId: string | null;
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

function recordUpgradeTransition(
  tx: Prisma.TransactionClient,
  eventId: string,
  trustedContext: VerifiedStripeWebhookContext,
  userId: string,
  subscriptionId: string | null
) {
  return recordTrustedLifecycleEventInTransaction(
    tx,
    {
      id: `stripe:${eventId}:upgrade:${userId}`,
      eventType: "upgrade_checkout_completed",
      userId,
      meta: { subscriptionId },
    },
    trustedContext
  ).then(() => undefined);
}

function recordCancellationTransition(
  tx: Prisma.TransactionClient,
  eventId: string,
  trustedContext: VerifiedStripeWebhookContext,
  userId: string
) {
  return recordTrustedLifecycleEventInTransaction(
    tx,
    {
      id: `stripe:${eventId}:cancellation:${userId}`,
      eventType: "subscription_canceled",
      userId,
    },
    trustedContext
  ).then(() => undefined);
}

function stripeWebhookTransactionPort(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  customerId: string | null,
  decision: EntitlementDecision | null,
  trustedContext: VerifiedStripeWebhookContext
): StripeWebhookTransactionPort {
  return {
    claimProcessed: () => claimTrustedLifecycleEventInTransaction(
      tx,
      {
        id: `stripe:${event.id}`,
        eventType: "stripe_webhook_processed",
        meta: {
          stripeEventType: event.type,
          customerId,
          decision: decision?.plan ?? "ignored",
          reason: decision?.reason ?? "not_managed",
        },
      },
      trustedContext
    ),
    findUsers: (stripeCustomerId) => tx.user.findMany({
      where: { stripeCustomerId },
      select: { id: true, plan: true },
    }),
    updateUsers: async (stripeCustomerId, nextDecision) => {
      await tx.user.updateMany({
        where: { stripeCustomerId },
        data: {
          plan: nextDecision.plan,
          stripeSubscriptionId: nextDecision.subscriptionId,
        },
      });
    },
    recordUpgrade: (userId, subscriptionId) => recordUpgradeTransition(
      tx,
      event.id,
      trustedContext,
      userId,
      subscriptionId
    ),
    recordCancellation: (userId) => recordCancellationTransition(
      tx,
      event.id,
      trustedContext,
      userId
    ),
  };
}

async function applyEntitlementOnce(
  event: Stripe.Event,
  customerId: string | null,
  decision: EntitlementDecision | null,
  trustedContext: VerifiedStripeWebhookContext
): Promise<AppliedEntitlement> {
  return applyVerifiedStripeEntitlementOnce(customerId, decision, (operation) =>
    prisma.$transaction((tx) => operation(
      stripeWebhookTransactionPort(tx, event, customerId, decision, trustedContext)
    ))
  );
}

async function resolveCheckoutEntitlement(
  stripe: Stripe,
  event: Stripe.Event,
  catalog: ProPriceCatalog
): Promise<ResolvedWebhookEntitlement> {
  const session = event.data.object as Stripe.Checkout.Session;
  const customerId = stripeCustomerId(session.customer);
  const managed = await checkoutSessionUsesManagedProPrice(stripe, session, catalog);
  return {
    handled: true,
    customerId,
    decision: managed && customerId
      ? {
          plan: "pro",
          subscriptionId: stripeSubscriptionId(session.subscription),
          reason: "managed_checkout_completed",
        }
      : null,
  };
}

async function resolveSubscriptionEntitlement(
  stripe: Stripe,
  event: Stripe.Event,
  catalog: ProPriceCatalog
): Promise<ResolvedWebhookEntitlement> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = stripeCustomerId(subscription.customer);
  if (!customerId) return { handled: true, customerId: null, decision: null };

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { stripeSubscriptionId: true },
  });
  const affectsManagedSubscription =
    subscriptionUsesManagedProPrice(subscription, catalog) ||
    user?.stripeSubscriptionId === subscription.id;
  const decision = affectsManagedSubscription
    ? await reconcileSubscriptionDecision(
        stripe,
        customerId,
        catalog,
        event.type === "customer.subscription.deleted" ? undefined : subscription
      )
    : null;
  return { handled: true, customerId, decision };
}

async function resolveWebhookEntitlement(
  stripe: Stripe,
  event: Stripe.Event,
  catalog: ProPriceCatalog
): Promise<ResolvedWebhookEntitlement> {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    return resolveCheckoutEntitlement(stripe, event, catalog);
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    return resolveSubscriptionEntitlement(stripe, event, catalog);
  }
  return { handled: false, customerId: null, decision: null };
}

async function recordVerifiedProcessingFailure(
  event: Stripe.Event,
  trustedContext: VerifiedStripeWebhookContext
) {
  try {
    await claimTrustedLifecycleEvent(
      {
        id: `stripe:${event.id}:processing-failure`,
        eventType: "webhook_failed",
        meta: { stripeEventType: event.type, reason: "handler" },
      },
      trustedContext
    );
  } catch (error) {
    console.error("Verified webhook failure evidence could not be persisted", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
}

async function trackAppliedEntitlement(applied: AppliedEntitlement) {
  if (applied.duplicate || !applied.decision) return;

  const jobs: Array<Promise<unknown>> = [];
  for (const user of applied.users) {
    if (applied.decision.plan === "pro" && user.plan !== "pro") {
      jobs.push(
        trackMonetization("upgrade_checkout_completed", user.id, { plan: "pro" })
      );
    }

    if (applied.decision.plan === "free" && user.plan === "pro") {
      jobs.push(
        trackMonetization("subscription_canceled", user.id, { plan: "free" })
      );
    }
  }

  await Promise.allSettled(jobs);
}

async function readVerifiedStripeEvent(
  req: Request,
  stripe: Stripe,
  webhookSecret: string
): Promise<{ ok: true; event: Stripe.Event } | { ok: false; response: NextResponse }> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 }),
    };
  }

  const body = await req.text();
  const verified = verifyStripeWebhookEnvelope(
    (rawBody, rawSignature, secret) =>
      stripe.webhooks.constructEvent(rawBody, rawSignature, secret),
    body,
    signature,
    webhookSecret
  );
  if (!verified.ok) {
    console.warn("Webhook signature verification failed", {
      errorType: verified.errorType,
    });
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 }),
    };
  }
  return { ok: true, event: verified.event };
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

  const verified = await readVerifiedStripeEvent(req, stripe, webhookSecret);
  if (!verified.ok) return verified.response;
  const event = verified.event;

  const trustedContext: VerifiedStripeWebhookContext = {
    producer: "VERIFIED_STRIPE_WEBHOOK",
    verificationMethod: "STRIPE_SIGNATURE",
    externalEventId: event.id,
  };
  buildTrustedLifecycleProvenance(trustedContext);

  try {
    const resolved = await resolveWebhookEntitlement(stripe, event, catalog);
    if (!resolved.handled) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const applied = await applyEntitlementOnce(
      event,
      resolved.customerId,
      resolved.decision,
      trustedContext
    );
    await trackAppliedEntitlement(applied);

    return NextResponse.json({
      received: true,
      duplicate: applied.duplicate,
      entitlement: applied.decision?.plan ?? "ignored",
    });
  } catch (error) {
    await recordVerifiedProcessingFailure(event, trustedContext);
    console.error("Webhook handler failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
