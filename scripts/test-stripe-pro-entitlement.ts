import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildProEntitlementMetadata,
  configuredProPriceIds,
  hasProEntitlementMetadata,
  isActiveProSubscription,
  resolveConfiguredProPriceId,
  resolveSafeCheckoutReturnUrl,
  selectActiveProSubscription,
  subscriptionRepresentsProEntitlement,
  subscriptionUsesConfiguredProPrice,
} from "../lib/stripe-pro-entitlement";
import { monetizationUuidForInsertId } from "../lib/monetization-tracking";

const priceEnvironment = {
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_monthly",
  STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
};
const priceEnvironmentWithLegacy = {
  ...priceEnvironment,
  STRIPE_PRICE_PRO_LEGACY: "price_rotated_legacy, price_old_yearly",
};

const monetizationUuid = monetizationUuidForInsertId("stripe-checkout-completed:cs_123:user_1");
assert.match(
  monetizationUuid,
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);
assert.equal(
  monetizationUuidForInsertId("stripe-checkout-completed:cs_123:user_1"),
  monetizationUuid,
);
assert.notEqual(
  monetizationUuidForInsertId("stripe-checkout-completed:cs_456:user_1"),
  monetizationUuid,
);

assert.equal(resolveConfiguredProPriceId("monthly", priceEnvironment), "price_pro_monthly");
assert.equal(resolveConfiguredProPriceId("yearly", priceEnvironment), "price_pro_yearly");
assert.equal(resolveConfiguredProPriceId("monthly", { STRIPE_PRICE_PRO_MONTHLY: "..." }), null);
assert.deepEqual([...configuredProPriceIds(priceEnvironment)].sort(), [
  "price_pro_monthly",
  "price_pro_yearly",
]);
assert.deepEqual([...configuredProPriceIds(priceEnvironmentWithLegacy)].sort(), [
  "price_old_yearly",
  "price_pro_monthly",
  "price_pro_yearly",
  "price_rotated_legacy",
]);
assert.deepEqual(buildProEntitlementMetadata("user-1"), {
  userId: "user-1",
  entitlement: "pro",
});
assert.equal(hasProEntitlementMetadata({ entitlement: "pro" }), true);
assert.equal(hasProEntitlementMetadata({ entitlement: "other" }), false);
assert.equal(subscriptionUsesConfiguredProPrice({
  items: { data: [{ price: { id: "price_pro_yearly" } }] },
}, priceEnvironment), true);
assert.equal(subscriptionUsesConfiguredProPrice({
  items: { data: [{ price: { id: "price_unrelated" } }] },
}, priceEnvironment), false);
assert.equal(subscriptionRepresentsProEntitlement({
  metadata: { entitlement: "pro" },
  items: { data: [{ price: { id: "price_rotated_legacy" } }] },
}, priceEnvironment), false);
assert.equal(subscriptionRepresentsProEntitlement({
  metadata: { entitlement: "pro" },
  items: { data: [{ price: { id: "price_rotated_legacy" } }] },
}, priceEnvironmentWithLegacy), true);
assert.equal(subscriptionRepresentsProEntitlement({
  metadata: { entitlement: "pro" },
  items: { data: [{ price: { id: "price_pro_monthly" } }] },
}, priceEnvironment), true);
assert.equal(isActiveProSubscription({
  status: "past_due",
  metadata: { entitlement: "pro" },
}, priceEnvironment), false);
assert.equal(selectActiveProSubscription([
  { id: "sub_deleted", status: "canceled", metadata: { entitlement: "pro" } },
  { id: "sub_unrelated", status: "active", items: { data: [{ price: { id: "price_other" } }] } },
  { id: "sub_active", status: "active", items: { data: [{ price: { id: "price_pro_monthly" } }] } },
], priceEnvironment)?.id, "sub_active");

const appOrigin = "https://staging.example.test";
assert.equal(resolveSafeCheckoutReturnUrl("/design", appOrigin, "/billing/cancel"), `${appOrigin}/design`);
assert.equal(resolveSafeCheckoutReturnUrl("https://attacker.example/collect", appOrigin, "/billing/cancel"), `${appOrigin}/billing/cancel`);
assert.equal(resolveSafeCheckoutReturnUrl("javascript:alert(1)", appOrigin, "/billing/cancel"), `${appOrigin}/billing/cancel`);
assert.equal(resolveSafeCheckoutReturnUrl(undefined, appOrigin, "/billing/success?session_id={CHECKOUT_SESSION_ID}"), `${appOrigin}/billing/success?session_id={CHECKOUT_SESSION_ID}`);

const root = process.cwd();
const checkoutRouteSource = readFileSync(join(root, "app/api/stripe/checkout/route.ts"), "utf8");
const checkoutProRouteSource = readFileSync(join(root, "app/api/stripe/checkout-pro/route.ts"), "utf8");
const webhookSource = readFileSync(join(root, "app/api/stripe/webhook/route.ts"), "utf8");
const appEventsSource = readFileSync(join(root, "lib/app-events.ts"), "utf8");
const monetizationSource = readFileSync(join(root, "lib/monetization-tracking.ts"), "utf8");
const portalRouteSource = readFileSync(join(root, "app/api/stripe/portal/route.ts"), "utf8");
const billingPortalRouteSource = readFileSync(
  join(root, "app/api/stripe/billing-portal/route.ts"),
  "utf8",
);

for (const routeSource of [checkoutRouteSource, checkoutProRouteSource]) {
  assert.doesNotMatch(routeSource, /body\.priceId|\{\s*priceId|priceId\s*\|\|/);
  assert.match(routeSource, /resolveConfiguredProPriceId/);
  assert.match(routeSource, /buildProEntitlementMetadata/);
  assert.match(routeSource, /checkoutStartedEvent\.persisted/);
  assert.match(routeSource, /checkout\.sessions\.expire/);
}
assert.doesNotMatch(checkoutRouteSource, /headers\.get\(["']origin["']\)/);
assert.match(checkoutRouteSource, /payment_method_types:\s*\["card"\]/);
assert.doesNotMatch(portalRouteSource, /headers\.get\(["']origin["']\)/);
for (const portalSource of [portalRouteSource, billingPortalRouteSource]) {
  assert.match(portalSource, /resolveCheckoutBoundaryDiagnostics/);
  assert.match(portalSource, /buildCheckoutBoundaryResponsePayload/);
}
assert.match(checkoutProRouteSource, /resolveSafeCheckoutReturnUrl/);
assert.match(webhookSource, /session\.payment_status !== "paid"/);
assert.match(webhookSource, /checkout\.session\.async_payment_succeeded/);
assert.match(webhookSource, /stripe\.subscriptions\.list/);
assert.match(webhookSource, /selectActiveProSubscription/);
assert.match(webhookSource, /shouldSynchronizeSubscription/);
assert.match(webhookSource, /activeProSubscriptionIds/);
assert.match(webhookSource, /users\.map/);
assert.match(webhookSource, /pg_advisory_xact_lock/);
assert.match(webhookSource, /timeout:\s*5_000/);
assert.match(webhookSource, /idempotencyKey:\s*insertId/);
assert.match(webhookSource, /eventResult\.duplicate/);
assert.match(webhookSource, /MAX_STRIPE_WEBHOOK_BODY_BYTES/);
assert.match(webhookSource, /reader\.cancel/);
assert.match(appEventsSource, /createHash\("sha256"\)/);
assert.match(appEventsSource, /errorCode === "P2002"/);
assert.match(monetizationSource, /\$insert_id/);
assert.match(monetizationSource, /uuid:\s*insertId/);
assert.match(monetizationSource, /timestamp:\s*eventTimestamp/);
const signatureCatchStart = webhookSource.indexOf("} catch (err: unknown)");
const handlerTryStart = webhookSource.indexOf("\n  try {\n    switch", signatureCatchStart);
assert.ok(signatureCatchStart >= 0 && handlerTryStart > signatureCatchStart);
const invalidSignatureBlock = webhookSource.slice(signatureCatchStart, handlerTryStart);
assert.doesNotMatch(invalidSignatureBlock, /logAppEvent/);

console.log("Stripe Pro entitlement security checks passed.");
