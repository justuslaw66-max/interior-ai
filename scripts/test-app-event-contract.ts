import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  APP_EVENT_TYPES,
  CLIENT_APP_EVENT_TYPES,
  INTERNAL_APP_EVENT_TYPES,
  isClientAppEventType,
} from "../lib/app-event-contract";
import { postClientAppEvent } from "../lib/client-app-event";
import { createClientAppEventHandler } from "../lib/client-app-event-handler";
import {
  buildCheckoutStartedEventMeta,
  normalizeCheckoutTrackingContext,
} from "../lib/checkout-app-event";
import { FUNNEL_EVENT_TYPES } from "../lib/design-page-paywall";

const root = process.cwd();

const EXPECTED_CLIENT_EVENTS = [
  "landing_viewed",
  "design_started",
  "first_item_added",
  "third_item_added",
  "first_run_activation_step_completed",
  "export_clicked",
  "upgrade_clicked",
  "share_link_opened",
  "export_opened",
  "export_pdf_clicked",
  "export_upgrade_prompt_shown",
  "checkout_completed",
  "beta_feedback_submitted",
] as const;

const EXPECTED_INTERNAL_EVENTS = [
  "share_link_created",
  "design_duplicated",
  "share_design_duplicated",
  "export_printed",
  "checkout_started",
  "checkout_variant_validation_failed",
  "upgrade_checkout_started",
  "upgrade_checkout_completed",
  "billing_portal_opened",
  "subscription_canceled",
  "webhook_failed",
  "variant_resolution_issue",
] as const;

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function sourceFiles(directory: string): string[] {
  const absoluteDirectory = join(root, directory);
  return readdirSync(absoluteDirectory).flatMap((entry) => {
    const absolutePath = join(absoluteDirectory, entry);
    if (statSync(absolutePath).isDirectory()) {
      return sourceFiles(relative(root, absolutePath));
    }
    return /\.(?:ts|tsx)$/.test(entry) ? [relative(root, absolutePath)] : [];
  });
}

function requestFor(eventType: string, init: { headers?: Record<string, string>; body?: string } = {}) {
  return new Request("https://staging.example.test/api/track/app-event", {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.body ?? JSON.stringify({
      eventType,
      designId: "design-1",
      shareToken: "share-1",
      meta: { source: "contract-test" },
    }),
  });
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function main() {
  assert.deepEqual(CLIENT_APP_EVENT_TYPES, EXPECTED_CLIENT_EVENTS);
  assert.deepEqual(INTERNAL_APP_EVENT_TYPES, EXPECTED_INTERNAL_EVENTS);
  assert.equal(new Set(APP_EVENT_TYPES).size, APP_EVENT_TYPES.length);
  assert.equal(APP_EVENT_TYPES.length, 25);
  FUNNEL_EVENT_TYPES.forEach((eventType) => assert.equal(isClientAppEventType(eventType), true));
  ["checkout_started", "upgrade_checkout_started", "upgrade_checkout_completed"].forEach(
    (eventType) => assert.equal(isClientAppEventType(eventType), false),
  );

  const loggedEvents: Array<Record<string, unknown>> = [];
  const rateLimitCalls: Array<{ key: string; limit: number; windowMs: number }> = [];
  const handler = createClientAppEventHandler({
    authenticate: async () => ({ user: { id: "user-1" } }),
    logEvent: async (payload) => {
      loggedEvents.push(payload as unknown as Record<string, unknown>);
      return { persisted: true, eventId: `event-${payload.eventType}` };
    },
    checkRateLimit: (key, limit, windowMs) => {
      rateLimitCalls.push({ key, limit, windowMs });
      return { ok: true };
    },
    skipPersistence: false,
  });

  for (const eventType of CLIENT_APP_EVENT_TYPES) {
    const response = await handler(requestFor(eventType));
    assert.equal(response.status, 200, `${eventType} should be accepted`);
    assert.deepEqual(await responseJson(response), {
      ok: true,
      persisted: true,
      eventId: `event-${eventType}`,
    });
  }
  assert.equal(loggedEvents.length, CLIENT_APP_EVENT_TYPES.length);
  assert.deepEqual(rateLimitCalls[0], {
    key: "user:user-1:app-event",
    limit: 30,
    windowMs: 60_000,
  });

  const boundedResponse = await handler(requestFor("landing_viewed", {
    body: JSON.stringify({
      eventType: "landing_viewed",
      designId: `  ${"d".repeat(200)}  `,
      shareToken: `  ${"s".repeat(200)}  `,
    }),
  }));
  assert.equal(boundedResponse.status, 200);
  assert.equal(String(loggedEvents.at(-1)?.designId).length, 128);
  assert.equal(String(loggedEvents.at(-1)?.shareToken).length, 128);

  let rejectedWriteCount = 0;
  const rejectionHandler = createClientAppEventHandler({
    authenticate: async () => null,
    logEvent: async () => {
      rejectedWriteCount += 1;
      return { persisted: true, eventId: "unexpected" };
    },
    checkRateLimit: () => ({ ok: true }),
    skipPersistence: false,
  });
  for (const eventType of [...INTERNAL_APP_EVENT_TYPES, "unknown_event"] as const) {
    const response = await rejectionHandler(requestFor(eventType));
    assert.equal(response.status, 400, `${eventType} must be rejected`);
  }
  assert.equal(rejectedWriteCount, 0);

  let qaWriteCount = 0;
  const qaHandler = createClientAppEventHandler({
    authenticate: async () => null,
    logEvent: async () => {
      qaWriteCount += 1;
      return { persisted: true, eventId: "unexpected" };
    },
    checkRateLimit: () => ({ ok: true }),
    skipPersistence: true,
  });
  assert.deepEqual(await responseJson(await qaHandler(requestFor("landing_viewed"))), {
    ok: true,
    persisted: false,
    eventId: null,
    skipped: "qa",
  });
  assert.equal(qaWriteCount, 0);

  const failedPersistenceHandler = createClientAppEventHandler({
    authenticate: async () => null,
    logEvent: async () => ({ persisted: false, eventId: null, error: "sensitive detail" }),
    checkRateLimit: () => ({ ok: true }),
    skipPersistence: false,
  });
  const failedResponse = await failedPersistenceHandler(requestFor("beta_feedback_submitted"));
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await responseJson(failedResponse), {
    ok: false,
    persisted: false,
    eventId: null,
    error: "Unable to persist app event",
  });

  let guardedAuthenticationCount = 0;
  const guardedHandler = createClientAppEventHandler({
    authenticate: async () => {
      guardedAuthenticationCount += 1;
      return null;
    },
    logEvent: async () => ({ persisted: true, eventId: "unexpected" }),
    checkRateLimit: () => ({ ok: true }),
    skipPersistence: false,
  });
  assert.equal((await guardedHandler(requestFor("landing_viewed", {
    headers: { "content-type": "text/plain" },
  }))).status, 415);
  assert.equal((await guardedHandler(requestFor("landing_viewed", {
    headers: { "content-type": "application/json-patch+json" },
  }))).status, 415);
  assert.equal((await guardedHandler(requestFor("landing_viewed", {
    headers: { origin: "https://attacker.example" },
  }))).status, 403);
  assert.equal((await guardedHandler(requestFor("landing_viewed", {
    headers: { "content-length": String(32 * 1024 + 1) },
  }))).status, 413);
  assert.equal(guardedAuthenticationCount, 0);
  const proxiedSameOriginResponse = await guardedHandler(
    new Request("http://127.0.0.1:3000/api/track/app-event", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "staging.example.test",
        origin: "https://staging.example.test",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ eventType: "landing_viewed" }),
    }),
  );
  assert.equal(proxiedSameOriginResponse.status, 200);
  const oversizedBody = JSON.stringify({ eventType: "landing_viewed", meta: { value: "x".repeat(33 * 1024) } });
  assert.equal((await guardedHandler(requestFor("landing_viewed", { body: oversizedBody }))).status, 413);
  let streamPulls = 0;
  let streamCanceled = false;
  const oversizedStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      streamPulls += 1;
      controller.enqueue(new Uint8Array(16 * 1024));
      if (streamPulls >= 64) controller.close();
    },
    cancel() {
      streamCanceled = true;
    },
  });
  const streamedResponse = await guardedHandler(
    new Request("https://staging.example.test/api/track/app-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversizedStream,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
  );
  assert.equal(streamedResponse.status, 413);
  assert.equal(streamCanceled, true);
  assert.ok(streamPulls <= 4, `oversized stream should be canceled early; observed ${streamPulls} pulls`);

  const limitedHandler = createClientAppEventHandler({
    authenticate: async () => null,
    logEvent: async () => ({ persisted: true, eventId: "unexpected" }),
    checkRateLimit: (key, limit, windowMs) => {
      assert.equal(key, "ip:198.51.100.7:app-event");
      assert.equal(limit, 30);
      assert.equal(windowMs, 60_000);
      return { ok: false };
    },
    skipPersistence: false,
  });
  assert.equal((await limitedHandler(requestFor("landing_viewed", {
    headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.2" },
  }))).status, 429);

  let helperRequest: { input: string; init: RequestInit } | null = null;
  await postClientAppEvent(
    { eventType: "beta_feedback_submitted", designId: "design-2", meta: { note: "test" } },
    async (input, init) => {
      helperRequest = { input, init };
      return Response.json({ ok: true, persisted: true, eventId: "event-feedback" });
    },
  );
  assert.equal(helperRequest?.input, "/api/track/app-event");
  assert.equal(helperRequest?.init.method, "POST");
  assert.equal((helperRequest?.init.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(helperRequest?.init.body)), {
    eventType: "beta_feedback_submitted",
    designId: "design-2",
    meta: { note: "test" },
  });

  const checkoutTracking = normalizeCheckoutTrackingContext({
    interval: "yearly",
    source: "plans_sheet",
    designId: `design-${"x".repeat(200)}`,
    reason: `reason-${"y".repeat(120)}`,
    ctaVariant: "see_pricing",
    pricingLayout: "annual_highlight",
    experimentSlot: "value_stack_v2",
    forceFallback: true,
  });
  assert.equal(checkoutTracking.designId?.length, 128);
  assert.equal(checkoutTracking.reason.length, 80);
  assert.equal(buildCheckoutStartedEventMeta({
    tracking: checkoutTracking,
    priceId: "price-yearly",
    sessionId: "cs_test_123",
  }).sessionId, "cs_test_123");

  const directEndpointUsers = ["app", "components", "features", "lib"]
    .flatMap(sourceFiles)
    .filter((path) => path !== "lib/client-app-event.ts")
    .filter((path) => source(path).includes("/api/track/app-event"));
  assert.deepEqual(directEndpointUsers, []);

  const designPageSource = source("app/design/page.tsx");
  assert.doesNotMatch(designPageSource, /logFunnelEvent\(\s*["']checkout_started["']/);
  const startCheckoutIndex = designPageSource.indexOf("const startCheckout");
  assert.ok(startCheckoutIndex >= 0);
  const startCheckoutSource = designPageSource.slice(startCheckoutIndex, startCheckoutIndex + 2800);
  assert.match(startCheckoutSource, /source:\s*["']plans_sheet["']/);
  assert.doesNotMatch(startCheckoutSource, /source:\s*["']upgrade_modal["']/);
  assert.match(source("app/checkout/success/confirm-client.tsx"), /trust:\s*["']client_reported["']/);

  const stripeCheckoutSource = source("app/api/stripe/checkout/route.ts");
  assert.equal((stripeCheckoutSource.match(/eventType:\s*["']checkout_started["']/g) ?? []).length, 1);
  assert.match(stripeCheckoutSource, /sessionId:\s*checkoutSession\.id/);
  const postHogProviderSource = source("app/providers/PostHogProvider.tsx");
  assert.match(postHogProviderSource, /NEXT_PUBLIC_ENABLE_QA_HOOKS === "1"/);
  assert.match(postHogProviderSource, /clientAnalyticsDisabled/);

  console.log("Client app-event contract checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
