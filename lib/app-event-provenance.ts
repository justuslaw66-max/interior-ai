export const APP_EVENT_PROVENANCE_VERSION = 1 as const;

export const BROWSER_AUTHORIZED_ANALYTICS_EVENT_TYPES = [
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
] as const;

export const TRUSTED_SERVER_LIFECYCLE_EVENT_TYPES = [
  "upgrade_checkout_completed",
  "subscription_canceled",
  "webhook_failed",
  "stripe_webhook_processed",
] as const;

// Retained only to deny the historical browser-forgeable name explicitly.
// No current producer may emit this as authoritative evidence.
export const RESERVED_LEGACY_LIFECYCLE_EVENT_TYPES = ["checkout_completed"] as const;

export const INTERNAL_DIAGNOSTIC_EVENT_TYPES = [
  "checkout_variant_validation_failed",
  "variant_resolution_issue",
] as const;

export type BrowserAuthorizedAnalyticsEventType =
  (typeof BROWSER_AUTHORIZED_ANALYTICS_EVENT_TYPES)[number];
export type TrustedServerLifecycleEventType =
  (typeof TRUSTED_SERVER_LIFECYCLE_EVENT_TYPES)[number];
export type InternalDiagnosticEventType =
  (typeof INTERNAL_DIAGNOSTIC_EVENT_TYPES)[number];

export type VerifiedStripeWebhookContext = {
  producer: "VERIFIED_STRIPE_WEBHOOK";
  verificationMethod: "STRIPE_SIGNATURE";
  externalEventId: string;
};

export type TrustedLifecycleProvenance = {
  authority: "TRUSTED_SERVER_LIFECYCLE";
  producer: "VERIFIED_STRIPE_WEBHOOK";
  verificationMethod: "STRIPE_SIGNATURE";
  provenanceVersion: typeof APP_EVENT_PROVENANCE_VERSION;
  externalEventId: string;
};

type BrowserAnalyticsInput = {
  eventType: BrowserAuthorizedAnalyticsEventType;
  designId: unknown;
  shareToken: unknown;
  meta: Record<string, unknown> | null;
};

export type BrowserAnalyticsInputResult =
  | { ok: true; value: BrowserAnalyticsInput }
  | { ok: false; error: "invalid_event_type" | "reserved_provenance_field" };

const BROWSER_EVENT_TYPES = new Set<string>(BROWSER_AUTHORIZED_ANALYTICS_EVENT_TYPES);
const TRUSTED_EVENT_TYPES = new Set<string>(TRUSTED_SERVER_LIFECYCLE_EVENT_TYPES);
const RESERVED_PROVENANCE_KEYS = new Set([
  "authority",
  "provenance",
  "provenanceversion",
  "producer",
  "verificationmethod",
  "trusted",
  "trustedsource",
  "internalactor",
  "webhookidentity",
  "releaseevidenceauthority",
  "stripeeventid",
  "webhookeventid",
  "externaleventid",
  "verified",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function containsReservedProvenanceField(value: unknown): boolean {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, entry] of Object.entries(current)) {
      if (RESERVED_PROVENANCE_KEYS.has(normalizedKey(key))) return true;
      pending.push(entry);
    }
  }
  return false;
}

export function parseBrowserAnalyticsEventInput(value: unknown): BrowserAnalyticsInputResult {
  if (!isRecord(value) || typeof value.eventType !== "string") {
    return { ok: false, error: "invalid_event_type" };
  }
  if (!BROWSER_EVENT_TYPES.has(value.eventType)) {
    return { ok: false, error: "invalid_event_type" };
  }
  const extra = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !["eventType", "designId", "shareToken", "meta"].includes(key)
    )
  );
  if (containsReservedProvenanceField(extra) || containsReservedProvenanceField(value.meta)) {
    return { ok: false, error: "reserved_provenance_field" };
  }
  return {
    ok: true,
    value: {
      eventType: value.eventType as BrowserAuthorizedAnalyticsEventType,
      designId: value.designId,
      shareToken: value.shareToken,
      meta: isRecord(value.meta) ? value.meta : null,
    },
  };
}

export function buildTrustedLifecycleProvenance(
  context: unknown
): TrustedLifecycleProvenance {
  if (
    !isRecord(context) ||
    context.producer !== "VERIFIED_STRIPE_WEBHOOK" ||
    context.verificationMethod !== "STRIPE_SIGNATURE" ||
    !isVerifiedStripeEventId(context.externalEventId)
  ) {
    throw new Error("Verified trusted producer context is required.");
  }
  return {
    authority: "TRUSTED_SERVER_LIFECYCLE",
    producer: "VERIFIED_STRIPE_WEBHOOK",
    verificationMethod: "STRIPE_SIGNATURE",
    provenanceVersion: APP_EVENT_PROVENANCE_VERSION,
    externalEventId: context.externalEventId,
  };
}

export function isVerifiedStripeEventId(value: unknown): value is string {
  return typeof value === "string" && /^evt_[A-Za-z0-9_]+$/.test(value);
}

export function hasCurrentTrustedLifecycleProvenance(record: unknown): boolean {
  if (!isRecord(record) || typeof record.eventType !== "string") return false;
  return (
    TRUSTED_EVENT_TYPES.has(record.eventType) &&
    record.authority === "TRUSTED_SERVER_LIFECYCLE" &&
    record.producer === "VERIFIED_STRIPE_WEBHOOK" &&
    record.verificationMethod === "STRIPE_SIGNATURE" &&
    record.provenanceVersion === APP_EVENT_PROVENANCE_VERSION &&
    isVerifiedStripeEventId(record.externalEventId)
  );
}
