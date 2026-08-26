import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ApiBoundaryError, readJsonRequest } from "@/lib/api-boundary";
import { sanitizeObservabilityMeta } from "@/lib/observability";
import {
  parseDesignNotesInput,
  parseDesignNotesOutput,
} from "@/lib/ai/design-notes-contract";
import { validateCabinetSourceImportFile } from "@/features/cabinetry/importPolicy";
import {
  parseDesignClaimPayload,
  parseDesignCreatePayload,
} from "@/lib/design-route-payload";
import { isUsablePostHogKey } from "@/lib/posthog-config";
import {
  APP_EVENT_PROVENANCE_VERSION,
  BROWSER_AUTHORIZED_ANALYTICS_EVENT_TYPES,
  INTERNAL_DIAGNOSTIC_EVENT_TYPES,
  RESERVED_LEGACY_LIFECYCLE_EVENT_TYPES,
  TRUSTED_SERVER_LIFECYCLE_EVENT_TYPES,
  buildTrustedLifecycleProvenance,
  hasCurrentTrustedLifecycleProvenance,
  isVerifiedStripeEventId,
  parseBrowserAnalyticsEventInput,
} from "@/lib/app-event-provenance";
import {
  browserAnalyticsWhere,
  trustedWebhookFailureWhere,
} from "@/lib/app-event-operations";
import {
  ingestBrowserAppEvent,
  type BrowserAppEventRecordInput,
} from "@/lib/browser-app-event-ingestion";
import {
  buildTrustedLifecycleEventData,
  claimTrustedLifecycleEventWith,
  persistTrustedLifecycleEventWith,
} from "@/lib/trusted-app-event-core";
import {
  bindCertificationAppEventMeta,
  certificationAppEventBinding,
} from "@/lib/certification-app-event-binding";
import {
  applyVerifiedStripeEntitlementOnce,
  verifyStripeWebhookEnvelope,
  type StripeEntitlementDecision,
  type StripeWebhookTransactionPort,
} from "@/lib/stripe-webhook-transaction";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

async function testRequestBoundary() {
  const parsed = await readJsonRequest(
    new Request("http://localhost/test", { method: "POST", body: '{"ok":true}' }),
    64
  );
  assert.deepEqual(parsed, { ok: true });

  await assert.rejects(
    () => readJsonRequest(
      new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ value: "x".repeat(100) }) }),
      32
    ),
    (error) => error instanceof ApiBoundaryError && error.code === "PAYLOAD_TOO_LARGE"
  );
  await assert.rejects(
    () => readJsonRequest(
      new Request("http://localhost/test", { method: "POST", body: "not-json" }),
      64
    ),
    (error) => error instanceof ApiBoundaryError && error.code === "BAD_REQUEST"
  );
}

function testPrivacySanitization() {
  const safe = sanitizeObservabilityMeta({
    designId: "design-1",
    authorization: "Bearer secret",
    nested: { shareToken: "bearer-token", result: "ok" },
  });
  assert.equal(safe?.designId, "design-1");
  assert.equal(safe?.authorization, "[redacted]");
  assert.deepEqual(safe?.nested, { shareToken: "[redacted]", result: "ok" });
}

function testPostHogConfiguration() {
  assert.equal(isUsablePostHogKey("phc_live_key"), true);
  assert.equal(isUsablePostHogKey("  phc_live_key  "), true);
  assert.equal(isUsablePostHogKey(undefined), false);
  assert.equal(isUsablePostHogKey(""), false);
  assert.equal(isUsablePostHogKey("[SENSITIVE]"), false);
  assert.equal(isUsablePostHogKey("[REDACTED]"), false);
  assert.equal(isUsablePostHogKey("placeholder"), false);
}

function testAiContracts() {
  const input = parseDesignNotesInput({
    design: {
      id: "design-1",
      items: [{ id: "item-1", category: "sofa", price: 1200 }],
      categories: ["sofa"],
      budget: "1200",
    },
    mode: "designer",
  });
  assert.equal(input?.design.items.length, 1);
  assert.equal(input?.mode, "designer");
  assert.equal(
    parseDesignNotesInput({ design: { items: Array.from({ length: 501 }, () => ({})) } }),
    null
  );

  assert.ok(parseDesignNotesOutput({
    summary: ["One", "Two", "Three"],
    rationale: "A bounded rationale.",
    suggestions: [{
      id: "suggestion-1",
      label: "Resize the rug",
      action: { type: "RUG_RESIZE_TO_SOFA" },
    }],
  }));
  assert.equal(parseDesignNotesOutput({ summary: [], rationale: "x", suggestions: [] }), null);
}

function testImportContracts() {
  assert.equal(
    validateCabinetSourceImportFile({ name: "cabinet.json", size: 1024, type: "application/json" }).ok,
    true
  );
  assert.equal(
    validateCabinetSourceImportFile({ name: "cabinet.txt", size: 1024, type: "text/plain" }).ok,
    false
  );
  assert.equal(
    validateCabinetSourceImportFile({ name: "cabinet.json", size: 3 * 1024 * 1024, type: "application/json" }).ok,
    false
  );

  const baseDesign = { roomWidth: 4, roomDepth: 5, items: [] };
  assert.equal(parseDesignCreatePayload(baseDesign).ok, true);
  assert.equal(parseDesignCreatePayload({ ...baseDesign, roomWidth: Number.NaN }).ok, false);
  assert.equal(parseDesignCreatePayload({ ...baseDesign, items: Array.from({ length: 2001 }, () => ({})) }).ok, false);
  assert.equal(parseDesignClaimPayload({
    anonymousId: "not-a-uuid",
    designSnapshot: baseDesign,
  }).ok, false);
}

function testAppEventProvenanceContract() {
  assert.deepEqual(BROWSER_AUTHORIZED_ANALYTICS_EVENT_TYPES, [
    "landing_viewed",
    "design_started",
    "first_item_added",
    "third_item_added",
    "first_run_activation_step_completed",
    "export_clicked",
    "upgrade_clicked",
    "share_link_created",
    "share_link_opened",
    "design_duplicated",
    "share_design_duplicated",
    "export_opened",
    "export_printed",
    "export_pdf_clicked",
    "export_upgrade_prompt_shown",
    "checkout_started",
    "checkout_return_observed",
    "upgrade_checkout_started",
    "checkout_success_viewed",
    "billing_portal_opened",
    "beta_feedback_submitted",
  ]);
  assert.deepEqual(TRUSTED_SERVER_LIFECYCLE_EVENT_TYPES, [
    "upgrade_checkout_completed",
    "subscription_canceled",
    "webhook_failed",
    "stripe_webhook_processed",
  ]);
  assert.deepEqual(RESERVED_LEGACY_LIFECYCLE_EVENT_TYPES, ["checkout_completed"]);
  assert.deepEqual(INTERNAL_DIAGNOSTIC_EVENT_TYPES, [
    "checkout_variant_validation_failed",
    "variant_resolution_issue",
  ]);

  const browserIdentities = ["anonymous", "ordinary", "pro", "administrator"];
  const deniedLifecycleTypes: readonly string[] = [
    ...TRUSTED_SERVER_LIFECYCLE_EVENT_TYPES,
    ...RESERVED_LEGACY_LIFECYCLE_EVENT_TYPES,
  ];
  for (const identity of browserIdentities) {
    for (const eventType of deniedLifecycleTypes) {
      assert.deepEqual(
        parseBrowserAnalyticsEventInput({ eventType }),
        { ok: false, error: "invalid_event_type" },
        `${identity} browser caller must not submit ${eventType}`
      );
    }
    INTERNAL_DIAGNOSTIC_EVENT_TYPES.forEach((diagnosticEventType: string) => {
      assert.deepEqual(
        parseBrowserAnalyticsEventInput({ eventType: diagnosticEventType }),
        { ok: false, error: "invalid_event_type" },
        `${identity} browser caller must not submit ${diagnosticEventType}`
      );
    });
  }

  for (const eventType of BROWSER_AUTHORIZED_ANALYTICS_EVENT_TYPES) {
    const result = parseBrowserAnalyticsEventInput({ eventType, meta: { source: "security-test" } });
    assert.equal(result.ok, true, `${eventType} should remain browser-authorized analytics`);
  }
  assert.deepEqual(parseBrowserAnalyticsEventInput({ eventType: "unknown_event" }), {
    ok: false,
    error: "invalid_event_type",
  });
  assert.deepEqual(parseBrowserAnalyticsEventInput(null), {
    ok: false,
    error: "invalid_event_type",
  });

  const reservedAttempts = [
    { authority: "TRUSTED_SERVER_LIFECYCLE" },
    { producer: "VERIFIED_STRIPE_WEBHOOK" },
    { provenanceVersion: APP_EVENT_PROVENANCE_VERSION },
    { verificationMethod: "STRIPE_SIGNATURE" },
    { trusted: true },
    { trustedSource: "stripe" },
    { internalActor: "admin" },
    { webhookIdentity: "evt_spoofed" },
    { externalEventId: "evt_spoofed" },
    { releaseEvidenceAuthority: true },
    { certificationRunBinding: { certificationId: "spoofed" } },
  ];
  for (const reserved of reservedAttempts) {
    assert.deepEqual(
      parseBrowserAnalyticsEventInput({ eventType: "design_started", ...reserved }),
      { ok: false, error: "reserved_provenance_field" }
    );
    assert.deepEqual(
      parseBrowserAnalyticsEventInput({ eventType: "design_started", meta: reserved }),
      { ok: false, error: "reserved_provenance_field" }
    );
  }
  assert.deepEqual(
    parseBrowserAnalyticsEventInput({
      eventType: "checkout_success_viewed",
      meta: { nested: { external_event_id: "evt_spoofed" } },
    }),
    { ok: false, error: "reserved_provenance_field" }
  );

  assert.throws(
    () => buildTrustedLifecycleProvenance(undefined),
    /verified trusted producer context/i
  );
  assert.throws(
    () => buildTrustedLifecycleProvenance({
      producer: "PUBLIC_BROWSER_INGESTION",
      verificationMethod: "STRIPE_SIGNATURE",
      externalEventId: "evt_spoofed",
    }),
    /verified trusted producer context/i
  );
  assert.deepEqual(
    buildTrustedLifecycleProvenance({
      producer: "VERIFIED_STRIPE_WEBHOOK",
      verificationMethod: "STRIPE_SIGNATURE",
      externalEventId: "evt_verified",
    }),
    {
      authority: "TRUSTED_SERVER_LIFECYCLE",
      producer: "VERIFIED_STRIPE_WEBHOOK",
      verificationMethod: "STRIPE_SIGNATURE",
      provenanceVersion: APP_EVENT_PROVENANCE_VERSION,
      externalEventId: "evt_verified",
    }
  );

  const trustedRecord = {
    eventType: "webhook_failed",
    authority: "TRUSTED_SERVER_LIFECYCLE",
    producer: "VERIFIED_STRIPE_WEBHOOK",
    verificationMethod: "STRIPE_SIGNATURE",
    provenanceVersion: APP_EVENT_PROVENANCE_VERSION,
    externalEventId: "evt_verified",
    meta: null,
  };
  assert.equal(hasCurrentTrustedLifecycleProvenance(trustedRecord), true);
  assert.equal(hasCurrentTrustedLifecycleProvenance({
    ...trustedRecord,
    authority: "BROWSER_AUTHORIZED_ANALYTICS",
  }), false);
  assert.equal(hasCurrentTrustedLifecycleProvenance({
    ...trustedRecord,
    authority: "UNTRUSTED_OR_LEGACY",
  }), false);
  assert.equal(hasCurrentTrustedLifecycleProvenance({
    ...trustedRecord,
    producer: null,
  }), false);
  for (const externalEventId of ["", "evt_", "arbitrary", "evt-bad"]) {
    assert.equal(hasCurrentTrustedLifecycleProvenance({
      ...trustedRecord,
      externalEventId,
    }), false);
    assert.equal(isVerifiedStripeEventId(externalEventId), false);
  }
  assert.equal(isVerifiedStripeEventId("evt_verified_123"), true);
  assert.equal(hasCurrentTrustedLifecycleProvenance({
    ...trustedRecord,
    authority: "UNTRUSTED_OR_LEGACY",
    meta: {
      authority: "TRUSTED_SERVER_LIFECYCLE",
      producer: "VERIFIED_STRIPE_WEBHOOK",
      verified: true,
    },
  }), false);

  const since = new Date("2026-08-07T00:00:00.000Z");
  assert.deepEqual(browserAnalyticsWhere("checkout_started", since), {
    eventType: "checkout_started",
    createdAt: { gte: since },
    authority: "BROWSER_AUTHORIZED_ANALYTICS",
  });
  assert.deepEqual(trustedWebhookFailureWhere(since), {
    eventType: "webhook_failed",
    createdAt: { gte: since },
    authority: "TRUSTED_SERVER_LIFECYCLE",
    producer: "VERIFIED_STRIPE_WEBHOOK",
    verificationMethod: "STRIPE_SIGNATURE",
    provenanceVersion: APP_EVENT_PROVENANCE_VERSION,
    externalEventId: { startsWith: "evt_" },
  });

  const sameNamedWebhookFailures = [
    trustedRecord,
    {
      ...trustedRecord,
      authority: "BROWSER_AUTHORIZED_ANALYTICS",
      producer: "PUBLIC_BROWSER_INGESTION",
      verificationMethod: "PUBLIC_REQUEST",
      externalEventId: null,
    },
    {
      ...trustedRecord,
      authority: "UNTRUSTED_OR_LEGACY",
      producer: null,
      verificationMethod: null,
      provenanceVersion: null,
      externalEventId: null,
    },
    { ...trustedRecord, externalEventId: "spoofed" },
  ];
  assert.deepEqual(
    sameNamedWebhookFailures.filter(hasCurrentTrustedLifecycleProvenance),
    [trustedRecord],
    "Only the exactly verified record may satisfy authoritative operations evidence."
  );
}

function testCertificationAppEventBinding() {
  const runtimeEnvironment = {
    CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
    CERTIFICATION_RUNTIME_STAGE_ATTEMPT: "2",
    PRODUCTION_CERTIFICATION_ID: "certification-binding-test",
    PRODUCTION_EVIDENCE_CANDIDATE_ID: "candidate-binding-test",
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: "a".repeat(40),
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: "b".repeat(40),
  };
  const runtime = certificationAppEventBinding(
    "browser-public-ingestion",
    runtimeEnvironment,
  );
  assert.ok(runtime);
  assert.equal(runtime.stage, "runtime-smoke");
  assert.equal(runtime.stageAttempt, 2);
  assert.equal(runtime.browserOwnerId, null);
  assert.match(runtime.runIdentitySha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    bindCertificationAppEventMeta(
      { source: "runtime" },
      "browser-public-ingestion",
      runtimeEnvironment,
    ),
    { source: "runtime", certificationRunBinding: runtime },
  );

  const browserEnvironment = {
    CERTIFICATION_ENVIRONMENT_STAGE: "browser-owners",
    REQUIRED_TEST_STAGE_ATTEMPT: "3",
    REQUIRED_TEST_BROWSER_OWNER_ID: "public-share",
    PRODUCTION_CERTIFICATION_ID: "certification-binding-test",
    REQUIRED_TEST_RELEASE_CANDIDATE_ID: "candidate-binding-test",
    REQUIRED_TEST_SOURCE_COMMIT_SHA: "a".repeat(40),
    REQUIRED_TEST_SOURCE_TREE_SHA: "b".repeat(40),
  };
  const browser = certificationAppEventBinding(
    "browser-server-action",
    browserEnvironment,
  );
  assert.ok(browser);
  assert.equal(browser.stage, "browser-owners");
  assert.equal(browser.stageAttempt, 3);
  assert.equal(browser.browserOwnerId, "public-share");
  assert.notEqual(browser.runIdentitySha256, runtime.runIdentitySha256);

  assert.equal(
    certificationAppEventBinding("internal-server-diagnostic", {
      CERTIFICATION_ENVIRONMENT_STAGE: "production",
    }),
    null,
  );
  assert.deepEqual(
    bindCertificationAppEventMeta(
      { source: "ordinary-runtime" },
      "internal-server-diagnostic",
      { CERTIFICATION_ENVIRONMENT_STAGE: "production" },
    ),
    { source: "ordinary-runtime" },
  );
  assert.throws(
    () =>
      certificationAppEventBinding("browser-public-ingestion", {
        CERTIFICATION_ENVIRONMENT_STAGE: "runtime-smoke",
      }),
    /requires valid PRODUCTION_CERTIFICATION_ID/,
  );
}

async function testBrowserAppEventIngestion() {
  const identities = [
    { name: "anonymous", userId: null, plan: "free", administrator: false },
    { name: "ordinary", userId: "user-ordinary", plan: "free", administrator: false },
    { name: "pro", userId: "user-pro", plan: "pro", administrator: false },
    { name: "administrator", userId: "user-admin", plan: "pro", administrator: true },
  ];
  const deniedEventTypes = [
    ...TRUSTED_SERVER_LIFECYCLE_EVENT_TYPES,
    ...RESERVED_LEGACY_LIFECYCLE_EVENT_TYPES,
    ...INTERNAL_DIAGNOSTIC_EVENT_TYPES,
    "unknown_event",
  ];

  for (const identity of identities) {
    for (const eventType of deniedEventTypes) {
      const records: BrowserAppEventRecordInput[] = [];
      const result = await ingestBrowserAppEvent({ eventType }, identity, {
        findSharedDesignId: async () => "unexpected",
        findOwnedDesignId: async () => "unexpected",
        recordBrowserEvent: async (record) => {
          records.push(record);
          return { persisted: true, eventId: "unexpected" };
        },
      });
      assert.deepEqual(result, { ok: false, error: "invalid_event" });
      assert.equal(records.length, 0, `${identity.name} persisted ${eventType}`);
    }

    const spoofedRecords: BrowserAppEventRecordInput[] = [];
    const spoofed = await ingestBrowserAppEvent(
      {
        eventType: "design_started",
        meta: { externalEventId: "evt_spoofed" },
      },
      identity,
      {
        findSharedDesignId: async () => null,
        findOwnedDesignId: async () => null,
        recordBrowserEvent: async (record) => {
          spoofedRecords.push(record);
          return { persisted: true, eventId: "unexpected" };
        },
      }
    );
    assert.deepEqual(spoofed, { ok: false, error: "invalid_event" });
    assert.equal(spoofedRecords.length, 0);

    const acceptedRecords: BrowserAppEventRecordInput[] = [];
    const accepted = await ingestBrowserAppEvent(
      { eventType: "design_started", meta: { source: identity.name } },
      identity,
      {
        findSharedDesignId: async () => null,
        findOwnedDesignId: async () => null,
        recordBrowserEvent: async (record) => {
          acceptedRecords.push(record);
          return { persisted: true, eventId: `browser-${identity.name}` };
        },
      }
    );
    assert.deepEqual(accepted, {
      ok: true,
      persisted: true,
      eventId: `browser-${identity.name}`,
    });
    assert.deepEqual(acceptedRecords, [{
      eventType: "design_started",
      userId: identity.userId,
      designId: null,
      shareToken: null,
      meta: { source: identity.name },
    }]);
    assert.equal("authority" in acceptedRecords[0], false);
    assert.equal("producer" in acceptedRecords[0], false);
  }
}

async function testTrustedEmitterCore() {
  const trustedContext = {
    producer: "VERIFIED_STRIPE_WEBHOOK",
    verificationMethod: "STRIPE_SIGNATURE",
    externalEventId: "evt_required_security_test",
  } as const;
  const payload = {
    id: "stripe:evt_required_security_test:failure",
    eventType: "webhook_failed",
    meta: { reason: "handler", authorization: "secret" },
  } as const;
  const expected = buildTrustedLifecycleEventData(payload, trustedContext);
  assert.deepEqual(expected, {
    id: payload.id,
    eventType: "webhook_failed",
    userId: null,
    designId: null,
    shareToken: null,
    meta: { reason: "handler", authorization: "[redacted]" },
    authority: "TRUSTED_SERVER_LIFECYCLE",
    producer: "VERIFIED_STRIPE_WEBHOOK",
    verificationMethod: "STRIPE_SIGNATURE",
    provenanceVersion: APP_EVENT_PROVENANCE_VERSION,
    externalEventId: "evt_required_security_test",
  });

  let createCalls = 0;
  assert.throws(
    () => persistTrustedLifecycleEventWith(
      async () => {
        createCalls += 1;
      },
      payload,
      { ...trustedContext, externalEventId: "forged" }
    ),
    /verified trusted producer context/i
  );
  assert.equal(createCalls, 0, "Invalid producer context must fail before persistence.");

  const persisted: unknown[] = [];
  await persistTrustedLifecycleEventWith(
    async (data) => {
      persisted.push(data);
    },
    payload,
    trustedContext
  );
  assert.deepEqual(persisted, [expected]);
  await assert.rejects(
    () => persistTrustedLifecycleEventWith(
      async () => {
        throw new Error("database write failed");
      },
      payload,
      trustedContext
    ),
    /database write failed/
  );

  const claims = new Set<string>();
  const claim = (data: ReturnType<typeof buildTrustedLifecycleEventData>) => {
    const count = data.id && !claims.has(data.id) ? 1 : 0;
    if (data.id) claims.add(data.id);
    return Promise.resolve({ count });
  };
  assert.equal(await claimTrustedLifecycleEventWith(claim, payload, trustedContext), true);
  assert.equal(await claimTrustedLifecycleEventWith(claim, payload, trustedContext), false);
  assert.equal(claims.size, 1);
}

function createStripeTransactionHarness(options?: { failUpgrade?: boolean }) {
  let users = [{ id: "user-1", plan: "free" }];
  let records: string[] = [];

  const runTransaction = async <T>(
    operation: (port: StripeWebhookTransactionPort) => Promise<T>
  ): Promise<T> => {
    const usersBefore = users.map((user) => ({ ...user }));
    const recordsBefore = [...records];
    const port: StripeWebhookTransactionPort = {
      claimProcessed: async () => {
        if (records.includes("stripe:evt_transaction")) return false;
        records.push("stripe:evt_transaction");
        return true;
      },
      findUsers: async () => users.map((user) => ({ ...user })),
      updateUsers: async (_customerId, decision) => {
        users = users.map((user) => ({ ...user, plan: decision.plan }));
      },
      recordUpgrade: async (userId) => {
        if (options?.failUpgrade) throw new Error("trusted transition write failed");
        records.push(`stripe:evt_transaction:upgrade:${userId}`);
      },
      recordCancellation: async (userId) => {
        records.push(`stripe:evt_transaction:cancellation:${userId}`);
      },
    };
    try {
      return await operation(port);
    } catch (error) {
      users = usersBefore;
      records = recordsBefore;
      throw error;
    }
  };

  return {
    runTransaction,
    users: () => users.map((user) => ({ ...user })),
    records: () => [...records],
  };
}

async function testStripeWebhookSecurityBehavior() {
  const invalidSignatureRecords: string[] = [];
  const invalid = verifyStripeWebhookEnvelope(
    () => {
      throw new Error("invalid signature");
    },
    "body",
    "bad-signature",
    "whsec_test"
  );
  if (invalid.ok) invalidSignatureRecords.push("unexpected_verified_event");
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalidSignatureRecords, [], "Invalid signatures cannot reach emission.");

  const valid = verifyStripeWebhookEnvelope(
    () => ({ id: "evt_transaction", type: "checkout.session.completed" }),
    "body",
    "valid-signature",
    "whsec_test"
  );
  assert.equal(valid.ok, true);

  const decision: StripeEntitlementDecision = {
    plan: "pro",
    subscriptionId: "sub_required_security_test",
    reason: "managed_checkout_completed",
  };
  const successful = createStripeTransactionHarness();
  const first = await applyVerifiedStripeEntitlementOnce(
    "cus_required_security_test",
    decision,
    successful.runTransaction
  );
  assert.equal(first.duplicate, false);
  assert.deepEqual(successful.users(), [{ id: "user-1", plan: "pro" }]);
  assert.deepEqual(successful.records(), [
    "stripe:evt_transaction",
    "stripe:evt_transaction:upgrade:user-1",
  ]);

  const retry = await applyVerifiedStripeEntitlementOnce(
    "cus_required_security_test",
    decision,
    successful.runTransaction
  );
  assert.equal(retry.duplicate, true);
  assert.equal(successful.records().length, 2, "Webhook retry must not duplicate evidence.");

  const failing = createStripeTransactionHarness({ failUpgrade: true });
  await assert.rejects(
    () => applyVerifiedStripeEntitlementOnce(
      "cus_required_security_test",
      decision,
      failing.runTransaction
    ),
    /trusted transition write failed/
  );
  assert.deepEqual(failing.users(), [{ id: "user-1", plan: "free" }]);
  assert.deepEqual(failing.records(), [], "Trusted persistence failure must roll back claim and entitlement.");
}

function moduleSpecifiers(file: string): string[] {
  const sourceText = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function moduleSpecifierTargets(
  importer: string,
  specifier: string,
  targetRelativePath: string
): boolean {
  let resolved: string;
  if (specifier.startsWith("@/")) {
    resolved = path.join(root, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    resolved = path.resolve(path.dirname(importer), specifier);
  } else {
    return false;
  }
  const withoutExtension = (value: string) => value.replace(/\.(?:ts|tsx|js|jsx)$/, "");
  return withoutExtension(resolved) === withoutExtension(path.join(root, targetRelativePath));
}

function filesImporting(targetRelativePath: string, files: string[]): string[] {
  return files
    .filter((file) => moduleSpecifiers(file).some((specifier) =>
      moduleSpecifierTargets(file, specifier, targetRelativePath)
    ))
    .map((file) => path.relative(root, file))
    .sort();
}

function testSourceGuards() {
  const designRoute = read("app/api/designs/[id]/route.ts");
  assert.match(designRoute, /findFirst\(\{\s*where: \{ id, userId \}/);
  assert.doesNotMatch(designRoute, /error: String\(/);
  assert.match(designRoute, /NOT_FOUND[\s\S]*Design not found/);

  const confirmRoute = read("app/api/shopify/confirm/route.ts");
  assert.doesNotMatch(confirmRoute, /shopifyOrder\.(create|upsert|update)/);
  assert.doesNotMatch(confirmRoute, /\b(total|currency)\b/);
  assert.match(confirmRoute, /checkout_return_observed/);
  assert.match(confirmRoute, /provider-verified webhook/);

  const clickRoute = read("app/api/track/click/route.ts");
  assert.match(clickRoute, /assertStrictVariantResolution/);
  assert.doesNotMatch(clickRoute, /payload\.(price|retailer|buyUrl)/);
  const conversionRoute = read("app/api/track/event/route.ts");
  assert.match(conversionRoute, /isAdminEmail/);
  assert.match(conversionRoute, /value: null, currency: null/);

  const appEvents = read("lib/app-events.ts");
  assert.match(appEvents, /shareToken: null/);
  assert.match(appEvents, /createHash\("sha256"\)/);
  assert.match(appEvents, /recordBrowserAnalyticsEvent/);
  assert.match(appEvents, /PUBLIC_BROWSER_INGESTION/);
  assert.match(appEvents, /recordServerAnalyticsEvent/);
  assert.match(appEvents, /recordInternalDiagnosticEvent/);
  assert.doesNotMatch(appEvents, /TRUSTED_SERVER_LIFECYCLE/);

  const appEventRoute = read("app/api/track/app-event/route.ts");
  assert.match(appEventRoute, /ingestBrowserAppEvent/);
  assert.match(appEventRoute, /recordBrowserAnalyticsEvent/);
  assert.doesNotMatch(appEventRoute, /trusted-app-events|TRUSTED_SERVER_LIFECYCLE/);
  assert.doesNotMatch(appEventRoute, /isAdminEmail|\.plan\s*===\s*["']pro["']/);

  const trustedAppEvents = read("lib/trusted-app-events.ts");
  assert.match(trustedAppEvents, /import "server-only"/);
  assert.match(trustedAppEvents, /trusted-app-event-core/);
  assert.match(trustedAppEvents, /recordTrustedLifecycleEvent/);
  assert.match(trustedAppEvents, /recordTrustedLifecycleEventInTransaction/);

  const trustedCore = read("lib/trusted-app-event-core.ts");
  assert.match(trustedCore, /buildTrustedLifecycleProvenance/);
  assert.match(trustedCore, /persistTrustedLifecycleEventWith/);

  const productionSources = ["app", "components", "features", "hooks", "lib"]
    .flatMap((directory) => walk(path.join(root, directory)))
    .filter((file) => /\.(ts|tsx)$/.test(file));
  const clientSources = productionSources
    .filter((file) => fs.readFileSync(file, "utf8").includes('"use client"'));
  for (const file of clientSources) {
    assert.deepEqual(
      filesImporting("lib/trusted-app-events.ts", [file]),
      [],
      file
    );
    assert.deepEqual(
      filesImporting("lib/trusted-app-event-core.ts", [file]),
      [],
      file
    );
  }
  const trustedEmitterImporters = filesImporting(
    "lib/trusted-app-events.ts",
    productionSources
  );
  assert.deepEqual(trustedEmitterImporters, ["app/api/stripe/webhook/route.ts"]);
  assert.deepEqual(
    filesImporting("lib/trusted-app-event-core.ts", productionSources),
    ["lib/trusted-app-events.ts"],
    "The server-only facade must remain the core's sole product importer."
  );
  const directTrustedPrismaWriters = productionSources
    .filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /appEvent\s*\.\s*(?:create|createMany|upsert|update|updateMany)\s*\(/.test(source) &&
        /authority\s*:\s*["']TRUSTED_SERVER_LIFECYCLE["']/.test(source);
    })
    .map((file) => path.relative(root, file));
  assert.deepEqual(directTrustedPrismaWriters, []);

  const stripeWebhook = read("app/api/stripe/webhook/route.ts");
  assert.match(stripeWebhook, /recordTrustedLifecycleEventInTransaction/);
  assert.match(stripeWebhook, /buildTrustedLifecycleProvenance/);
  assert.ok(
    stripeWebhook.indexOf("verifyStripeWebhookEnvelope(") <
      stripeWebhook.indexOf("buildTrustedLifecycleProvenance(trustedContext)"),
    "Trusted Stripe context must be constructed only after signature verification."
  );
  const invalidSignatureBlock = stripeWebhook.slice(
    stripeWebhook.indexOf("verifyStripeWebhookEnvelope("),
    stripeWebhook.indexOf("const trustedContext")
  );
  assert.doesNotMatch(invalidSignatureBlock, /recordTrustedLifecycleEvent|webhook_failed/);

  for (const billingSource of [
    "app/billing/success/CheckoutCompletedTracking.tsx",
    "app/billing/success/RefreshPlanButton.tsx",
  ]) {
    const source = read(billingSource);
    assert.match(source, /checkout_success_viewed/);
    assert.doesNotMatch(source, /upgrade_checkout_completed/);
  }

  const operationsData = read("app/admin/operations-data.ts");
  assert.match(operationsData, /trustedWebhookFailureWhere/);
  const operationsPolicy = read("lib/app-event-operations.ts");
  assert.match(operationsPolicy, /TRUSTED_SERVER_LIFECYCLE/);
  assert.match(operationsPolicy, /VERIFIED_STRIPE_WEBHOOK/);
  assert.match(operationsPolicy, /STRIPE_SIGNATURE/);
  assert.match(operationsPolicy, /APP_EVENT_PROVENANCE_VERSION/);
  assert.match(operationsPolicy, /externalEventId:\s*\{ startsWith: "evt_" \}/);
  const operationsDashboard = read("app/admin/OperationsDashboard.tsx");
  assert.match(operationsDashboard, /Non-authoritative customer analytics/);

  const appEventSchema = read("prisma/schema.prisma");
  assert.match(appEventSchema, /enum AppEventAuthority/);
  assert.match(appEventSchema, /authority\s+AppEventAuthority\s+@default\(UNTRUSTED_OR_LEGACY\)/);
  assert.match(appEventSchema, /producer\s+AppEventProducer\?/);
  assert.match(appEventSchema, /verificationMethod\s+AppEventVerificationMethod\?/);
  assert.match(appEventSchema, /provenanceVersion\s+Int\?/);
  assert.match(appEventSchema, /externalEventId\s+String\?/);

  const migration = read(
    "prisma/migrations/20260807090000_add_app_event_provenance/migration.sql"
  );
  assert.match(migration, /DEFAULT 'UNTRUSTED_OR_LEGACY'/);
  assert.match(migration, /AppEvent_trusted_provenance_check/);
  assert.match(migration, /"eventType" IN \([\s\S]*'upgrade_checkout_completed'[\s\S]*'subscription_canceled'[\s\S]*'webhook_failed'[\s\S]*'stripe_webhook_processed'/);
  assert.match(migration, /"producer" IS NOT DISTINCT FROM 'VERIFIED_STRIPE_WEBHOOK'/);
  assert.match(migration, /"verificationMethod" IS NOT DISTINCT FROM 'STRIPE_SIGNATURE'/);
  assert.match(migration, /"provenanceVersion" IS NOT DISTINCT FROM 1/);
  assert.match(migration, /"externalEventId" IS NOT NULL/);
  assert.match(migration, /externalEventId" ~ '\^evt_\[A-Za-z0-9_\]\+\$'/);
  assert.doesNotMatch(migration, /UPDATE\s+"AppEvent"/i);

  const persistence = read("lib/useDesignPagePersistence.ts");
  assert.doesNotMatch(persistence, /fetch\(`?\/api\/designs/);
  assert.match(persistence, /designApi\.update/);
  assert.match(persistence, /AbortController/);

  const client = read("lib/design-api-client.ts");
  assert.match(client, /MAX_RESPONSE_BYTES/);
  assert.match(client, /attempts = method === "GET" \? 2 : 1/);

  const cabinetDocumentIO = read(
    "features/cabinetry/infrastructure/CabinetStudioDocumentIO.ts"
  );
  assert.ok(
    cabinetDocumentIO.indexOf("validateCabinetSourceImportFile(file)") <
      cabinetDocumentIO.indexOf("await file.text()")
  );

  const sharedPdf = read("app/share/[shareToken]/export/pdf/route.ts");
  assert.doesNotMatch(sharedPdf, /email: true|user\?\.email/);

  const analyticsSources = ["app", "components", "lib"]
    .flatMap((directory) => walk(path.join(root, directory)))
    .filter((file) => /\.(ts|tsx)$/.test(file));
  for (const file of analyticsSources) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /share_token\s*:/, file);
  }
}

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

async function main() {
  await testRequestBoundary();
  testPrivacySanitization();
  testPostHogConfiguration();
  testAiContracts();
  testImportContracts();
  testAppEventProvenanceContract();
  testCertificationAppEventBinding();
  await testBrowserAppEventIngestion();
  await testTrustedEmitterCore();
  await testStripeWebhookSecurityBehavior();
  testSourceGuards();
  console.log("Phase 7 security boundary tests passed.");
}

void main();
