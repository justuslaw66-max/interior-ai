import type Stripe from "stripe";
import {
  parseProBillingInterval,
  type ProBillingInterval,
} from "@/lib/pro-plan-catalog";

type EnvLike = Record<string, string | undefined>;

export type ProPriceCatalog = Readonly<Record<ProBillingInterval, string>>;

export class ProBillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProBillingConfigurationError";
  }
}

function requireConfiguredPriceId(key: string, value: string | undefined): string {
  const resolved = value?.trim() ?? "";
  if (!resolved || resolved.includes("...") || !resolved.startsWith("price_")) {
    throw new ProBillingConfigurationError(`${key} is not configured`);
  }
  return resolved;
}

export function resolveProPriceCatalog(env: EnvLike = process.env): ProPriceCatalog {
  const monthly = requireConfiguredPriceId(
    "STRIPE_PRICE_PRO_MONTHLY",
    env.STRIPE_PRICE_PRO_MONTHLY
  );
  const yearly = requireConfiguredPriceId(
    "STRIPE_PRICE_PRO_YEARLY",
    env.STRIPE_PRICE_PRO_YEARLY
  );

  if (monthly === yearly) {
    throw new ProBillingConfigurationError(
      "STRIPE_PRICE_PRO_MONTHLY and STRIPE_PRICE_PRO_YEARLY must be different"
    );
  }

  return { monthly, yearly };
}

export function resolveProCheckoutSelection(
  value: unknown,
  env: EnvLike = process.env,
  defaultInterval: ProBillingInterval | null = null
): { interval: ProBillingInterval; priceId: string } | null {
  const interval = parseProBillingInterval(value, defaultInterval);
  if (!interval) return null;
  const catalog = resolveProPriceCatalog(env);
  return { interval, priceId: catalog[interval] };
}

export function managedIntervalForPriceId(
  priceId: string | null | undefined,
  catalog: ProPriceCatalog
): ProBillingInterval | null {
  if (!priceId) return null;
  if (priceId === catalog.monthly) return "monthly";
  if (priceId === catalog.yearly) return "yearly";
  return null;
}

export function subscriptionUsesManagedProPrice(
  subscription: Stripe.Subscription,
  catalog: ProPriceCatalog
): boolean {
  return subscription.items.data.some((item) =>
    Boolean(managedIntervalForPriceId(item.price.id, catalog))
  );
}

export function isActiveProSubscription(subscription: Stripe.Subscription): boolean {
  return subscription.status === "active" || subscription.status === "trialing";
}

export function isBlockingProSubscription(subscription: Stripe.Subscription): boolean {
  return !["canceled", "incomplete_expired"].includes(subscription.status);
}

export function selectActiveManagedProSubscription(
  subscriptions: Stripe.Subscription[],
  catalog: ProPriceCatalog
): Stripe.Subscription | null {
  return (
    subscriptions
      .filter(
      (subscription) =>
        isActiveProSubscription(subscription) &&
        subscriptionUsesManagedProPrice(subscription, catalog)
      )
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "active" ? -1 : 1;
        return right.created - left.created;
      })[0] ?? null
  );
}

export async function listActiveManagedProSubscriptions(
  stripe: Stripe,
  customerId: string,
  catalog: ProPriceCatalog
): Promise<Stripe.Subscription[]> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  return subscriptions.data.filter(
    (subscription) =>
      isActiveProSubscription(subscription) &&
      subscriptionUsesManagedProPrice(subscription, catalog)
  );
}

export async function listBlockingManagedProSubscriptions(
  stripe: Stripe,
  customerId: string,
  catalog: ProPriceCatalog
): Promise<Stripe.Subscription[]> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  return subscriptions.data.filter(
    (subscription) =>
      isBlockingProSubscription(subscription) &&
      subscriptionUsesManagedProPrice(subscription, catalog)
  );
}

export async function checkoutSessionUsesManagedProPrice(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  catalog: ProPriceCatalog
): Promise<boolean> {
  if (session.mode !== "subscription") return false;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  });

  return lineItems.data.some((lineItem) =>
    Boolean(managedIntervalForPriceId(lineItem.price?.id, catalog))
  );
}

export function stripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

export function stripeSubscriptionId(
  subscription: string | Stripe.Subscription | null
): string | null {
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}
