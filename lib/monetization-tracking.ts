/**
 * PostHog Monetization Funnel Tracking
 * 
 * Track export tiering and upgrade events.
 * Keep it clean - no extra noise.
 */

import { getPostHogClient } from "@/lib/posthog-server";
import { sanitizeObservabilityMeta } from "@/lib/observability";

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
  trigger?: "pdf" | "watermark" | "branding";
  plan?: "free" | "pro";
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

  try {
    posthog.capture({
      distinctId: userId,
      event,
      properties: sanitizeObservabilityMeta({
        ...properties,
        timestamp: new Date().toISOString(),
      }),
    });
  } finally {
    await posthog.shutdown().catch(() => undefined);
  }
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
