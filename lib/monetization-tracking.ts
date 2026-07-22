/**
 * PostHog Monetization Funnel Tracking
 * 
 * Track export tiering and upgrade events.
 * Keep it clean - no extra noise.
 */

import { trackServerEvent } from "@/lib/server-analytics";

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
  trackServerEvent(event, userId, {
    ...properties,
    timestamp: new Date().toISOString(),
  });
}
