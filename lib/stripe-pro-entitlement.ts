export const STRIPE_PRO_ENTITLEMENT = "pro" as const;

type StripePriceEnvironment = {
  [key: string]: string | undefined;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_YEARLY?: string;
  STRIPE_PRICE_PRO_LEGACY?: string;
};

export type StripeSubscriptionLike = {
  id?: string | null;
  status?: string | null;
  metadata?: Record<string, string> | null;
  items?: {
    data?: Array<{
      price?: {
        id?: string | null;
      } | null;
    }>;
  } | null;
};

function configuredValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && !trimmed.includes("...") ? trimmed : null;
}

export function resolveConfiguredProPriceId(
  interval: "monthly" | "yearly",
  environment: StripePriceEnvironment = process.env,
) {
  return configuredValue(
    interval === "yearly"
      ? environment.STRIPE_PRICE_PRO_YEARLY
      : environment.STRIPE_PRICE_PRO_MONTHLY,
  );
}

export function configuredProPriceIds(
  environment: StripePriceEnvironment = process.env,
) {
  return new Set(
    [
      configuredValue(environment.STRIPE_PRICE_PRO_MONTHLY),
      configuredValue(environment.STRIPE_PRICE_PRO_YEARLY),
      ...(environment.STRIPE_PRICE_PRO_LEGACY ?? "")
        .split(",")
        .map((value) => configuredValue(value)),
    ].filter((value): value is string => Boolean(value)),
  );
}

export function buildProEntitlementMetadata(userId: string) {
  return {
    userId,
    entitlement: STRIPE_PRO_ENTITLEMENT,
  };
}

export function hasProEntitlementMetadata(
  metadata: Record<string, string> | null | undefined,
) {
  return metadata?.entitlement === STRIPE_PRO_ENTITLEMENT;
}

export function subscriptionUsesConfiguredProPrice(
  subscription: StripeSubscriptionLike,
  environment: StripePriceEnvironment = process.env,
) {
  const allowedPriceIds = configuredProPriceIds(environment);
  if (allowedPriceIds.size === 0) return false;
  return Boolean(
    subscription.items?.data?.some((item) => {
      const priceId = item.price?.id;
      return typeof priceId === "string" && allowedPriceIds.has(priceId);
    }),
  );
}

export function subscriptionRepresentsProEntitlement(
  subscription: StripeSubscriptionLike,
  environment: StripePriceEnvironment = process.env,
) {
  return subscriptionUsesConfiguredProPrice(subscription, environment);
}

export function isActiveProSubscription(
  subscription: StripeSubscriptionLike,
  environment: StripePriceEnvironment = process.env,
) {
  return (
    (subscription.status === "active" || subscription.status === "trialing") &&
    subscriptionRepresentsProEntitlement(subscription, environment)
  );
}

export function selectActiveProSubscription(
  subscriptions: readonly StripeSubscriptionLike[],
  environment: StripePriceEnvironment = process.env,
) {
  return subscriptions.find((subscription) =>
    isActiveProSubscription(subscription, environment),
  ) ?? null;
}

export function resolveSafeCheckoutReturnUrl(
  requestedUrl: unknown,
  appOrigin: string,
  fallbackPath: string,
) {
  const origin = new URL(appOrigin);
  const fallback = new URL(fallbackPath, origin);
  if (typeof requestedUrl !== "string" || !requestedUrl.trim()) {
    return fallback.toString();
  }

  try {
    const candidate = new URL(requestedUrl, origin);
    return candidate.origin === origin.origin ? candidate.toString() : fallback.toString();
  } catch {
    return fallback.toString();
  }
}
