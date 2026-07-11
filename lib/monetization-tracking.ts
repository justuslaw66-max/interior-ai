/**
 * PostHog Monetization Funnel Tracking
 * 
 * Track export tiering and upgrade events.
 * Keep it clean - no extra noise.
 */

import { getPostHogClient } from "@/lib/posthog-server";
import { createHash } from "node:crypto";

export type MonetizationEvent =
  | "export_opened"
  | "export_pdf_clicked"
  | "export_upgrade_prompt_shown"
  | "upgrade_checkout_started"
  | "upgrade_checkout_completed"
  | "billing_portal_opened"
  | "subscription_canceled";

interface EventProperties {
  userId?: string;
  designId?: string;
  shareToken?: string;
  trigger?: "pdf" | "watermark" | "branding";
  plan?: "free" | "pro";
  insertId?: string;
  occurredAt?: Date;
}

export function monetizationUuidForInsertId(insertId: string) {
  const bytes = createHash("sha256").update(insertId).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Track monetization funnel event
 */
export async function trackMonetization(
  event: MonetizationEvent,
  userId: string,
  properties?: EventProperties
) {
  const posthog = getPostHogClient();
  const { insertId, occurredAt, ...eventProperties } = properties ?? {};
  const eventTimestamp = occurredAt ?? new Date();

  posthog.capture({
    distinctId: userId,
    event,
    timestamp: eventTimestamp,
    uuid: insertId ? monetizationUuidForInsertId(insertId) : undefined,
    properties: {
      ...eventProperties,
      ...(insertId ? { $insert_id: insertId } : {}),
      timestamp: eventTimestamp.toISOString(),
    },
  });

  await posthog.shutdown();
}

/**
 * Client-side tracking helper (for use in components)
 */
export function getClientTrackingCode(event: MonetizationEvent, properties?: EventProperties) {
  return `
    if (window.posthog) {
      window.posthog.capture('${event}', ${JSON.stringify(properties || {})});
    }
  `;
}
