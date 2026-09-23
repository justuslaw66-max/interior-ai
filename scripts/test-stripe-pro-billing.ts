import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type Stripe from "stripe";
import { parseProBillingInterval } from "../lib/pro-plan-catalog";
import {
  isActiveProSubscription,
  isBlockingProSubscription,
  managedIntervalForPriceId,
  ProBillingConfigurationError,
  resolveProCheckoutSelection,
  resolveProPriceCatalog,
  selectActiveManagedProSubscription,
  subscriptionUsesManagedProPrice,
} from "../lib/stripe-pro-billing";

const env = {
  STRIPE_PRICE_PRO_MONTHLY: "price_monthly_test",
  STRIPE_PRICE_PRO_YEARLY: "price_yearly_test",
};
const catalog = resolveProPriceCatalog(env);

function subscription(params: {
  id: string;
  status: Stripe.Subscription.Status;
  priceId: string;
  created?: number;
}): Stripe.Subscription {
  return {
    id: params.id,
    status: params.status,
    created: params.created ?? 1,
    items: {
      data: [{ price: { id: params.priceId } }],
    },
  } as unknown as Stripe.Subscription;
}

assert.equal(parseProBillingInterval("monthly"), "monthly");
assert.equal(parseProBillingInterval("yearly"), "yearly");
assert.equal(parseProBillingInterval("weekly"), null);
assert.equal(parseProBillingInterval(undefined), null);
assert.equal(parseProBillingInterval(undefined, "monthly"), "monthly");

assert.deepEqual(catalog, {
  monthly: "price_monthly_test",
  yearly: "price_yearly_test",
});
assert.deepEqual(resolveProCheckoutSelection("monthly", env), {
  interval: "monthly",
  priceId: "price_monthly_test",
});
assert.deepEqual(resolveProCheckoutSelection("yearly", env), {
  interval: "yearly",
  priceId: "price_yearly_test",
});
assert.equal(resolveProCheckoutSelection("weekly", env), null);

assert.throws(
  () => resolveProPriceCatalog({ ...env, STRIPE_PRICE_PRO_MONTHLY: "" }),
  ProBillingConfigurationError
);
assert.throws(
  () => resolveProPriceCatalog({ ...env, STRIPE_PRICE_PRO_MONTHLY: "price_..." }),
  ProBillingConfigurationError
);
assert.throws(
  () => resolveProPriceCatalog({ ...env, STRIPE_PRICE_PRO_YEARLY: "not-a-price" }),
  ProBillingConfigurationError
);
assert.throws(
  () =>
    resolveProPriceCatalog({
      STRIPE_PRICE_PRO_MONTHLY: "price_same",
      STRIPE_PRICE_PRO_YEARLY: "price_same",
    }),
  /must be different/
);

const activeMonthly = subscription({
  id: "sub_monthly",
  status: "active",
  priceId: catalog.monthly,
  created: 10,
});
const trialingYearly = subscription({
  id: "sub_yearly",
  status: "trialing",
  priceId: catalog.yearly,
  created: 20,
});
const unrelated = subscription({
  id: "sub_other",
  status: "active",
  priceId: "price_unrelated",
  created: 30,
});

assert.equal(managedIntervalForPriceId(catalog.monthly, catalog), "monthly");
assert.equal(managedIntervalForPriceId(catalog.yearly, catalog), "yearly");
assert.equal(managedIntervalForPriceId("price_unrelated", catalog), null);
assert.equal(subscriptionUsesManagedProPrice(activeMonthly, catalog), true);
assert.equal(subscriptionUsesManagedProPrice(unrelated, catalog), false);
assert.equal(isActiveProSubscription(activeMonthly), true);
assert.equal(isActiveProSubscription(trialingYearly), true);
assert.equal(
  isActiveProSubscription(
    subscription({ id: "past_due", status: "past_due", priceId: catalog.monthly })
  ),
  false
);
assert.equal(
  isBlockingProSubscription(
    subscription({ id: "incomplete", status: "incomplete", priceId: catalog.monthly })
  ),
  true
);
assert.equal(
  isBlockingProSubscription(
    subscription({ id: "canceled", status: "canceled", priceId: catalog.monthly })
  ),
  false
);
assert.equal(
  selectActiveManagedProSubscription(
    [unrelated, trialingYearly, activeMonthly],
    catalog
  )?.id,
  "sub_monthly"
);

const webhookSource = fs.readFileSync(
  path.join(process.cwd(), "app/api/stripe/webhook/route.ts"),
  "utf8"
);
const verificationCall = webhookSource.indexOf("verifyStripeWebhookEnvelope(");
const trustedContextCall = webhookSource.indexOf(
  "buildTrustedLifecycleProvenance(trustedContext)"
);
assert.ok(verificationCall >= 0 && trustedContextCall > verificationCall);
const invalidSignaturePath = webhookSource.slice(
  verificationCall,
  webhookSource.indexOf("const trustedContext", verificationCall)
);
assert.doesNotMatch(invalidSignaturePath, /webhook_failed|recordTrustedLifecycleEvent/);
assert.match(webhookSource, /applyVerifiedStripeEntitlementOnce/);
assert.match(webhookSource, /claimTrustedLifecycleEventInTransaction/);
assert.match(webhookSource, /recordTrustedLifecycleEventInTransaction/);
assert.match(webhookSource, /id: `stripe:\$\{event\.id\}`/);
assert.match(webhookSource, /id: `stripe:\$\{event\.id\}:processing-failure`/);
assert.match(webhookSource, /eventType: "upgrade_checkout_completed"/);
assert.match(webhookSource, /eventType: "subscription_canceled"/);
assert.match(webhookSource, /eventType: "webhook_failed"/);

console.log("Stripe Pro billing contract checks passed.");
