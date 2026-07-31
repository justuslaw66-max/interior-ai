#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
loadEnvConfig(rootDir, true);

assert.equal(
  process.env.APP_ENV?.trim().toLowerCase(),
  "development",
  "Pro billing lifecycle tests require APP_ENV=development"
);

const baseUrl = process.env.PRO_BILLING_BASE_URL ?? "http://127.0.0.1:3000";
const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const monthlyPriceId = process.env.STRIPE_PRICE_PRO_MONTHLY ?? "";
const yearlyPriceId = process.env.STRIPE_PRICE_PRO_YEARLY ?? "";

assert.match(stripeKey, /^(?:sk|rk)_test_/, "A Stripe test key is required");
assert.match(webhookSecret, /^whsec_/, "The local Stripe listener secret is required");
assert.match(monthlyPriceId, /^price_/, "The monthly test price is required");
assert.match(yearlyPriceId, /^price_/, "The yearly test price is required");
assert.notEqual(monthlyPriceId, yearlyPriceId, "Monthly/yearly prices must differ");

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL is required");
let database;
try {
  database = new URL(databaseUrl);
} catch {
  assert.fail("DATABASE_URL must be a valid local database URL");
}
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname),
  "Pro billing lifecycle tests require a local database"
);

const stripe = new Stripe(stripeKey);
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const resources = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, predicate, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await predicate();
    if (lastValue) return lastValue;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(lastValue)}`);
}

function authCookie(sessionToken) {
  return [
    "authjs.session-token",
    "next-auth.session-token",
    "__Secure-authjs.session-token",
    "__Secure-next-auth.session-token",
  ]
    .map((name) => `${name}=${sessionToken}`)
    .join("; ");
}

async function createUser(label) {
  const user = await prisma.user.create({
    data: {
      email: `interior-ai-stripe-test+${label}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.invalid`,
      plan: "free",
    },
  });
  const sessionToken = `sess_${crypto.randomBytes(18).toString("hex")}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const resource = {
    userId: user.id,
    sessionToken,
    customerId: null,
    checkoutSessionIds: [],
    subscriptionIds: [],
  };
  resources.push(resource);
  return resource;
}

async function appRequest(pathname, resource, body) {
  const headers = { "content-type": "application/json" };
  if (resource) headers.cookie = authCookie(resource.sessionToken);
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function refreshCustomer(resource) {
  const user = await prisma.user.findUnique({
    where: { id: resource.userId },
    select: { stripeCustomerId: true },
  });
  resource.customerId = user?.stripeCustomerId ?? resource.customerId;
  return resource.customerId;
}

async function verifyCheckout(resource, interval, expected) {
  const { response, json } = await appRequest("/api/stripe/checkout", resource, { interval });
  assert.equal(response.status, 200, `${interval} checkout should start: ${json.error ?? ""}`);
  assert.match(json.sessionId, /^cs_test_/);
  assert.match(json.url, /^https:\/\/checkout\.stripe\.com\//);
  resource.checkoutSessionIds.push(json.sessionId);
  await refreshCustomer(resource);

  const session = await stripe.checkout.sessions.retrieve(json.sessionId, {
    expand: ["line_items"],
  });
  const line = session.line_items?.data?.[0];
  assert.equal(session.livemode, false);
  assert.equal(session.mode, "subscription");
  assert.equal(session.currency, "sgd");
  assert.equal(session.amount_total, expected.amount);
  assert.equal(line?.price?.id, expected.priceId);
  assert.equal(line?.price?.recurring?.interval, expected.stripeInterval);
  assert.equal(session.metadata?.userId, resource.userId);
  assert.equal(session.metadata?.interval, interval);
  assert.equal(session.metadata?.priceId, expected.priceId);
  assert.equal(new URL(session.success_url).origin, new URL(baseUrl).origin);
  return session;
}

function signedEvent(type, object, id = `evt_codex_${crypto.randomBytes(8).toString("hex")}`) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    id,
    object: "event",
    api_version: "2026-06-24.dahlia",
    created: timestamp,
    livemode: false,
    pending_webhooks: 1,
    type,
    data: { object },
  });
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return { id, payload, header: `t=${timestamp},v1=${signature}` };
}

async function postSignedEvent(event) {
  const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": event.header,
    },
    body: event.payload,
  });
  return { response, json: await response.json().catch(() => ({})) };
}

async function planState(resource) {
  const [user, response] = await Promise.all([
    prisma.user.findUnique({
      where: { id: resource.userId },
      select: { plan: true, stripeSubscriptionId: true },
    }),
    fetch(`${baseUrl}/api/me`, { headers: { cookie: authCookie(resource.sessionToken) } }).then(
      (value) => value.json()
    ),
  ]);
  return {
    dbPlan: user?.plan,
    apiPlan: response.plan,
    subscriptionId: user?.stripeSubscriptionId ?? null,
  };
}

async function cleanup() {
  for (const resource of [...resources].reverse()) {
    for (const subscriptionId of resource.subscriptionIds) {
      await stripe.subscriptions.cancel(subscriptionId).catch(() => null);
    }
    for (const sessionId of resource.checkoutSessionIds) {
      await stripe.checkout.sessions.expire(sessionId).catch(() => null);
    }
    if (resource.customerId) {
      await stripe.customers.del(resource.customerId).catch(() => null);
      await prisma.$executeRawUnsafe(
        `DELETE FROM "AppEvent" WHERE "eventType" = 'stripe_webhook_processed' AND "meta"->>'customerId' = $1`,
        resource.customerId
      ).catch(() => null);
    }
    await prisma.appEvent.deleteMany({ where: { userId: resource.userId } }).catch(() => null);
    await prisma.session.deleteMany({ where: { userId: resource.userId } }).catch(() => null);
    await prisma.user.deleteMany({ where: { id: resource.userId } }).catch(() => null);
  }
}

async function run() {
  const [monthlyPrice, yearlyPrice] = await Promise.all([
    stripe.prices.retrieve(monthlyPriceId),
    stripe.prices.retrieve(yearlyPriceId),
  ]);
  assert.equal(monthlyPrice.unit_amount, 2990);
  assert.equal(monthlyPrice.currency, "sgd");
  assert.equal(monthlyPrice.recurring?.interval, "month");
  assert.equal(yearlyPrice.unit_amount, 24990);
  assert.equal(yearlyPrice.currency, "sgd");
  assert.equal(yearlyPrice.recurring?.interval, "year");

  const unauthenticated = await appRequest("/api/stripe/checkout", null, {
    interval: "monthly",
  });
  assert.equal(unauthenticated.response.status, 401);

  const validationUser = await createUser("validation");
  const invalidInterval = await appRequest("/api/stripe/checkout", validationUser, {
    interval: "weekly",
  });
  assert.equal(invalidInterval.response.status, 400);
  assert.equal(invalidInterval.json.code, "invalid_interval");
  const injectedPrice = await appRequest("/api/stripe/checkout", validationUser, {
    interval: "monthly",
    priceId: yearlyPriceId,
  });
  assert.equal(injectedPrice.response.status, 400);
  assert.equal(injectedPrice.json.code, "invalid_request");
  assert.equal(await refreshCustomer(validationUser), null);

  const monthlyUser = await createUser("monthly");
  await verifyCheckout(monthlyUser, "monthly", {
    amount: 2990,
    priceId: monthlyPriceId,
    stripeInterval: "month",
  });

  const yearlyUser = await createUser("yearly");
  await verifyCheckout(yearlyUser, "yearly", {
    amount: 24990,
    priceId: yearlyPriceId,
    stripeInterval: "year",
  });

  const compatibilityUser = await createUser("compatibility");
  const compatibility = await appRequest("/api/stripe/checkout-pro", compatibilityUser, {
    interval: "monthly",
  });
  assert.equal(compatibility.response.status, 200);
  assert.match(compatibility.json.sessionId, /^cs_test_/);
  compatibilityUser.checkoutSessionIds.push(compatibility.json.sessionId);
  await refreshCustomer(compatibilityUser);
  const compatibilitySession = await stripe.checkout.sessions.retrieve(
    compatibility.json.sessionId,
    { expand: ["line_items"] }
  );
  assert.equal(compatibilitySession.line_items?.data?.[0]?.price?.id, monthlyPriceId);

  const lifecycleUser = await createUser("lifecycle");
  const customer = await stripe.customers.create({
    email: `stripe-lifecycle-${Date.now()}@example.invalid`,
    metadata: { userId: lifecycleUser.userId },
  });
  lifecycleUser.customerId = customer.id;
  await prisma.user.update({
    where: { id: lifecycleUser.userId },
    data: { stripeCustomerId: customer.id },
  });

  const monthlySubscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: monthlyPriceId }],
    trial_period_days: 1,
    metadata: {
      userId: lifecycleUser.userId,
      plan: "pro",
      interval: "monthly",
      priceId: monthlyPriceId,
    },
  });
  lifecycleUser.subscriptionIds.push(monthlySubscription.id);
  await waitFor("monthly subscription activation", async () => {
    const state = await planState(lifecycleUser);
    return state.dbPlan === "pro" && state.apiPlan === "pro" ? state : null;
  });

  await prisma.user.update({
    where: { id: lifecycleUser.userId },
    data: { plan: "free", stripeSubscriptionId: null },
  });
  const duplicateCheckout = await appRequest("/api/stripe/checkout", lifecycleUser, {
    interval: "yearly",
  });
  assert.equal(duplicateCheckout.response.status, 409);
  assert.equal(duplicateCheckout.json.code, "subscription_exists");
  assert.equal((await planState(lifecycleUser)).dbPlan, "pro");

  for (const route of ["portal", "billing-portal"]) {
    const portal = await appRequest(`/api/stripe/${route}`, lifecycleUser, {});
    assert.equal(portal.response.status, 200, `${route} should create a portal session`);
    assert.equal(new URL(portal.json.url).hostname, "billing.stripe.com");
  }

  const yearlySubscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: yearlyPriceId }],
    trial_period_days: 1,
    metadata: {
      userId: lifecycleUser.userId,
      plan: "pro",
      interval: "yearly",
      priceId: yearlyPriceId,
    },
  });
  lifecycleUser.subscriptionIds.push(yearlySubscription.id);
  await waitFor("yearly subscription activation", async () => {
    const state = await planState(lifecycleUser);
    return state.dbPlan === "pro" ? state : null;
  });

  await stripe.subscriptions.cancel(monthlySubscription.id);
  lifecycleUser.subscriptionIds = lifecycleUser.subscriptionIds.filter(
    (id) => id !== monthlySubscription.id
  );
  await waitFor("remaining yearly subscription to retain Pro", async () => {
    const state = await planState(lifecycleUser);
    return state.dbPlan === "pro" && state.subscriptionId === yearlySubscription.id
      ? state
      : null;
  });

  await stripe.subscriptions.cancel(yearlySubscription.id);
  lifecycleUser.subscriptionIds = lifecycleUser.subscriptionIds.filter(
    (id) => id !== yearlySubscription.id
  );
  await waitFor("last subscription cancellation", async () => {
    const state = await planState(lifecycleUser);
    return state.dbPlan === "free" && state.apiPlan === "free" && !state.subscriptionId
      ? state
      : null;
  });

  const duplicateEvent = signedEvent("customer.subscription.deleted", yearlySubscription);
  const firstDelivery = await postSignedEvent(duplicateEvent);
  const secondDelivery = await postSignedEvent(duplicateEvent);
  assert.equal(firstDelivery.response.status, 200);
  assert.equal(firstDelivery.json.duplicate, false);
  assert.equal(secondDelivery.response.status, 200);
  assert.equal(secondDelivery.json.duplicate, true);

  const badSignature = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=1,v1=invalid",
    },
    body: "{}",
  });
  assert.equal(badSignature.status, 400);

  const unmanagedUser = await createUser("unmanaged");
  const unmanagedCustomer = await stripe.customers.create({
    email: `stripe-unmanaged-${Date.now()}@example.invalid`,
  });
  unmanagedUser.customerId = unmanagedCustomer.id;
  await prisma.user.update({
    where: { id: unmanagedUser.userId },
    data: { stripeCustomerId: unmanagedCustomer.id },
  });
  const unmanagedSubscription = {
    id: `sub_unmanaged_${crypto.randomBytes(8).toString("hex")}`,
    object: "subscription",
    customer: unmanagedCustomer.id,
    status: "active",
    created: Math.floor(Date.now() / 1000),
    items: { data: [{ price: { id: "price_not_pro" } }] },
  };
  const unmanagedDelivery = await postSignedEvent(
    signedEvent("customer.subscription.created", unmanagedSubscription)
  );
  assert.equal(unmanagedDelivery.response.status, 200);
  assert.equal(unmanagedDelivery.json.entitlement, "ignored");
  assert.equal((await planState(unmanagedUser)).dbPlan, "free");

  console.log("Pro billing lifecycle verification passed:");
  console.log("- strict authenticated Monthly and Yearly Checkout Sessions");
  console.log("- canonical PDF compatibility checkout");
  console.log("- real Stripe CLI-forwarded activation and cancellation webhooks");
  console.log("- duplicate-subscription and duplicate-event protection");
  console.log("- both billing portal endpoints and unmanaged-price rejection");
}

run()
  .catch((error) => {
    console.error(`Pro billing lifecycle verification failed: ${error?.stack ?? error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    await pool.end();
  });
